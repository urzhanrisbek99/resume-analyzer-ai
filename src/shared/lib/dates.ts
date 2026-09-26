/**
 * Resume date parsing.
 *
 * Resumes express periods in a dozen shapes across two languages, and career
 * rules (tenure, gaps, progression) are only as good as this parser. It returns
 * a normalised value plus the raw text and a format tag, so the engine can also
 * report *inconsistent* date formatting.
 */

export interface YearMonth {
  year: number;
  /** 1-12, or null when the source only gave a year. */
  month: number | null;
}

export type DateFormatTag =
  'month-name-year' | 'numeric-month-year' | 'year-only' | 'iso' | 'unknown';

export interface DateRange {
  start: YearMonth | null;
  end: YearMonth | null;
  /** True for "Present", "Current", "н.в.", "по настоящее время". */
  isCurrent: boolean;
  rawText: string;
  format: DateFormatTag;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  janv: 1,
  feb: 2,
  february: 2,
  febr: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
  // Russian, both nominative and genitive forms as they appear in resumes.
  янв: 1,
  январь: 1,
  января: 1,
  фев: 2,
  февраль: 2,
  февраля: 2,
  мар: 3,
  март: 3,
  марта: 3,
  апр: 4,
  апрель: 4,
  апреля: 4,
  май: 5,
  мая: 5,
  июн: 6,
  июнь: 6,
  июня: 6,
  июл: 7,
  июль: 7,
  июля: 7,
  авг: 8,
  август: 8,
  августа: 8,
  сен: 9,
  сент: 9,
  сентябрь: 9,
  сентября: 9,
  окт: 10,
  октябрь: 10,
  октября: 10,
  ноя: 11,
  нояб: 11,
  ноябрь: 11,
  ноября: 11,
  дек: 12,
  декабрь: 12,
  декабря: 12,
};

const CURRENT_MARKERS = [
  'present',
  'current',
  'now',
  'today',
  'ongoing',
  'till now',
  'to date',
  'по настоящее время',
  'настоящее время',
  'по сей день',
  'н.в.',
  'нв',
  'сейчас',
  'текущее время',
];

/** Any of the dash-ish separators a range may use, including the word forms. */
const RANGE_SEPARATOR = /\s*(?:[-\u2010-\u2015\u2212~]|--|to\b|\u0434\u043e\b|\u043f\u043e\b)\s*/iu;

const MIN_YEAR = 1950;
const MAX_YEAR = 2100;

function cleanToken(input: string): string {
  return input
    .toLowerCase()
    .replace(/\u00a0/gu, ' ')
    .replace(/[.,;]+$/g, '')
    .trim();
}

function plausibleYear(value: number): boolean {
  return value >= MIN_YEAR && value <= MAX_YEAR;
}

function isCurrentMarker(input: string): boolean {
  const token = cleanToken(input).replace(/\s+/g, ' ');
  return CURRENT_MARKERS.some((marker) => token === marker || token.startsWith(marker));
}

/** Parse one endpoint of a range: "Mar 2021", "03/2021", "2021", "2021-03". */
export function parseYearMonth(input: string): { value: YearMonth; format: DateFormatTag } | null {
  const token = cleanToken(input);
  if (token.length === 0) return null;

  // ISO-ish: 2021-03 or 2021.03
  const iso = /^(\d{4})[-.\/](\d{1,2})$/.exec(token);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    if (plausibleYear(year) && month >= 1 && month <= 12) {
      return { value: { year, month }, format: 'iso' };
    }
  }

  // Numeric month first: 03/2021, 3.2021, 03-2021
  const numeric = /^(\d{1,2})[-.\/](\d{4})$/.exec(token);
  if (numeric) {
    const month = Number(numeric[1]);
    const year = Number(numeric[2]);
    if (plausibleYear(year) && month >= 1 && month <= 12) {
      return { value: { year, month }, format: 'numeric-month-year' };
    }
  }

  // Month name in either order: "March 2021", "2021 март"
  const named = /^([\p{L}]+)\.?\s+(\d{4})$|^(\d{4})\s+([\p{L}]+)\.?$/u.exec(token);
  if (named) {
    const name = (named[1] ?? named[4] ?? '').replace(/\.$/, '');
    const year = Number(named[2] ?? named[3]);
    const month = MONTHS[name];
    if (month !== undefined && plausibleYear(year)) {
      return { value: { year, month }, format: 'month-name-year' };
    }
  }

  // Bare year.
  const bare = /^(\d{4})$/.exec(token);
  if (bare) {
    const year = Number(bare[1]);
    if (plausibleYear(year)) return { value: { year, month: null }, format: 'year-only' };
  }

  return null;
}

/**
 * Parse a full period. Returns null when the text holds no recognisable date,
 * so callers can fall back to other signals rather than inventing a range.
 */
