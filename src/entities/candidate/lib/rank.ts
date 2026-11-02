import type { CandidateSummary } from '../model/types';

/**
 * Explainable ranking: `rankBreakdown` exposes the components. With a job ad,
 * required-skill coverage dominates, so a clean resume cannot outrank one that
 * meets the must-haves. Without one, ranking uses resume quality only.
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

function sortValue(candidate: CandidateSummary, key: SortKey): number | string {
  switch (key) {
    case 'rank':
      return rankScore(candidate);
    case 'name':
      return (candidate.name ?? candidate.fileName).toLocaleLowerCase('ru');
    case 'overallScore':
      return candidate.overallScore;
    case 'jobMatchScore':
      // Unscored candidates sort last in both directions; 0 would read as "scored badly".
      return candidate.jobMatchScore ?? Number.NEGATIVE_INFINITY;
    case 'experienceMonths':
      return candidate.experienceMonths;
    case 'requiredCoverage':
      return requiredCoverage(candidate);
    case 'flags':
      return candidate.flags.length;
  }
}

/** Ties break on rank, then file name, so equal rows never reshuffle. */
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

export const DEFAULT_SORT: SortState = { key: 'rank', direction: 'desc' };
