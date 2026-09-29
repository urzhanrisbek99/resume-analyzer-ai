import { findDateRanges } from '@/shared/lib/dates';
import { stableId } from '@/shared/lib/id';
import { normalize, squish, uppercaseRatio, wordCount } from '@/shared/lib/text';

import type { ResumeSection, SectionKind } from '@/entities/resume/model/types';

import type { PositionedLine } from '../extract/types';

import { classifyHeading } from './headings';

/**
 * Section segmentation.
 *
 * Two independent paths, and the second is the reason this tool works on resumes
 * that ignore every template:
 *
 *   1. Headings. Typography plus a bilingual vocabulary. Handles the 80% case.
 *   2. Content inference. When a document has no headings at all -- or only
 *      unrecognisable ones -- each block is classified by what is inside it:
 *      date ranges and bullets mean experience, a dense comma-separated token
 *      list means skills, degree vocabulary means education.
 *
 * Path 2 also repairs individual unlabelled sections left over from path 1, so a
 * resume that heads its job history "Чем я занимался" still scores correctly.
 */

export interface SegmentationResult {
  sections: ResumeSection[];
  /**
   * 0-1: the share of body text that landed in a confidently typed section.
   * The LLM segmenter is offered to the user when this is low.
   */
  confidence: number;
  usedContentInference: boolean;
}

interface IndexedLine {
  text: string;
  start: number;
  end: number;
  index: number;
  isBlank: boolean;
}

const MAX_HEADING_CHARS = 64;
const MAX_HEADING_WORDS = 7;
/** Below this, the caller should offer LLM segmentation. */
export const LOW_CONFIDENCE_THRESHOLD = 0.55;

export function segmentResume(
  plainText: string,
  positionedLines: PositionedLine[] = [],
): SegmentationResult {
  const lines = indexLines(plainText);
  const typography = buildTypographyIndex(positionedLines);

  const headings = findHeadings(lines, typography);

  if (headings.length === 0) {
    const sections = segmentByContent(plainText, lines);
    return {
      sections,
      confidence: coverageConfidence(sections, plainText.length),
      usedContentInference: true,
    };
  }

  const sections: ResumeSection[] = [];
  let order = 0;

  // Everything above the first heading is the header block: name, title, contacts.
  const firstHeading = headings[0]!;
  if (firstHeading.line.start > 0) {
    const text = plainText.slice(0, firstHeading.line.start).trim();
    if (text.length > 0) {
      sections.push({
        id: stableId('sec', 'contacts', 0),
        kind: 'contacts',
        rawHeading: null,
        span: { start: 0, end: firstHeading.line.start },
        text,
        confidence: 0.8,
        detectedBy: 'heuristic',
        order: order++,
      });
    }
  }

  let usedContentInference = false;

  headings.forEach((heading, i) => {
    const next = headings[i + 1];
    const bodyStart = heading.line.end + 1;
    const bodyEnd = next ? next.line.start : plainText.length;
    const text = plainText.slice(bodyStart, bodyEnd).trim();

    let kind = heading.kind;
    let confidence = heading.confidence;

    // An unrecognised heading is still a real boundary. Name it from content.
    if (kind === 'unknown' && text.length > 0) {
      const inferred = inferKind(text);
      if (inferred) {
        kind = inferred.kind;
        confidence = inferred.confidence * 0.9;
        usedContentInference = true;
      }
    }

    sections.push({
      id: stableId('sec', kind, heading.line.start, i),
      kind,
      rawHeading: squish(heading.line.text),
      span: { start: heading.line.start, end: bodyEnd },
      text,
      confidence,
      detectedBy: 'heuristic',
      order: order++,
    });
  });

  return {
    sections,
    confidence: coverageConfidence(sections, plainText.length),
    usedContentInference,
  };
}

