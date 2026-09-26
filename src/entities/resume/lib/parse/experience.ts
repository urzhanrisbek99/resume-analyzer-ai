import { findDateRanges, type DateRange } from '@/shared/lib/dates';
import { stableId } from '@/shared/lib/id';
import { normalize, squish, wordCount } from '@/shared/lib/text';

import type { ExperienceBullet, ExperienceItem } from '@/entities/resume/model/types';

/**
 * Experience parsing.
 *
 * Resumes write a job header in at least four orders:
 *
 *   Senior Engineer | Acme Inc | Jan 2020 - Present
 *   Acme Inc
 *   Senior Engineer
 *   2020 - 2023
 *   Senior Engineer, Acme (2020-2023)
 *   2020 - 2023   Acme Inc - Senior Engineer
 *
 * Rather than pattern-match each layout, the parser anchors on date ranges --
 * the one element every job entry has -- and then decides which of the remaining
 * fragments is the title and which is the employer, using a title vocabulary.
 * When it cannot tell, it records low confidence instead of guessing silently,
 * and the rule layer reports that the header is ambiguous.
 */

const BULLET_RE = /^\s*(?:[•·◦‣⁃▪▫⁃*+]|[-–—](?=\s))\s*/u;

/** Words that mark a fragment as a job title rather than an employer. */
const TITLE_KEYWORDS = [
  'engineer',
  'developer',
  'programmer',
  'architect',
  'lead',
  'manager',
  'director',
  'head',
  'designer',
  'analyst',
  'scientist',
  'consultant',
  'specialist',
  'administrator',
  'devops',
  'sre',
  'qa',
  'tester',
  'intern',
  'founder',
  'cto',
  'ceo',
  'vp',
  'owner',
  'scrum master',
  'team lead',
  'tech lead',
  'staff',
  'principal',
  'senior',
  'middle',
  'junior',
  'fullstack',
  'full stack',
  'frontend',
  'backend',
  'разработчик',
  'инженер',
  'менеджер',
  'аналитик',
  'дизайнер',
  'руководитель',
  'тимлид',
  'стажер',
  'ведущий',
  'старший',
];

/** Suffixes and markers that identify a fragment as an employer. */
const COMPANY_MARKERS = [
  'inc',
  'inc.',
  'llc',
  'ltd',
  'ltd.',
  'gmbh',
  'corp',
  'corp.',
  'co.',
  'company',
  'group',
  'holding',
  'bank',
  'technologies',
  'solutions',
  'systems',
  'labs',
  'studio',
  'agency',
  'consulting',
  'software',
  'ооо',
  'тоо',
  'ао',
  'зао',
  'ип',
  'банк',
  'компания',
  'группа',
];

const LOCATION_IN_HEADER_RE = /\b(?:remote|hybrid|on-?site|удаленно|гибрид)\b/i;

const HEADER_SEPARATOR = /\s*[|•·—–]\s*|\s{3,}|\s+[-–—]\s+|,\s+/;

interface IndexedSectionLine {
  text: string;
  /** Absolute offset into the whole document. */
  start: number;
  end: number;
  isBlank: boolean;
  isBullet: boolean;
  dateRange: DateRange | null;
}

/**
 * @param sectionText text of the experience section
 * @param sectionOffset absolute offset of `sectionText` inside the document, so
 *   every span points into `ResumeDocument.plainText`
 */
export function parseExperience(sectionText: string, sectionOffset: number): ExperienceItem[] {
  const lines = indexLines(sectionText, sectionOffset);
  const anchors = findAnchors(lines);

  if (anchors.length === 0) return parseWithoutDates(lines);

  return anchors.map((anchor, i) => {
    const nextAnchor = anchors[i + 1];
    const startLine = anchor.headerStart;
    const endLine = nextAnchor ? nextAnchor.headerStart - 1 : lines.length - 1;

    const entryLines = lines.slice(startLine, endLine + 1).filter((line) => !line.isBlank);
    const headerLines = entryLines.filter((line) => !line.isBullet).slice(0, 3);
    const header = parseHeader(headerLines, anchor.dateRange);

    const bullets = collectBullets(entryLines, headerLines);

    const first = entryLines[0];
    const last = entryLines[entryLines.length - 1];

    return {
      id: stableId('exp', header.company ?? '', header.title ?? '', anchor.dateRange.rawText, i),
      company: header.company,
      title: header.title,
      location: header.location,
      period: anchor.dateRange,
      bullets,
      span: { start: first?.start ?? sectionOffset, end: last?.end ?? sectionOffset },
      confidence: header.confidence,
    };
  });
}

function indexLines(sectionText: string, sectionOffset: number): IndexedSectionLine[] {
  const result: IndexedSectionLine[] = [];
  let offset = 0;

  for (const raw of sectionText.split('\n')) {
    const trimmed = raw.trim();
    const ranges = findDateRanges(raw);
    result.push({
      text: trimmed,
      start: sectionOffset + offset,
      end: sectionOffset + offset + raw.length,
      isBlank: trimmed.length === 0,
      isBullet: BULLET_RE.test(raw),
      dateRange: ranges[0] ?? null,
    });
    offset += raw.length + 1;
  }

  return result;
}

interface Anchor {
  dateRange: DateRange;
  /** Index of the first line belonging to this entry. */
  headerStart: number;
}

/**
 * A job entry is anchored on its date range. When the line above the date has no
 * date of its own and reads like a title or employer, it belongs to the entry --
 * that is the stacked layout, where company, title and dates are three lines.
 */
