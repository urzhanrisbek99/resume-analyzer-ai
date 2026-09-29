import { findGaps, rangeMonths, totalMonths, type DateRange } from '@/shared/lib/dates';
import { normalize, sentences, squish, wordCount, type TextSpan } from '@/shared/lib/text';

import type { ExperienceBullet, ResumeDocument } from '@/entities/resume/@x/analysis';

import type {
  BulletMetrics,
  ConsistencyMetrics,
  ResumeMetrics,
  TenureMetrics,
} from '@/entities/analysis/model/types';

import {
  ACTION_VERBS,
  CLICHES,
  FIRST_PERSON,
  PASSIVE_MARKERS,
  QUANTIFICATION,
  SENIORITY_TITLES,
  WEAK_OPENINGS,
} from './dictionaries/language';

/**
 * Metrics are computed once and handed to every rule.
 *
 * Rules stay cheap and readable because none of them re-walks the document, and
 * the numbers they judge are the same numbers the UI shows -- so a score and the
 * panel explaining it can never disagree.
 */

/** A bullet longer than this stops being scanned and starts being skipped. */
const OVERLONG_BULLET_WORDS = 34;
const STUB_BULLET_WORDS = 4;
const LONG_SENTENCE_WORDS = 28;
/** Below this, a stint reads as job hopping to most recruiters. */
export const SHORT_STINT_MONTHS = 12;

const ACTION_VERB_SET = new Set(ACTION_VERBS.map((verb) => normalize(verb)));

export function computeMetrics(resume: ResumeDocument): ResumeMetrics {
  const allBullets = resume.experience.flatMap((item) => item.bullets);

  return {
    wordCount: wordCount(resume.plainText),
    characterCount: resume.plainText.length,
    pageCount: resume.layout.pageCount,
    sectionCount: resume.sections.filter((section) => section.kind !== 'unknown').length,
    bullets: bulletMetrics(allBullets),
    tenure: tenureMetrics(resume),
    consistency: consistencyMetrics(resume, allBullets),
    skillCount: resume.skills.length,
    clicheHits: findCliches(resume.plainText),
    ...sentenceMetrics(resume.plainText),
    impliedSeniority: impliedSeniority(resume),
  };
}

function bulletMetrics(bullets: ExperienceBullet[]): BulletMetrics {
  let quantified = 0;
  let actionVerbLed = 0;
  let weakOpening = 0;
  let firstPerson = 0;
  let passive = 0;
  let overlong = 0;
  let stub = 0;
  let words = 0;

  for (const bullet of bullets) {
    const text = bullet.text;
    const count = wordCount(text);
    words += count;

    if (count > OVERLONG_BULLET_WORDS) overlong += 1;
    if (count < STUB_BULLET_WORDS) stub += 1;
    if (isQuantified(text)) quantified += 1;
    if (startsWithActionVerb(text)) actionVerbLed += 1;
    if (hasWeakOpening(text)) weakOpening += 1;
    if (FIRST_PERSON.some((pattern) => pattern.test(text))) firstPerson += 1;
    if (PASSIVE_MARKERS.some((pattern) => pattern.test(text))) passive += 1;
  }

  return {
    total: bullets.length,
    quantified,
    actionVerbLed,
    weakOpening,
    firstPerson,
    passive,
    overlong,
    stub,
    averageWords: bullets.length === 0 ? 0 : Math.round((words / bullets.length) * 10) / 10,
  };
}

export function isQuantified(text: string): boolean {
  return QUANTIFICATION.some((pattern) => pattern.test(text));
}

export function startsWithActionVerb(text: string): boolean {
  const first = normalize(text).split(/[\s,]+/)[0] ?? '';
  return ACTION_VERB_SET.has(first);
}

export function hasWeakOpening(text: string): boolean {
  // Only the opening matters: "reduced latency by working on X" is fine.
  const opening = normalize(text).slice(0, 40);
  return WEAK_OPENINGS.some((phrase) => opening.startsWith(normalize(phrase)));
}

function tenureMetrics(resume: ResumeDocument): TenureMetrics {
  const periods = resume.experience
    .map((item) => item.period)
    .filter((period): period is DateRange => period !== null);

  const durations = periods.map((period) => rangeMonths(period)).filter((months) => months > 0);
  const total = totalMonths(periods);

  return {
    totalMonths: total,
    averageMonths: durations.length === 0 ? 0 : Math.round(total / durations.length),
    shortestMonths: durations.length === 0 ? 0 : Math.min(...durations),
    jobCount: resume.experience.length,
    shortStints: durations.filter((months) => months < SHORT_STINT_MONTHS).length,
    gaps: findGaps(periods),
    progression: titleProgression(resume),
  };
}

const SENIORITY_RANK: Record<string, number> = { junior: 1, middle: 2, senior: 3, lead: 4 };

/**
 * Whether titles trend upward over time.
 *
 * Experience is listed newest-first by convention, so a rising career reads as
 * a falling rank down the page. When titles carry no seniority words at all the
 * answer is "unclear", never "flat" -- an absent signal is not a negative one.
 */
