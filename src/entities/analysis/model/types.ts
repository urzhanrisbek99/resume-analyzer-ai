import type { EmploymentGap } from '@/shared/lib/dates';
import type { TextSpan } from '@/shared/lib/text';

import type { ResumeDocument } from '@/entities/resume/@x/analysis';

/**
 * The analysis model.
 *
 * A finding is not a complaint. It says what was found, why a recruiter or an
 * ATS cares, and what to change -- with an anchor into the resume text so the UI
 * can highlight the exact characters being talked about. A rule that cannot
 * produce all four has no business firing.
 */

export type Severity = 'critical' | 'major' | 'minor' | 'info';

export const SEVERITY_ORDER: readonly Severity[] = ['critical', 'major', 'minor', 'info'];

export type DimensionId =
  /** Can an ATS read the file at all. */
  | 'parseability'
  /** Are the expected sections present, ordered and complete. */
  | 'structure'
  /** Do the bullets show impact, or list responsibilities. */
  | 'content'
  /** Does the wording match what the job ad asks for. */
  | 'keywords'
  /** Does the career story hold together: gaps, tenure, progression. */
  | 'narrative'
  /** Mechanics: typos, consistency, readability. */
  | 'language'
  /** Readiness for a foreign employer. */
  | 'international';

export const DIMENSION_IDS: readonly DimensionId[] = [
  'parseability',
  'structure',
  'content',
  'keywords',
  'narrative',
  'language',
  'international',
];

/** Where in the resume a finding points. */
export interface FindingAnchor {
  /** Offsets into `ResumeDocument.plainText`. */
  span?: TextSpan;
  sectionId?: string;
  /** Shown when there is no span, e.g. "весь документ" or a font name. */
  label?: string;
}

export interface FindingExample {
  before: string;
  after: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  dimension: DimensionId;
  severity: Severity;
  /** Short label for the list. */
  title: string;
  /** What was actually found in this resume. */
  detail: string;
  /** Why it costs the candidate something. */
  why: string;
  /** What to do about it. */
  fix: string;
  example?: FindingExample;
  anchors: FindingAnchor[];
  /** Points subtracted from the dimension score. */
  penalty: number;
}

export interface DimensionScore {
  dimension: DimensionId;
  /** 0-100 after penalties. */
  score: number;
  /** Share of the overall score, 0-1. */
  weight: number;
  penalty: number;
  findingCounts: Record<Severity, number>;
  rulesRun: number;
  rulesSkipped: number;
}

export type ScoreBand = 'excellent' | 'good' | 'needs-work' | 'poor';

export interface AnalysisResult {
  id: string;
  resumeId: string;
  /** ISO timestamp. Injected, never read from the clock, so runs are testable. */
  createdAt: string;
  overallScore: number;
  band: ScoreBand;
  dimensions: DimensionScore[];
  findings: Finding[];
  metrics: ResumeMetrics;
  jobMatch: JobMatchResult | null;
  engineVersion: string;
}

/* ------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* ------------------------------------------------------------------------- */

export interface BulletMetrics {
  total: number;
  /** Bullets containing a number, percentage or currency amount. */
  quantified: number;
  /** Bullets opening with a strong past-tense action verb. */
  actionVerbLed: number;
  /** Bullets opening with "responsible for", "worked on" and friends. */
  weakOpening: number;
  /** Bullets written in the first person: "I built", "я сделал". */
  firstPerson: number;
  /** Bullets using passive voice. */
  passive: number;
  /** Bullets longer than the comfortable reading limit. */
  overlong: number;
  /** Bullets too short to say anything. */
  stub: number;
  averageWords: number;
}

export interface TenureMetrics {
  /** Union of all employment periods, in months. */
  totalMonths: number;
  averageMonths: number;
  shortestMonths: number;
  jobCount: number;
  /** Jobs shorter than the job-hopping threshold. */
  shortStints: number;
  gaps: EmploymentGap[];
  /** Whether job titles trend upward over time. */
  progression: 'up' | 'flat' | 'down' | 'unclear';
}

export interface ConsistencyMetrics {
  /** Distinct date formats used, e.g. "03/2021" next to "March 2021". */
  dateFormats: string[];
  /** Distinct bullet markers used. */
  bulletMarkers: string[];
  /** Bullets ending with a period vs without, when both appear. */
  mixedBulletPunctuation: boolean;
  /** Tense is inconsistent inside a single past role. */
  mixedTense: boolean;
}

export interface ResumeMetrics {
  wordCount: number;
  characterCount: number;
  pageCount: number;
  sectionCount: number;
  bullets: BulletMetrics;
  tenure: TenureMetrics;
  consistency: ConsistencyMetrics;
  skillCount: number;
  /** Cliches and empty buzzwords found, with their spans. */
  clicheHits: Array<{ phrase: string; span: TextSpan }>;
  averageSentenceWords: number;
  longSentences: number;
  /** Estimated seniority from titles and tenure, for cross-checks. */
  impliedSeniority: 'junior' | 'middle' | 'senior' | 'lead' | 'unknown';
}

/* ------------------------------------------------------------------------- */
/* Job matching                                                               */
/* ------------------------------------------------------------------------- */

export interface SkillMatch {
  canonical: string;
  /** Whether the job ad marked it as required. */
  required: boolean;
  /** Where it appears in the resume, when it does. */
  anchors: FindingAnchor[];
}

export interface JobMatchResult {
  /** 0-100, weighted towards required skills. */
  score: number;
  matched: SkillMatch[];
  missing: SkillMatch[];
  /** In the resume but not asked for. Not a defect, shown for context. */
  extra: string[];
  /** Skills repeated far more often than their use justifies. */
  stuffed: string[];
  titleAlignment: 'strong' | 'partial' | 'weak';
}

/* ------------------------------------------------------------------------- */
/* Rules                                                                      */
/* ------------------------------------------------------------------------- */

/** Minimal shape of a parsed job ad, to keep the engine decoupled from it. */
export interface JobContext {
  title: string | null;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  seniority: 'junior' | 'middle' | 'senior' | 'lead' | 'unknown';
  plainText: string;
}

export interface RuleContext {
  resume: ResumeDocument;
  metrics: ResumeMetrics;
  job: JobContext | null;
}

/** What a rule reports when it fires. The engine fills in the rest. */
export interface RuleFinding {
  /** Overrides the rule default when this instance is more or less serious. */
  severity?: Severity;
  detail: string;
  fix?: string;
  example?: FindingExample;
  anchors?: FindingAnchor[];
  /** Scales the rule penalty, e.g. 0.5 for a borderline case. */
  penaltyFactor?: number;
}

export type RuleOutcome =
  | { status: 'pass' }
  /** The rule does not apply to this resume; excluded from scoring. */
  | { status: 'skip'; reason: string }
  | { status: 'fail'; findings: RuleFinding[] };

export interface Rule {
  /** Stable, kebab-case, referenced in tests and in the UI glossary. */
  id: string;
  dimension: DimensionId;
  severity: Severity;
  /** Points subtracted from the dimension when this rule fires. */
  penalty: number;
  title: string;
  why: string;
  fix: string;
  evaluate: (context: RuleContext) => RuleOutcome;
}

export const pass = (): RuleOutcome => ({ status: 'pass' });
export const skip = (reason: string): RuleOutcome => ({ status: 'skip', reason });
export const fail = (...findings: RuleFinding[]): RuleOutcome => ({ status: 'fail', findings });