function findAnchors(lines: IndexedSectionLine[]): Anchor[] {
  const anchors: Anchor[] = [];

  lines.forEach((line, index) => {
    if (!line.dateRange || line.isBullet) return;
    // A date range inside prose is not a job header.
    if (wordCount(line.text) > 18) return;

    let headerStart = index;
    for (let back = index - 1; back >= headerStart - 2 && back >= 0; back -= 1) {
      const candidate = lines[back];
      if (!candidate || candidate.isBlank || candidate.isBullet || candidate.dateRange) break;
      if (wordCount(candidate.text) > 12) break;
      if (anchors.some((anchor) => anchor.headerStart >= back)) break;
      headerStart = back;
    }

    anchors.push({ dateRange: line.dateRange, headerStart });
  });

  return anchors;
}

interface HeaderParts {
  title: string | null;
  company: string | null;
  location: string | null;
  confidence: number;
}

function parseHeader(headerLines: IndexedSectionLine[], period: DateRange): HeaderParts {
  const fragments = headerLines
    .flatMap((line) => stripDate(line.text, period).split(HEADER_SEPARATOR))
    .map(squish)
    .filter((fragment) => fragment.length > 1 && fragment.length <= 90);

  if (fragments.length === 0) {
    return { title: null, company: null, location: null, confidence: 0.2 };
  }

  const location = fragments.find((fragment) => LOCATION_IN_HEADER_RE.test(fragment)) ?? null;
  const remaining = fragments.filter((fragment) => fragment !== location);

  const titleIndex = remaining.findIndex(looksLikeTitle);
  const companyIndex = remaining.findIndex(looksLikeCompany);

  // Both identified, and they are different fragments: highest confidence.
  if (titleIndex !== -1 && companyIndex !== -1 && titleIndex !== companyIndex) {
    return {
      title: remaining[titleIndex] ?? null,
      company: remaining[companyIndex] ?? null,
      location,
      confidence: 0.95,
    };
  }

  if (titleIndex !== -1) {
    const company = remaining.find((_, i) => i !== titleIndex) ?? null;
    return { title: remaining[titleIndex] ?? null, company, location, confidence: 0.75 };
  }

  if (companyIndex !== -1) {
    const title = remaining.find((_, i) => i !== companyIndex) ?? null;
    return { title, company: remaining[companyIndex] ?? null, location, confidence: 0.75 };
  }

  // Neither vocabulary matched. Title-then-company is the more common order, but
  // this is a guess and the confidence says so.
  return {
    title: remaining[0] ?? null,
    company: remaining[1] ?? null,
    location,
    confidence: remaining.length >= 2 ? 0.45 : 0.3,
  };
}

function stripDate(text: string, period: DateRange): string {
  const withoutRaw = text.replace(period.rawText, ' ');
  // Also remove any leftover standalone years and empty bracket pairs.
  return withoutRaw
    .replace(/\((?:\s*|\s*\d{4}\s*)\)/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function looksLikeTitle(fragment: string): boolean {
  const lower = normalize(fragment);
  return TITLE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function looksLikeCompany(fragment: string): boolean {
  const lower = normalize(fragment);
  if (
    COMPANY_MARKERS.some((marker) =>
      new RegExp(`(?:^|\\s|")${escape(marker)}(?:$|\\s|\\.)`).test(lower),
    )
  ) {
    return true;
  }
  // A quoted or capitalised single token with no title words reads as a brand.
  return /^["«].+["»]$/.test(fragment) && !looksLikeTitle(fragment);
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Bullets are the achievement lines. When an entry uses no markers at all, its
 * non-header lines are treated as bullets so content rules still have something
 * to measure -- a marker-free resume is a formatting problem, not a reason to
 * report zero achievements.
 */
function collectBullets(
  entryLines: IndexedSectionLine[],
  headerLines: IndexedSectionLine[],
): ExperienceBullet[] {
  const headerStarts = new Set(headerLines.map((line) => line.start));
  const marked = entryLines.filter((line) => line.isBullet);
  const source =
    marked.length > 0
      ? marked
      : entryLines.filter((line) => !headerStarts.has(line.start) && wordCount(line.text) >= 4);

  return source.map((line, i) => {
    const text = squish(line.text.replace(BULLET_RE, ''));
    const markerLength = line.text.length - line.text.replace(BULLET_RE, '').length;
    return {
      id: stableId('bul', text, i),
      text,
      span: { start: line.start + markerLength, end: line.end },
    };
  });
}

/**
 * Fallback for an experience section with no parseable dates: treat each
 * non-bullet line that is followed by bullets as an entry header.
 */
function parseWithoutDates(lines: IndexedSectionLine[]): ExperienceItem[] {
  const items: ExperienceItem[] = [];
  let current: { header: IndexedSectionLine; bullets: IndexedSectionLine[] } | null = null;

  const flush = () => {
    if (!current) return;
    const header = parseHeader([current.header], {
      start: null,
      end: null,
      isCurrent: false,
      rawText: '',
      format: 'unknown',
    });
    const bulletLines = current.bullets;
    const last = bulletLines[bulletLines.length - 1] ?? current.header;

    items.push({
      id: stableId('exp', header.company ?? '', header.title ?? '', items.length),
      company: header.company,
      title: header.title,
      location: header.location,
      period: null,
      bullets: collectBullets([current.header, ...bulletLines], [current.header]),
      span: { start: current.header.start, end: last.end },
      // No dates at all is a serious defect; reflect it in the confidence.
      confidence: Math.min(header.confidence, 0.4),
    });
    current = null;
  };

  for (const line of lines) {
    if (line.isBlank) continue;
    if (line.isBullet) {
      if (current) current.bullets.push(line);
      continue;
    }
    flush();
    current = { header: line, bullets: [] };
  }
  flush();

  return items;
}
