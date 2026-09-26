/**
 * Text primitives shared by extraction, segmentation and the rule engine.
 *
 * Everything here is pure and locale-aware for the two scripts this product
 * actually sees in resumes: Latin and Cyrillic.
 */

export interface TextSpan {
  /** Inclusive character offset into the owning plain-text document. */
  start: number;
  /** Exclusive character offset. */
  end: number;
}

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}+#./'-]*/gu;
const CYRILLIC_RE = /\p{Script=Cyrillic}/u;
const LATIN_RE = /\p{Script=Latin}/u;

/** Collapse all whitespace runs to single spaces and trim. */
export function squish(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/**
 * Normalise text for comparison: lowercase, strip diacritics, unify the
 * dash/quote zoo that PDF exports produce.
 */
export function normalize(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ')
    .toLowerCase()
    .trim();
}

export function words(input: string): string[] {
  return input.match(WORD_RE) ?? [];
}

export function wordCount(input: string): number {
  return words(input).length;
}

/**
 * Split into sentences. Deliberately conservative: resume bullets are often
 * fragments without terminal punctuation, so a line break also ends a sentence.
 */
export function sentences(input: string): string[] {
  return input
    .split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}])|\n+/gu)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function lines(input: string): string[] {
  return input.split(/\r?\n/);
}

export type ScriptName = 'latin' | 'cyrillic' | 'mixed' | 'unknown';

/** Which script dominates, and whether both are present in meaningful amounts. */
export function detectScript(input: string): { script: ScriptName; latinRatio: number } {
  let latin = 0;
  let cyrillic = 0;
  for (const char of input) {
    if (LATIN_RE.test(char)) latin += 1;
    else if (CYRILLIC_RE.test(char)) cyrillic += 1;
  }
  const total = latin + cyrillic;
  if (total === 0) return { script: 'unknown', latinRatio: 0 };

  const latinRatio = latin / total;
  if (latinRatio > 0.9) return { script: 'latin', latinRatio };
  if (latinRatio < 0.1) return { script: 'cyrillic', latinRatio };
  return { script: 'mixed', latinRatio };
}

/** Levenshtein distance, capped so long strings do not cost quadratic time. */
export function editDistance(a: string, b: string, max = 4): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const next: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (next[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
      next.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    prev = next;
  }
  return prev[b.length] ?? max + 1;
}

/** True when two tokens are the same word up to a small typo or inflection. */
export function looseEquals(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  const tolerance = Math.min(2, Math.floor(Math.max(na.length, nb.length) / 4));
  return tolerance > 0 && editDistance(na, nb, tolerance) <= tolerance;
}

/** Locate `needle` in `haystack` and return its span, or null when absent. */
export function findSpan(haystack: string, needle: string, from = 0): TextSpan | null {
  const index = haystack.indexOf(needle, from);
  if (index === -1) return null;
  return { start: index, end: index + needle.length };
}

/** Clamp a span to the bounds of a document, dropping empty results. */
export function clampSpan(span: TextSpan, length: number): TextSpan | null {
  const start = Math.max(0, Math.min(span.start, length));
  const end = Math.max(start, Math.min(span.end, length));
  return end > start ? { start, end } : null;
}

/** A short single-line excerpt, ellipsised in the middle when long. */
export function excerpt(input: string, maxLength = 120): string {
  const flat = squish(input);
  if (flat.length <= maxLength) return flat;
  const head = Math.ceil((maxLength - 1) / 2);
  const tail = Math.floor((maxLength - 1) / 2);
  return `${flat.slice(0, head)}…${flat.slice(flat.length - tail)}`;
}

export function titleCase(input: string): string {
  return input.replace(/\p{L}[\p{L}']*/gu, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
}

/** Share of characters that are uppercase letters, ignoring non-letters. */
export function uppercaseRatio(input: string): number {
  let upper = 0;
  let letters = 0;
  for (const char of input) {
    if (!/\p{L}/u.test(char)) continue;
    letters += 1;
    if (char === char.toUpperCase() && char !== char.toLowerCase()) upper += 1;
  }
  return letters === 0 ? 0 : upper / letters;
}
