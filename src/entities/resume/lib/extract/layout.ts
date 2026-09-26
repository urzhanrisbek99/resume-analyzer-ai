import { normalize, squish } from '@/shared/lib/text';

import { PROBLEMATIC_GLYPHS, SAFE_FONT_KEYWORDS, type PositionedLine } from './types';

/**
 * Layout forensics over positioned lines.
 *
 * ATS parsers read a PDF as a single stream in drawing order. Anything that
 * relies on two-dimensional placement -- columns, tables, margin boxes -- comes
 * out interleaved and unreadable. These helpers detect exactly that, from
 * geometry rather than from guesses about the template.
 */

const HEADER_ZONE = 0.075;
const FOOTER_ZONE = 0.925;

export interface ColumnAnalysis {
  maxColumnsPerPage: number;
  multiColumnPages: number[];
}

/**
 * Detect multi-column body text by looking for a vertical gutter: a band of x
 * that no line crosses, with substantial text on both sides.
 */
export function analyseColumns(lines: PositionedLine[]): ColumnAnalysis {
  const pages = new Map<number, PositionedLine[]>();
  for (const line of lines) {
    if (line.y < HEADER_ZONE || line.y > FOOTER_ZONE) continue;
    const bucket = pages.get(line.page);
    if (bucket) bucket.push(line);
    else pages.set(line.page, [line]);
  }

  const multiColumnPages: number[] = [];
  let maxColumns = 1;

  for (const [page, pageLines] of pages) {
    // Short pages (a header block, a thin footer page) carry no column signal.
    if (pageLines.length < 8) continue;

    const columns = countColumns(pageLines);
    if (columns > 1) multiColumnPages.push(page);
    if (columns > maxColumns) maxColumns = columns;
  }

  return {
    maxColumnsPerPage: maxColumns,
    multiColumnPages: multiColumnPages.sort((a, b) => a - b),
  };
}

const SAMPLE_STEP = 0.01;
const MIN_GUTTER_WIDTH = 0.05;
const GUTTER_SEARCH_MIN = 0.22;
const GUTTER_SEARCH_MAX = 0.78;
/** A gutter is only real if both sides carry a meaningful share of the lines. */
const MIN_SIDE_SHARE = 0.2;

function countColumns(pageLines: PositionedLine[]): number {
  const samples = Math.round(1 / SAMPLE_STEP);
  const coverage = new Array<number>(samples).fill(0);

  for (const line of pageLines) {
    const from = Math.max(0, Math.floor(line.x / SAMPLE_STEP));
    const to = Math.min(samples - 1, Math.ceil((line.x + line.width) / SAMPLE_STEP));
    for (let i = from; i <= to; i += 1) coverage[i] = (coverage[i] ?? 0) + 1;
  }

  const gutters: Array<[number, number]> = [];
  let runStart: number | null = null;
  for (let i = 0; i < samples; i += 1) {
    const isEmpty = (coverage[i] ?? 0) === 0;
    if (isEmpty && runStart === null) runStart = i;
    if (!isEmpty && runStart !== null) {
      gutters.push([runStart, i - 1]);
      runStart = null;
    }
  }
  if (runStart !== null) gutters.push([runStart, samples - 1]);

  let columns = 1;
  for (const [start, end] of gutters) {
    const from = start * SAMPLE_STEP;
    const to = (end + 1) * SAMPLE_STEP;
    if (to - from < MIN_GUTTER_WIDTH) continue;
    if (to < GUTTER_SEARCH_MIN || from > GUTTER_SEARCH_MAX) continue;

    const left = pageLines.filter((line) => line.x + line.width <= from).length;
    const right = pageLines.filter((line) => line.x >= to).length;
    const total = pageLines.length;
    if (left / total >= MIN_SIDE_SHARE && right / total >= MIN_SIDE_SHARE) {
      columns = Math.max(columns, 2);
    }
  }

  return columns;
}

export interface HeaderFooterAnalysis {
  hasHeaderFooterContent: boolean;
  samples: string[];
  /** Line texts that belong to page furniture and should leave the body text. */
  excludedTexts: Set<string>;
}

/**
 * Content in the top or bottom margin that repeats across pages is page
 * furniture. When contact details live there, an ATS commonly drops them.
 */
export function analyseHeaderFooter(
  lines: PositionedLine[],
  pageCount: number,
): HeaderFooterAnalysis {
  const marginLines = lines.filter((line) => line.y < HEADER_ZONE || line.y > FOOTER_ZONE);

  const byText = new Map<string, Set<number>>();
  for (const line of marginLines) {
    const key = normalize(line.text);
    if (key.length < 3) continue;
    const pages = byText.get(key);
    if (pages) pages.add(line.page);
    else byText.set(key, new Set([line.page]));
  }

  const samples: string[] = [];
  const excludedTexts = new Set<string>();

  for (const [key, pages] of byText) {
    // Repetition across pages, or -- on a one-pager -- anything at all up there.
    const repeats = pages.size >= 2;
    const singlePage = pageCount === 1 && pages.size === 1;
    if (!repeats && !singlePage) continue;

    const original = marginLines.find((line) => normalize(line.text) === key);
    if (!original) continue;

    // Bare page numbers are harmless furniture; do not report them as a defect.
    if (/^\s*(?:page\s*)?\d+\s*(?:\/\s*\d+)?\s*$/i.test(original.text)) {
      excludedTexts.add(original.text);
      continue;
    }

    if (repeats) {
      samples.push(squish(original.text));
      excludedTexts.add(original.text);
    }
  }

  return {
    hasHeaderFooterContent: samples.length > 0,
    samples: samples.slice(0, 5),
    excludedTexts,
  };
}

/**
 * Count rows that look tabular: several text runs on one baseline separated by
 * wide gaps. This catches borderless tables, which draw no rectangles at all
 * and therefore hide from graphics-based detection.
 */
export function countTabularRows(lines: PositionedLine[]): number {
  return lines.filter((line) => line.innerGaps >= 2).length;
}

export function collectFontIssues(fontFamilies: Iterable<string>): {
  fontFamilies: string[];
  nonStandardFonts: string[];
} {
  const families = [...new Set([...fontFamilies].map((f) => squish(f)).filter(Boolean))];
  const nonStandard = families.filter((family) => {
    const key = normalize(family).replace(/[^a-z ]/g, '');
    return !SAFE_FONT_KEYWORDS.some((safe) => key.includes(safe));
  });
  return { fontFamilies: families.sort(), nonStandardFonts: nonStandard.sort() };
}

export function findProblematicGlyphs(text: string): string[] {
  const found = new Set<string>();
  for (const glyph of PROBLEMATIC_GLYPHS) {
    if (text.includes(glyph)) found.add(glyph);
  }
  // Private-use area: a subset font whose glyphs have no Unicode meaning.
  if (/[-]/u.test(text)) found.add('private-use-area');
  return [...found];
}
