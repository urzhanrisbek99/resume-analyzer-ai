import { stableId } from '@/shared/lib/id';

import type { ResumeDocument } from '@/entities/resume/@x/analysis';

import { bandFor, DIMENSION_WEIGHTS, ENGINE_VERSION } from '@/entities/analysis/model/config';
import {
  DIMENSION_IDS,
  SEVERITY_ORDER,
  type AnalysisResult,
  type DimensionId,
  type DimensionScore,
  type Finding,
  type JobContext,
  type Rule,
  type RuleContext,
  type Severity,
} from '@/entities/analysis/model/types';

import { computeMetrics } from './metrics';
import { ALL_RULES } from './rules';

/**
 * The scoring engine.
 *
 * Pure and deterministic: the same document always produces the same score, the
 * same findings and the same ordering. That is what makes the output trustworthy
 * enough to show a number at all, and what lets the whole thing be covered by
 * snapshot tests over a corpus of fixtures.
 *
 * Scoring works by subtraction. Each dimension starts at 100 and loses points as
 * its rules fire; a rule that does not apply is excluded rather than counted as
 * a pass, so a resume is never rewarded for a check that never ran.
 */

export interface AnalyseOptions {
  job?: JobContext | null;
  /** Injected so results are reproducible in tests. */
  now?: Date;
  /** Overridable for focused tests; defaults to the full registry. */
  rules?: readonly Rule[];
}

export function analyseResume(
  resume: ResumeDocument,
  options: AnalyseOptions = {},
): AnalysisResult {
  const { job = null, now = new Date(), rules = ALL_RULES } = options;

  const metrics = computeMetrics(resume);
  const context: RuleContext = { resume, metrics, job };

  const findings: Finding[] = [];
  const tally = new Map<DimensionId, { penalty: number; run: number; skipped: number }>();
  for (const dimension of DIMENSION_IDS) {
    tally.set(dimension, { penalty: 0, run: 0, skipped: 0 });
  }

  for (const rule of rules) {
    const bucket = tally.get(rule.dimension);
    if (!bucket) continue;

    const outcome = runRule(rule, context);

    if (outcome.status === 'skip') {
      bucket.skipped += 1;
      continue;
    }

    bucket.run += 1;
    if (outcome.status === 'pass') continue;

    for (const [index, reported] of outcome.findings.entries()) {
      const severity = reported.severity ?? rule.severity;
      const penalty = Math.round(rule.penalty * (reported.penaltyFactor ?? 1));

      bucket.penalty += penalty;
      findings.push({
        id: stableId('find', rule.id, reported.detail, index),
        ruleId: rule.id,
        dimension: rule.dimension,
        severity,
        title: rule.title,
        detail: reported.detail,
        why: rule.why,
        fix: reported.fix ?? rule.fix,
        ...(reported.example ? { example: reported.example } : {}),
        anchors: reported.anchors ?? [],
        penalty,
      });
    }
  }

  const sorted = sortFindings(findings);
  const dimensions = buildDimensionScores(tally, sorted);
  const overallScore = weightedOverall(dimensions);

  return {
    id: stableId('analysis', resume.id, ENGINE_VERSION),
    resumeId: resume.id,
    createdAt: now.toISOString(),
    overallScore,
    band: bandFor(overallScore),
    dimensions,
    findings: sorted,
    metrics,
    jobMatch: null,
    engineVersion: ENGINE_VERSION,
  };
}

/**
 * A rule that throws is a bug in that rule, not a reason to lose the whole
 * report. It is recorded as skipped and the remaining rules still run.
 */
function runRule(rule: Rule, context: RuleContext) {
  try {
    return rule.evaluate(context);
  } catch (cause) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`Rule "${rule.id}" threw and was skipped:`, cause);
    }
    return { status: 'skip' as const, reason: 'Правило не смогло выполниться.' };
  }
}

function buildDimensionScores(
  tally: Map<DimensionId, { penalty: number; run: number; skipped: number }>,
  findings: readonly Finding[],
): DimensionScore[] {
  const counts = new Map<DimensionId, Record<Severity, number>>();
  for (const dimension of DIMENSION_IDS) counts.set(dimension, emptyCounts());
  for (const finding of findings) {
    const bucket = counts.get(finding.dimension);
    if (bucket) bucket[finding.severity] += 1;
  }

  return DIMENSION_IDS.map((dimension) => {
    const bucket = tally.get(dimension) ?? { penalty: 0, run: 0, skipped: 0 };

    return {
      dimension,
      score: Math.max(0, Math.min(100, 100 - bucket.penalty)),
      weight: DIMENSION_WEIGHTS[dimension],
      penalty: bucket.penalty,
      findingCounts: counts.get(dimension) ?? emptyCounts(),
      rulesRun: bucket.run,
      rulesSkipped: bucket.skipped,
    };
  });
}

function emptyCounts(): Record<Severity, number> {
  return { critical: 0, major: 0, minor: 0, info: 0 };
}

/**
 * Weighted average across dimensions, ignoring dimensions where no rule ran.
 *
 * Without a job advert every keyword rule skips. Counting that dimension as a
 * perfect 100 would inflate the score; counting it as 0 would punish the user
 * for not supplying something optional. Dropping it and renormalising the
 * remaining weights is the only honest option.
 */
function weightedOverall(dimensions: DimensionScore[]): number {
  const scored = dimensions.filter((dimension) => dimension.rulesRun > 0);
  if (scored.length === 0) return 0;

  const totalWeight = scored.reduce((sum, dimension) => sum + dimension.weight, 0);
  if (totalWeight === 0) return 0;

  const weighted = scored.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0);

  return Math.round(weighted / totalWeight);
}

const SEVERITY_RANK = new Map<Severity, number>(
  SEVERITY_ORDER.map((severity, index) => [severity, index]),
);

/**
 * Most severe first, then by how many points it costs, then by rule id so the
 * order is fully determined and snapshot tests do not flake.
 */
function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const bySeverity =
      (SEVERITY_RANK.get(a.severity) ?? 99) - (SEVERITY_RANK.get(b.severity) ?? 99);
    if (bySeverity !== 0) return bySeverity;
    if (a.penalty !== b.penalty) return b.penalty - a.penalty;
    return a.ruleId.localeCompare(b.ruleId);
  });
}