export function parseDateRange(input: string): DateRange | null {
  const raw = input.trim();
  if (raw.length === 0) return null;

  const parts = raw.split(RANGE_SEPARATOR).filter((p) => p.trim().length > 0);

  if (parts.length >= 2) {
    const startParsed = parseYearMonth(parts[0]!);
    const endRaw = parts.slice(1).join(' ');
    const current = isCurrentMarker(endRaw);
    const endParsed = current ? null : parseYearMonth(parts[1]!);

    if (startParsed && (current || endParsed)) {
      return {
        start: startParsed.value,
        end: endParsed?.value ?? null,
        isCurrent: current,
        rawText: raw,
        format: startParsed.format,
      };
    }
  }

  // Single endpoint: "Since 2021", "2021", "Present".
  if (isCurrentMarker(raw)) {
    return { start: null, end: null, isCurrent: true, rawText: raw, format: 'unknown' };
  }
  const single = parseYearMonth(raw);
  if (single) {
    return {
      start: single.value,
      end: single.value,
      isCurrent: false,
      rawText: raw,
      format: single.format,
    };
  }

  return null;
}

/** Find every date range mentioned in a block of text, in order. */
export function findDateRanges(text: string): DateRange[] {
  const pattern = new RegExp(
    String.raw`(?:\p{L}{3,10}\.?\s+)?\d{4}(?:[-.\/]\d{1,2})?` +
      String.raw`\s*(?:[-\u2010-\u2015\u2212~]|--|to|\u0434\u043e|\u043f\u043e)\s*` +
      String.raw`(?:(?:\p{L}{3,10}\.?\s+)?\d{4}(?:[-.\/]\d{1,2})?|` +
      String.raw`present|current|now|ongoing|настоящее время|по настоящее время|н\.в\.)`,
    'giu',
  );
  const found: DateRange[] = [];
  for (const match of text.matchAll(pattern)) {
    const parsed = parseDateRange(match[0]);
    if (parsed) found.push(parsed);
  }
  return found;
}

export function toMonthIndex(value: YearMonth): number {
  return value.year * 12 + (value.month ?? 1) - 1;
}

export function nowYearMonth(reference: Date = new Date()): YearMonth {
  return { year: reference.getUTCFullYear(), month: reference.getUTCMonth() + 1 };
}

/** Inclusive month count of a range; 0 when the range cannot be measured. */
export function rangeMonths(range: DateRange, reference: Date = new Date()): number {
  const start = range.start;
  if (!start) return 0;
  const end = range.isCurrent ? nowYearMonth(reference) : range.end;
  if (!end) return 0;
  return Math.max(0, toMonthIndex(end) - toMonthIndex(start) + 1);
}

export interface EmploymentGap {
  afterMonthIndex: number;
  beforeMonthIndex: number;
  months: number;
}

/**
 * Merge overlapping periods, then report the holes between them. Overlaps are
 * normal (parallel contracts) and must not be reported as gaps.
 */
export function findGaps(ranges: DateRange[], minMonths = 4): EmploymentGap[] {
  const intervals = ranges
    .map((range) => {
      if (!range.start) return null;
      const end = range.isCurrent ? nowYearMonth() : range.end;
      if (!end) return null;
      return [toMonthIndex(range.start), toMonthIndex(end)] as const;
    })
    .filter((v): v is readonly [number, number] => v !== null)
    .sort((a, b) => a[0] - b[0]);

  if (intervals.length < 2) return [];

  const merged: Array<[number, number]> = [[intervals[0]![0], intervals[0]![1]]];
  for (const [start, end] of intervals.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }

  const gaps: EmploymentGap[] = [];
  for (let i = 1; i < merged.length; i += 1) {
    const previousEnd = merged[i - 1]![1];
    const nextStart = merged[i]![0];
    const months = nextStart - previousEnd - 1;
    if (months >= minMonths) {
      gaps.push({ afterMonthIndex: previousEnd, beforeMonthIndex: nextStart, months });
    }
  }
  return gaps;
}

/** Total months covered by the union of all ranges (no double counting). */
export function totalMonths(ranges: DateRange[], reference: Date = new Date()): number {
  const intervals = ranges
    .map((range) => {
      if (!range.start) return null;
      const end = range.isCurrent ? nowYearMonth(reference) : range.end;
      if (!end) return null;
      return [toMonthIndex(range.start), toMonthIndex(end)] as const;
    })
    .filter((v): v is readonly [number, number] => v !== null)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let cursor = -Infinity;
  for (const [start, end] of intervals) {
    const from = Math.max(start, cursor + 1);
    if (end >= from) {
      total += end - from + 1;
      cursor = end;
    }
  }
  return total;
}

export function formatYearMonth(value: YearMonth): string {
  return value.month === null
    ? String(value.year)
    : `${String(value.month).padStart(2, '0')}.${value.year}`;
}

export function formatMonths(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} мес.`;
  if (rest === 0) return `${years} г.`;
  return `${years} г. ${rest} мес.`;
}