function titleProgression(resume: ResumeDocument): TenureMetrics['progression'] {
  const ranks = resume.experience
    .map((item) => (item.title ? seniorityOf(item.title) : null))
    .filter((rank): rank is number => rank !== null);

  if (ranks.length < 2) return 'unclear';

  const newest = ranks[0]!;
  const oldest = ranks[ranks.length - 1]!;
  if (newest > oldest) return 'up';
  if (newest < oldest) return 'down';
  return 'flat';
}

function seniorityOf(title: string): number | null {
  const lower = normalize(title);
  for (const [level, keywords] of Object.entries(SENIORITY_TITLES)) {
    if (keywords.some((keyword) => lower.includes(keyword))) return SENIORITY_RANK[level] ?? null;
  }
  return null;
}

function impliedSeniority(resume: ResumeDocument): ResumeMetrics['impliedSeniority'] {
  const titles = resume.experience
    .map((item) => item.title)
    .filter((title): title is string => title !== null);

  let best = 0;
  for (const title of titles) best = Math.max(best, seniorityOf(title) ?? 0);

  if (best > 0) {
    const entry = Object.entries(SENIORITY_RANK).find(([, rank]) => rank === best);
    if (entry) return entry[0] as ResumeMetrics['impliedSeniority'];
  }

  // Fall back to total experience when no title says anything.
  const years =
    totalMonths(
      resume.experience.map((item) => item.period).filter((p): p is DateRange => p !== null),
    ) / 12;
  if (years === 0) return 'unknown';
  if (years < 2) return 'junior';
  if (years < 5) return 'middle';
  return 'senior';
}

const BULLET_MARKERS = ['•', '·', '◦', '‣', '⁃', '-', '*', '–'];

function consistencyMetrics(
  resume: ResumeDocument,
  bullets: ExperienceBullet[],
): ConsistencyMetrics {
  const dateFormats = new Set<string>();
  for (const item of resume.experience) {
    if (item.period && item.period.format !== 'unknown') dateFormats.add(item.period.format);
  }
  for (const item of resume.education) {
    if (item.period && item.period.format !== 'unknown') dateFormats.add(item.period.format);
  }

  const markers = new Set<string>();
  for (const line of resume.plainText.split('\n')) {
    const trimmed = line.trimStart();
    const first = trimmed[0];
    if (first && BULLET_MARKERS.includes(first) && /\s/.test(trimmed[1] ?? '')) markers.add(first);
  }

  const withPeriod = bullets.filter((bullet) => /[.!?]$/.test(bullet.text.trim())).length;
  const withoutPeriod = bullets.length - withPeriod;

  return {
    dateFormats: [...dateFormats],
    bulletMarkers: [...markers],
    // Only a genuine mix counts: a couple of stragglers is not an inconsistency.
    mixedBulletPunctuation: bullets.length >= 4 && withPeriod >= 2 && withoutPeriod >= 2,
    mixedTense: hasMixedTense(resume),
  };
}

const PRESENT_TENSE_RE = /\b\w+(?:s|ing)\b/;
const PAST_TENSE_RE = /\b\w+ed\b/;

/**
 * Tense mixing inside a single finished role. Present tense is correct for the
 * current job, so only past roles are examined.
 */
function hasMixedTense(resume: ResumeDocument): boolean {
  for (const item of resume.experience) {
    if (!item.period || item.period.isCurrent) continue;
    if (item.bullets.length < 3) continue;

    let past = 0;
    let present = 0;
    for (const bullet of item.bullets) {
      const opening = bullet.text.split(/\s+/).slice(0, 3).join(' ');
      if (PAST_TENSE_RE.test(opening)) past += 1;
      else if (PRESENT_TENSE_RE.test(opening)) present += 1;
    }
    if (past >= 2 && present >= 2) return true;
  }
  return false;
}

function findCliches(plainText: string): Array<{ phrase: string; span: TextSpan }> {
  const lower = normalize(plainText);
  const hits: Array<{ phrase: string; span: TextSpan }> = [];

  for (const cliche of CLICHES) {
    const needle = normalize(cliche);
    let from = 0;
    for (;;) {
      const index = lower.indexOf(needle, from);
      if (index === -1) break;
      hits.push({ phrase: cliche, span: { start: index, end: index + needle.length } });
      from = index + needle.length;
      // One example per phrase is enough to make the point.
      break;
    }
  }

  return hits;
}

function sentenceMetrics(plainText: string): {
  averageSentenceWords: number;
  longSentences: number;
} {
  const all = sentences(plainText).filter((sentence) => wordCount(sentence) >= 3);
  if (all.length === 0) return { averageSentenceWords: 0, longSentences: 0 };

  const counts = all.map((sentence) => wordCount(squish(sentence)));
  const sum = counts.reduce((total, count) => total + count, 0);

  return {
    averageSentenceWords: Math.round((sum / counts.length) * 10) / 10,
    longSentences: counts.filter((count) => count > LONG_SENTENCE_WORDS).length,
  };
}
