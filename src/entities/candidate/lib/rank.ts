import type { CandidateSummary } from '@/entities/candidate/model/types';

/**
 * Ranking.
 *
 * The ordering has to be explainable, because a recruiter who cannot see why
 * someone is first will not trust the list and will read all forty resumes
 * anyway. `rankBreakdown` returns the components so the UI can show them.
 *
 * With a vacancy supplied, coverage of the required skills dominates: that is
 * the question the recruiter actually asked. Resume quality still counts, but
 * it cannot promote a candidate who is missing half the must-haves -- a clean
 * resume for the wrong role is still the wrong role.
 *
 * Without a vacancy there is nothing to match against, so the ranking falls
 * back to resume quality alone and says so.
 */

export interface RankBreakdown {
  /** 0-1 share of required skills found in the resume. */
  requiredCoverage: number;
  /** 0-100, the keyword dimension, or null without a vacancy. */
  jobMatchScore: number | null;
  overallScore: number;
  /** 0-100 final value used for sorting. */
  total: number;
}

const WEIGHTS = {
  requiredCoverage: 0.55,
  jobMatch: 0.25,
  overall: 0.2,
} as const;

export function requiredCoverage(candidate: CandidateSummary): number {
  const { matchedRequired, missingRequired } = candidate.skills;
  const total = matchedRequired.length + missingRequired.length;
  return total === 0 ? 1 : matchedRequired.length / total;
}

export function rankBreakdown(candidate: CandidateSummary): RankBreakdown {
  const coverage = requiredCoverage(candidate);

  if (candidate.jobMatchScore === null) {
    return {
      requiredCoverage: coverage,
      jobMatchScore: null,
      overallScore: candidate.overallScore,
      total: candidate.overallScore,
    };
  }

  const total =
    WEIGHTS.requiredCoverage * (coverage * 100) +
    WEIGHTS.jobMatch * candidate.jobMatchScore +
    WEIGHTS.overall * candidate.overallScore;

  return {
    requiredCoverage: coverage,
    jobMatchScore: candidate.jobMatchScore,
    overallScore: candidate.overallScore,
    total: Math.round(total),
  };
}

export function rankScore(candidate: CandidateSummary): number {
  return rankBreakdown(candidate).total;
}

export type SortKey =
  | 'rank'
  | 'name'
  | 'overallScore'
  | 'jobMatchScore'
  | 'experienceMonths'
  | 'requiredCoverage'
  | 'flags';

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

/** The column each sort key reads, as a comparable number or string. */
function sortValue(candidate: CandidateSummary, key: SortKey): number | string {
  switch (key) {
    case 'rank':
      return rankScore(candidate);
    case 'name':
      return (candidate.name ?? candidate.fileName).toLocaleLowerCase('ru');
    case 'overallScore':
      return candidate.overallScore;
    case 'jobMatchScore':
      // Unscored candidates sort last in either direction rather than as zero,
      // which would read as "scored badly".
      return candidate.jobMatchScore ?? Number.NEGATIVE_INFINITY;
    case 'experienceMonths':
      return candidate.experienceMonths;
    case 'requiredCoverage':
      return requiredCoverage(candidate);
    case 'flags':
      return candidate.flags.length;
  }
}

/**
 * Sort a shortlist.
 *
 * Ties break on rank and then on file name so the order is fully determined:
 * a table that reshuffles equal rows between renders looks broken.
 */
export function sortCandidates(
  candidates: readonly CandidateSummary[],
  { key, direction }: SortState,
): CandidateSummary[] {
  const sign = direction === 'asc' ? 1 : -1;

  return [...candidates].sort((a, b) => {
    const left = sortValue(a, key);
    const right = sortValue(b, key);

    let primary = 0;
    if (typeof left === 'string' && typeof right === 'string') {
      primary = left.localeCompare(right, 'ru');
    } else if (left < right) {
      primary = -1;
    } else if (left > right) {
      primary = 1;
    }

    if (primary !== 0) return primary * sign;

    const byRank = rankScore(b) - rankScore(a);
    if (byRank !== 0) return byRank;

    return a.fileName.localeCompare(b.fileName, 'ru');
  });
}

/** Default view: best fit first. */
export const DEFAULT_SORT: SortState = { key: 'rank', direction: 'desc' };