function indexLines(plainText: string): IndexedLine[] {
  const result: IndexedLine[] = [];
  let offset = 0;
  plainText.split('\n').forEach((raw, index) => {
    result.push({
      text: raw,
      start: offset,
      end: offset + raw.length,
      index,
      isBlank: raw.trim().length === 0,
    });
    offset += raw.length + 1;
  });
  return result;
}

interface TypographyIndex {
  byText: Map<string, PositionedLine>;
  medianFontSize: number;
  /**
   * False for plain text and for PDFs that set everything in one weight and
   * size. Heading detection then has no typographic evidence to lean on and
   * falls back to structural cues instead.
   */
  hasSignal: boolean;
}

function buildTypographyIndex(positionedLines: PositionedLine[]): TypographyIndex {
  const byText = new Map<string, PositionedLine>();
  for (const line of positionedLines) {
    const key = normalize(line.text);
    if (key.length > 0 && !byText.has(key)) byText.set(key, line);
  }

  const sizes = positionedLines
    .map((line) => line.fontSizeRatio)
    .filter((size) => size > 0)
    .sort((a, b) => a - b);
  const medianFontSize = sizes.length > 0 ? (sizes[Math.floor(sizes.length / 2)] ?? 0) : 0;

  const anyBold = positionedLines.some((line) => line.isBold);
  const sizeVaries = sizes.length > 1 && (sizes[sizes.length - 1] ?? 0) > (sizes[0] ?? 0) * 1.1;

  return { byText, medianFontSize, hasSignal: anyBold || sizeVaries };
}

interface HeadingHit {
  line: IndexedLine;
  kind: SectionKind;
  confidence: number;
}

function findHeadings(lines: IndexedLine[], typography: TypographyIndex): HeadingHit[] {
  const hits: HeadingHit[] = [];
  const firstContentIndex = lines.findIndex((line) => !line.isBlank);

  lines.forEach((line, i) => {
    if (line.isBlank) return;

    const text = squish(line.text);
    if (text.length === 0 || text.length > MAX_HEADING_CHARS) return;

    const classified = classifyHeading(text);

    // A known heading needs no typographic corroboration.
    if (classified) {
      hits.push({ line, kind: classified.kind, confidence: classified.confidence });
      return;
    }

    if (!looksLikeHeading(text)) return;

    const previous = lines[i - 1];
    const following = lines.slice(i + 1).find((candidate) => !candidate.isBlank);
    const precededByBlank = !previous || previous.isBlank;
    const hasBodyBelow = following !== undefined && squish(following.text).length > 0;
    if (!precededByBlank || !hasBodyBelow) return;

    const positioned = typography.byText.get(normalize(text));
    const isEmphasised =
      positioned !== undefined &&
      (positioned.isBold ||
        (typography.medianFontSize > 0 &&
          positioned.fontSizeRatio > typography.medianFontSize * 1.15));

    const isShouted = uppercaseRatio(text) > 0.7;

    /*
     * With no typographic evidence anywhere in the document, "looks like a
     * heading" has to be decided structurally. A line qualifies when it is
     * short, sits alone after a blank line, and introduces a real block of
     * text. The very first line is excluded: that is the candidate's name,
     * which satisfies every other test.
     *
     * This is what makes lowercase, template-free resumes work -- headings
     * like "where i have been" carry no capitals and no vocabulary match.
     */
    const isStructuralHeading =
      !typography.hasSignal && i !== firstContentIndex && introducesBlock(lines, i);

    if (!isEmphasised && !isShouted && !isStructuralHeading) return;

    const confidence = isEmphasised ? 0.6 : isShouted ? 0.5 : 0.45;
    hits.push({ line, kind: 'unknown', confidence });
  });

  return dropSpuriousHeadings(hits);
}

/** Minimum body a structural heading must introduce to be believable. */
const MIN_BLOCK_LINES = 2;
const MIN_BLOCK_WORDS = 12;

/**
 * Whether the lines below `index` form a block substantial enough to be a
 * section body rather than the next line of a contact header.
 */
