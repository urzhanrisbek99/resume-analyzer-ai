/**
 * Public API of the `candidate` entity.
 *
 * Holds the shortlist projection and the ranking that orders it. Building a
 * summary from a parsed resume and its analysis crosses two other entities, so
 * that mapping lives in the screening feature rather than here -- this slice
 * stays pure and depends on nothing but its own model.
 */

export type {
  CandidateFailure,
  CandidateFlag,
  CandidateSeniority,
  CandidateSkillMatch,
  CandidateSummary,
  ScreeningEntry,
} from './model/types';

export {
  DEFAULT_SORT,
  rankBreakdown,
  rankScore,
  requiredCoverage,
  sortCandidates,
} from './lib/rank';

export type { RankBreakdown, SortDirection, SortKey, SortState } from './lib/rank';
