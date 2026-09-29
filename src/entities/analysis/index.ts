/**
 * Public API of the `analysis` entity.
 *
 * The scoring engine is framework-free, dependency-free and pure: it takes a
 * parsed resume and returns a result. Nothing here imports React, Next.js or
 * any network client, which is what lets the same code run in the browser, on
 * the server and inside a test with no adaptation.
 */

export type {
  AnalysisResult,
  BulletMetrics,
  ConsistencyMetrics,
  DimensionId,
  DimensionScore,
  Finding,
  FindingAnchor,
  FindingExample,
  JobContext,
  JobMatchResult,
  ResumeMetrics,
  Rule,
  RuleContext,
  RuleFinding,
  RuleOutcome,
  ScoreBand,
  Severity,
  SkillMatch,
  TenureMetrics,
} from './model/types';

export { DIMENSION_IDS, SEVERITY_ORDER, fail, pass, skip } from './model/types';

export {
  DIMENSION_DESCRIPTIONS,
  DIMENSION_LABELS,
  DIMENSION_WEIGHTS,
  ENGINE_VERSION,
  SCORE_BANDS,
  SEVERITY_LABELS,
  bandFor,
  bandLabel,
} from './model/config';

export { analyseResume } from './lib/engine';
export type { AnalyseOptions } from './lib/engine';

export { computeMetrics } from './lib/metrics';

export { ALL_RULES, assertUniqueRuleIds } from './lib/rules';
