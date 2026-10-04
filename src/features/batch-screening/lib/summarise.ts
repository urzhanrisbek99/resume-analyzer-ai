import { normalize } from '@/shared/lib/text';

import type { AnalysisResult, JobContext } from '@/entities/analysis';
import type { CandidateFlag, CandidateSummary } from '@/entities/candidate';
import type { ResumeDocument } from '@/entities/resume';

/**
 * Project a parsed resume and its analysis onto the shortlist row.
 *
 * This crosses two entities, which is why it lives in the feature that
 * orchestrates them rather than inside `candidate`: that slice stays pure and
 * testable with hand-written summaries, and the knowledge of how a resume maps
 * onto a row sits with the screen that needs it.
 */

/** A gap shorter than this is ordinary time between jobs. */
const GAP_FLAG_MONTHS = 6;
const SHORT_TENURE_FLAG_COUNT = 2;
/** Below this, an applicant tracking system will mangle the document too. */
const UNREADABLE_PARSEABILITY = 55;

export interface SummariseInput {
  id: string;
  fileName: string;
  document: ResumeDocument;
  result: AnalysisResult;
  job: JobContext | null;
}

export function summariseCandidate({
  id,
  fileName,
  document,
  result,
  job,
}: SummariseInput): CandidateSummary {
  const dimension = (key: string) =>
    result.dimensions.find((entry) => entry.dimension === key) ?? null;

  const keywords = dimension('keywords');
  const parseability = dimension('parseability');

  return {
    id,
    fileName,
    name: document.contacts.fullName,
    headline: document.contacts.headline,
    email: document.contacts.email,
    location: document.contacts.location,

    overallScore: result.overallScore,
    // A dimension where nothing ran has no score to report; null says that,
    // where zero would read as "matched nothing".
    jobMatchScore: keywords && keywords.rulesRun > 0 ? keywords.score : null,
    parseabilityScore: parseability?.score ?? 0,

    experienceMonths: result.metrics.tenure.totalMonths,
    seniority: result.metrics.impliedSeniority,
    skills: matchSkills(document, job),

    criticalCount: result.findings.filter((finding) => finding.severity === 'critical').length,
    majorCount: result.findings.filter((finding) => finding.severity === 'major').length,
    flags: collectFlags(document, result, parseability?.score ?? 100),
  };
}

/**
 * Which of the vacancy requirements the resume actually demonstrates.
 *
 * Matching is done against the whole document rather than the skills section
 * alone: a technology proven inside a job description still counts, and often
 * counts for more.
 */
function matchSkills(document: ResumeDocument, job: JobContext | null) {
  if (!job) return { matchedRequired: [], missingRequired: [], matchedOptional: [] };

  const haystack = normalize(document.plainText);
  const declared = new Set(document.skills.map((skill) => normalize(skill.canonical)));

  const present = (skill: string) => {
    const key = normalize(skill);
    return declared.has(key) || haystack.includes(key);
  };

  return {
    matchedRequired: job.requiredSkills.filter(present),
    missingRequired: job.requiredSkills.filter((skill) => !present(skill)),
    matchedOptional: job.niceToHaveSkills.filter(present),
  };
}

function collectFlags(
  document: ResumeDocument,
  result: AnalysisResult,
  parseabilityScore: number,
): CandidateFlag[] {
  const flags: CandidateFlag[] = [];
  const { tenure } = result.metrics;

  if (parseabilityScore < UNREADABLE_PARSEABILITY) flags.push('ats-unreadable');
  if (!document.contacts.email) flags.push('missing-contacts');
  if (tenure.gaps.some((gap) => gap.months >= GAP_FLAG_MONTHS)) flags.push('employment-gap');
  if (tenure.shortStints >= SHORT_TENURE_FLAG_COUNT) flags.push('short-tenures');

  const dated = document.experience.filter((item) => item.period !== null).length;
  if (document.experience.length > 0 && dated === 0) flags.push('undated-experience');

  return flags;
}
