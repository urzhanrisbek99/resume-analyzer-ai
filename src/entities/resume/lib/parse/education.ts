import { findDateRanges } from '@/shared/lib/dates';
import { stableId } from '@/shared/lib/id';
import { normalize, squish } from '@/shared/lib/text';

import type { EducationItem, LanguageProficiency } from '@/entities/resume/model/types';

/**
 * Education, certifications and language proficiency.
 *
 * Simpler than experience parsing: education blocks are short and the
 * institution is identifiable by vocabulary rather than by position.
 */

const INSTITUTION_MARKERS = [
  'university',
  'institute',
  'college',
  'school',
  'academy',
  'polytechnic',
  'universität',
  'universidad',
  'университет',
  'институт',
  'академия',
  'колледж',
  'училище',
  'школа',
];

const DEGREE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bph\.?\s?d\b|\bdoctorate\b|\bаспирантура\b|\bкандидат наук\b/i, label: 'PhD' },
  { pattern: /\bm\.?\s?sc\b|\bmaster'?s?\b|\bm\.?\s?a\b|\bмагистр\b/i, label: "Master's" },
  { pattern: /\bmba\b/i, label: 'MBA' },
  { pattern: /\bb\.?\s?sc\b|\bbachelor'?s?\b|\bb\.?\s?a\b|\bбакалавр\b/i, label: "Bachelor's" },
  { pattern: /\bспециалист\b|\bspecialist degree\b/i, label: 'Specialist' },
  { pattern: /\bassociate'?s?\b|\bсреднее специальное\b/i, label: 'Associate' },
];

const FIELD_MARKERS =
  /\b(?:major|faculty|specialt?y|field of study|специальность|факультет|направление|кафедра)\b\s*[:–-]?\s*(.+)/i;

export function parseEducation(sectionText: string, sectionOffset: number): EducationItem[] {
  const blocks = splitBlocks(sectionText, sectionOffset);

  return blocks
    .map((block, i): EducationItem | null => {
      const text = block.text.trim();
      if (text.length < 4) return null;

      const lines = text
        .split('\n')
        .map(squish)
        .filter((line) => line.length > 0);

      const institution =
        lines.find((line) => INSTITUTION_MARKERS.some((m) => normalize(line).includes(m))) ?? null;

      const degreeMatch = DEGREE_PATTERNS.find((entry) => entry.pattern.test(text));
      const fieldMatch = FIELD_MARKERS.exec(text);

      // Without an institution or a degree this block is not an education entry.
      if (!institution && !degreeMatch) return null;

      return {
        id: stableId('edu', institution ?? '', degreeMatch?.label ?? '', i),
        institution,
        degree: degreeMatch?.label ?? null,
        field: fieldMatch?.[1] ? squish(fieldMatch[1]).slice(0, 90) : null,
        period: findDateRanges(text)[0] ?? null,
        span: { start: block.start, end: block.end },
      };
    })
    .filter((item): item is EducationItem => item !== null);
}

const CERTIFICATE_LINE =
  /\b(?:certified|certificate|certification|coursera|udemy|udacity|pluralsight|aws certified|microsoft certified|google cloud certified|сертификат|удостоверение)\b/i;

export function parseCertifications(sectionText: string): string[] {
  return sectionText
    .split('\n')
    .map((line) => squish(line.replace(/^\s*[•·◦*\-–]\s*/u, '')))
    .filter((line) => line.length > 6 && line.length < 160)
    .filter((line) => CERTIFICATE_LINE.test(line) || /\b(?:19|20)\d{2}\b/.test(line))
    .slice(0, 30);
}

const CEFR_RE = /\b([ABC][12])\b/;
const LEVEL_WORDS =
  /\b(native|fluent|advanced|upper[- ]intermediate|intermediate|pre[- ]intermediate|elementary|basic|beginner|родной|свободный|продвинутый|средний|базовый|начальный)\b/i;

const LANGUAGE_NAMES: Record<string, string> = {
  english: 'English',
  английский: 'English',
  russian: 'Russian',
  русский: 'Russian',
  kazakh: 'Kazakh',
  казахский: 'Kazakh',
  german: 'German',
  немецкий: 'German',
  french: 'French',
  французский: 'French',
  spanish: 'Spanish',
  испанский: 'Spanish',
  chinese: 'Chinese',
  китайский: 'Chinese',
  turkish: 'Turkish',
  турецкий: 'Turkish',
  arabic: 'Arabic',
  арабский: 'Arabic',
};

/**
 * Language proficiency.
 *
 * Reported per language so the international-readiness rules can check that an
 * English level is stated at all -- a resume aimed at a foreign employer that
 * never mentions English forces the recruiter to guess, and they guess low.
 */
export function parseLanguages(sectionText: string, sectionOffset: number): LanguageProficiency[] {
  const found = new Map<string, LanguageProficiency>();
  let offset = 0;

  for (const raw of sectionText.split(/\n|[;,](?=\s*\p{Lu})/u)) {
    const line = squish(raw);
    const lineStart = sectionOffset + offset;
    offset += raw.length + 1;
    if (line.length === 0) continue;

    const lower = normalize(line);
    for (const [alias, canonical] of Object.entries(LANGUAGE_NAMES)) {
      if (!new RegExp(`(?<![\\p{L}])${alias}`, 'u').test(lower)) continue;
      if (found.has(canonical)) continue;

      const cefr = CEFR_RE.exec(line)?.[1] ?? null;
      const word = LEVEL_WORDS.exec(line)?.[1] ?? null;

      found.set(canonical, {
        language: canonical,
        level: cefr ?? (word ? squish(word) : null),
        span: { start: lineStart, end: lineStart + raw.length },
      });
    }
  }

  return [...found.values()];
}

interface Block {
  text: string;
  start: number;
  end: number;
}

/** Split on blank lines; fall back to single lines when the block has none. */
function splitBlocks(sectionText: string, sectionOffset: number): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  let offset = 0;

  for (const raw of sectionText.split('\n')) {
    const start = sectionOffset + offset;
    const end = start + raw.length;
    offset += raw.length + 1;

    if (raw.trim().length === 0) {
      if (current) blocks.push(current);
      current = null;
      continue;
    }
    if (current) {
      current.text += `\n${raw}`;
      current.end = end;
    } else {
      current = { text: raw, start, end };
    }
  }
  if (current) blocks.push(current);

  return blocks;
}
