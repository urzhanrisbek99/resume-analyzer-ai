/** Flat shortlist row: the few facts a recruiter compares across candidates. */

export type CandidateSeniority = 'junior' | 'middle' | 'senior' | 'lead' | 'unknown';

/** Worded neutrally on purpose: a flag is a question to ask, not a verdict. */
export type CandidateFlag =
  /** The file barely parses; an ATS will mangle it too. */
  | 'ats-unreadable'
  /** No email found, so the application may not even be contactable. */
  | 'missing-contacts'
  /** A break of six months or more between roles. */
  | 'employment-gap'
  /** Two or more roles shorter than a year. */
  | 'short-tenures'
  /** Roles carry no dates, so experience cannot be measured. */
  | 'undated-experience';

export interface CandidateSkillMatch {
  matchedRequired: string[];
  missingRequired: string[];
  matchedOptional: string[];
}

export interface CandidateSummary {
  id: string;
  fileName: string;
  name: string | null;
  headline: string | null;
  email: string | null;
  location: string | null;

  /** 0-100 from the full engine run. */
  overallScore: number;
  /** 0-100 for the keyword dimension, or null when no vacancy was supplied. */
  jobMatchScore: number | null;
  parseabilityScore: number;

  experienceMonths: number;
  seniority: CandidateSeniority;
  skills: CandidateSkillMatch;

  criticalCount: number;
  majorCount: number;
  flags: CandidateFlag[];
}

/** A file that could not be read at all. Shown, never silently dropped. */
export interface CandidateFailure {
  id: string;
  fileName: string;
  message: string;
  hint?: string;
}

export type ScreeningEntry =
  { status: 'ready'; summary: CandidateSummary } | { status: 'failed'; failure: CandidateFailure };