function introducesBlock(lines: IndexedLine[], index: number): boolean {
  let blockLines = 0;
  let blockWords = 0;

  for (let i = index + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) break;
    if (line.isBlank) {
      if (blockLines > 0) break;
      continue;
    }
    blockLines += 1;
    blockWords += wordCount(line.text);
    if (blockLines >= MIN_BLOCK_LINES || blockWords >= MIN_BLOCK_WORDS) return true;
  }

  return false;
}

/**
 * A heading names a topic. It is short, carries no sentence punctuation, and
 * holds no dates -- a bold "Senior Engineer, Acme (2021-2024)" is a job title.
 */
function looksLikeHeading(text: string): boolean {
  if (wordCount(text) > MAX_HEADING_WORDS) return false;
  if (/[.!?;,]$/.test(text)) return false;
  if (/@|https?:\/\//.test(text)) return false;
  if (findDateRanges(text).length > 0) return false;
  if (/\d{4}/.test(text)) return false;
  // Bullet glyphs mark list items, never headings.
  if (/^[•·◦‣⁃*]/u.test(text)) return false;
  return true;
}

/**
 * Two headings with nothing between them means the first one was a false
 * positive -- typically a bold job title immediately above a real heading.
 */
function dropSpuriousHeadings(hits: HeadingHit[]): HeadingHit[] {
  return hits.filter((hit, i) => {
    const next = hits[i + 1];
    if (!next) return true;
    const adjacent = next.line.index - hit.line.index <= 1;
    // Keep the one the vocabulary recognised.
    return !(adjacent && hit.kind === 'unknown' && next.kind !== 'unknown');
  });
}

/* ------------------------------------------------------------------------- */
/* Content inference: the path for resumes with no usable headings            */
/* ------------------------------------------------------------------------- */

const DEGREE_KEYWORDS = [
  'university',
  'institute',
  'college',
  'school',
  'academy',
  'bachelor',
  'master',
  'phd',
  'msc',
  'bsc',
  'mba',
  'faculty',
  'major',
  'gpa',
  'diploma',
  'университет',
  'институт',
  'академия',
  'колледж',
  'бакалавр',
  'магистр',
  'специалист',
  'аспирантура',
  'факультет',
  'кафедра',
  'специальность',
  'диплом',
];

const CERTIFICATE_KEYWORDS = [
  'certified',
  'certificate',
  'certification',
  'coursera',
  'udemy',
  'aws certified',
  'сертификат',
  'аттестат',
  'удостоверение',
];

const CEFR_RE = /\b[abc][12]\b/i;
const LANGUAGE_NAMES = [
  'english',
  'russian',
  'kazakh',
  'german',
  'french',
  'spanish',
  'chinese',
  'turkish',
  'английский',
  'русский',
  'казахский',
  'немецкий',
  'французский',
  'испанский',
  'китайский',
  'турецкий',
];

const CONTACT_RE = /[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s()-]{8,}|(?:linkedin|github|t\.me)\b/i;

export interface KindInference {
  kind: SectionKind;
  confidence: number;
}

/**
 * Classify a block of text by what it contains rather than by its heading.
 *
 * Order matters: the cheapest, most decisive signals are tested first, and
 * `experience` is checked before `education` because education blocks also carry
 * date ranges.
 */
export function inferKind(text: string): KindInference | null {
  const lower = normalize(text);
  const blockWords = wordCount(text);
  if (blockWords === 0) return null;

  const dateRanges = findDateRanges(text);
  const hits = (keywords: string[]) => keywords.filter((k) => lower.includes(k)).length;

  if (hits(LANGUAGE_NAMES) >= 2 && (CEFR_RE.test(text) || blockWords < 40)) {
    return { kind: 'languages', confidence: 0.8 };
  }

  if (hits(CERTIFICATE_KEYWORDS) >= 1 && blockWords < 120) {
    return { kind: 'certifications', confidence: 0.75 };
  }

  const degreeHits = hits(DEGREE_KEYWORDS);
  if (degreeHits >= 2) return { kind: 'education', confidence: 0.8 };

  const bulletCount = (text.match(/^\s*[•·◦‣⁃*-]\s+/gmu) ?? []).length;
  if (dateRanges.length >= 1 && (bulletCount >= 1 || blockWords > 40)) {
    return { kind: 'experience', confidence: dateRanges.length >= 2 ? 0.85 : 0.7 };
  }

  if (degreeHits === 1 && dateRanges.length >= 1) {
    return { kind: 'education', confidence: 0.65 };
  }

  // A skills block is a dense list: many separators, few verbs, short overall.
  const separators = (text.match(/[,;|•·]|\s{3,}/gu) ?? []).length;
  if (separators >= 4 && blockWords < 140 && separators / blockWords > 0.12) {
    return { kind: 'skills', confidence: 0.7 };
  }

  if (CONTACT_RE.test(text) && blockWords < 40) {
    return { kind: 'contacts', confidence: 0.7 };
  }

  // Prose with no dates and no lists, near the top, reads as a summary.
  if (dateRanges.length === 0 && separators <= 3 && blockWords >= 15 && blockWords <= 120) {
    return { kind: 'summary', confidence: 0.55 };
  }

  return null;
}

/** Split on blank lines, then name each block from its content. */
function segmentByContent(plainText: string, lines: IndexedLine[]): ResumeSection[] {
  const blocks: Array<{ start: number; end: number; text: string }> = [];
  let current: { start: number; end: number } | null = null;

  for (const line of lines) {
    if (line.isBlank) {
      if (current) {
        blocks.push({ ...current, text: plainText.slice(current.start, current.end) });
        current = null;
      }
      continue;
    }
    if (current) current.end = line.end;
    else current = { start: line.start, end: line.end };
  }
  if (current) blocks.push({ ...current, text: plainText.slice(current.start, current.end) });

  const sections: ResumeSection[] = [];
  let order = 0;

  blocks.forEach((block, i) => {
    const trimmed = block.text.trim();
    if (trimmed.length === 0) return;

    // The first block of a resume is the header, whatever it contains.
    const inferred =
      i === 0 ? { kind: 'contacts' as SectionKind, confidence: 0.7 } : inferKind(trimmed);

    sections.push({
      id: stableId('sec', inferred?.kind ?? 'unknown', block.start, i),
      kind: inferred?.kind ?? 'unknown',
      rawHeading: null,
      span: { start: block.start, end: block.end },
      text: trimmed,
      confidence: inferred?.confidence ?? 0.3,
      detectedBy: 'fallback',
      order: order++,
    });
  });

  return mergeAdjacentSameKind(sections);
}

/**
 * Consecutive blocks of the same kind are one section. Without this, a job
 * history written as one block per employer becomes five experience sections.
 */
function mergeAdjacentSameKind(sections: ResumeSection[]): ResumeSection[] {
  const merged: ResumeSection[] = [];

  for (const section of sections) {
    const previous = merged[merged.length - 1];
    const mergeable =
      previous !== undefined &&
      previous.kind === section.kind &&
      previous.kind !== 'contacts' &&
      previous.kind !== 'unknown';

    if (mergeable && previous) {
      previous.span = { start: previous.span.start, end: section.span.end };
      previous.text = `${previous.text}\n\n${section.text}`;
      previous.confidence = Math.max(previous.confidence, section.confidence);
      continue;
    }
    merged.push({ ...section, order: merged.length });
  }

  return merged;
}

/** Share of text sitting in a section whose kind was identified with confidence. */
function coverageConfidence(sections: ResumeSection[], totalLength: number): number {
  if (totalLength === 0) return 0;

  const confident = sections
    .filter((section) => section.kind !== 'unknown' && section.confidence >= 0.6)
    .reduce((sum, section) => sum + (section.span.end - section.span.start), 0);

  return Math.min(1, confident / totalLength);
}
