/**
 * Public API of `candidate`: the shortlist row and its ranking. Building a row
 * spans two entities, so that lives in the batch-screening feature.
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
