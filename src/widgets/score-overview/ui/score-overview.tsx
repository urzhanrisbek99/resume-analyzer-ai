'use client';

import { cn } from '@/shared/lib/cn';
import { plural } from '@/shared/lib/plural';
import { Badge, CountPill, type Tone } from '@/shared/ui/badge';
import { Card, CardHeader } from '@/shared/ui/card';
import { Meter } from '@/shared/ui/meter';
import { ScoreRing } from '@/shared/ui/score-ring';

import {
  bandLabel,
  DIMENSION_DESCRIPTIONS,
  DIMENSION_LABELS,
  type AnalysisResult,
  type DimensionId,
  type DimensionScore,
  type ScoreBand,
} from '@/entities/analysis';

/**
 * The score panel.
 *
 * A single number invites the question "why", so it is decomposed: each
 * dimension shows its own score, how many findings it holds and at what
 * severity, and selecting one filters the findings list. A score the user
 * cannot interrogate is a score they will not trust.
 */

const BAND_TONE: Record<ScoreBand, Tone> = {
  excellent: 'good',
  good: 'good',
  'needs-work': 'minor',
  poor: 'critical',
};

export function toneForScore(score: number): Tone {
  if (score >= 85) return 'good';
  if (score >= 70) return 'minor';
  if (score >= 50) return 'major';
  return 'critical';
}

export interface ScoreOverviewProps {
  result: AnalysisResult;
  activeDimension: DimensionId | 'all';
  onSelectDimension: (dimension: DimensionId | 'all') => void;
  className?: string;
}

export function ScoreOverview({
  result,
  activeDimension,
  onSelectDimension,
  className,
}: ScoreOverviewProps) {
  const counts = {
    critical: result.findings.filter((finding) => finding.severity === 'critical').length,
    major: result.findings.filter((finding) => finding.severity === 'major').length,
    minor: result.findings.filter((finding) => finding.severity === 'minor').length,
  };

  return (
    <Card className={cn('flex flex-col gap-5', className)}>
      <div className="flex flex-wrap items-center gap-5">
        <ScoreRing
          value={result.overallScore}
          tone={BAND_TONE[result.band]}
          size={132}
          label="из 100"
        />

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{bandLabel(result.band)}</h2>
          <p className="text-secondary mt-1 text-[0.8125rem]">{summaryFor(counts)}</p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <SeverityChip count={counts.critical} tone="critical" label="критичных" />
            <SeverityChip count={counts.major} tone="major" label="важных" />
            <SeverityChip count={counts.minor} tone="minor" label="мелких" />
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--border-subtle)] pt-4">
        <CardHeader
          as="h3"
          title="По измерениям"
          description="Нажмите, чтобы отфильтровать замечания"
          className="mb-3"
        />

        <ul className="flex flex-col gap-1">
          <li>
            <DimensionRow
              label="Все замечания"
              description={`${result.findings.length} ${plural(result.findings.length, 'замечание', 'замечания', 'замечаний')} всего`}
              score={result.overallScore}
              active={activeDimension === 'all'}
              onSelect={() => onSelectDimension('all')}
              count={result.findings.length}
            />
          </li>

          {result.dimensions.map((dimension) => (
            <li key={dimension.dimension}>
              <DimensionRow
                label={DIMENSION_LABELS[dimension.dimension]}
                description={
                  dimension.rulesRun === 0
                    ? 'Не проверялось — не указана вакансия'
                    : DIMENSION_DESCRIPTIONS[dimension.dimension]
                }
                score={dimension.score}
                skipped={dimension.rulesRun === 0}
                active={activeDimension === dimension.dimension}
                onSelect={() => onSelectDimension(dimension.dimension)}
                count={countFindings(dimension)}
              />
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function summaryFor(counts: { critical: number; major: number; minor: number }): string {
  if (counts.critical > 0) {
    return `${counts.critical} ${plural(counts.critical, 'критичная проблема', 'критичные проблемы', 'критичных проблем')} — с ними резюме отсеется автоматически.`;
  }
  if (counts.major > 0) {
    return `Критичных проблем нет. ${counts.major} ${plural(counts.major, 'важное замечание', 'важных замечания', 'важных замечаний')} стоит исправить.`;
  }
  return 'Серьёзных проблем не найдено.';
}

function countFindings(dimension: DimensionScore): number {
  return (
    dimension.findingCounts.critical +
    dimension.findingCounts.major +
    dimension.findingCounts.minor +
    dimension.findingCounts.info
  );
}

interface DimensionRowProps {
  label: string;
  description: string;
  score: number;
  count: number;
  active: boolean;
  skipped?: boolean;
  onSelect: () => void;
}

function DimensionRow({
  label,
  description,
  score,
  count,
  active,
  skipped = false,
  onSelect,
}: DimensionRowProps) {
  const tone = skipped ? 'neutral' : toneForScore(score);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'w-full rounded-lg px-3 py-2 text-left transition-colors',
        active ? 'surface-sunken' : 'hover:surface-sunken',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[0.8125rem] font-medium">{label}</span>
        <span className="flex shrink-0 items-center gap-2">
          {count > 0 ? <CountPill tone={tone}>{count}</CountPill> : null}
          <span className="text-[0.8125rem] font-semibold tabular-nums">
            {skipped ? '—' : score}
          </span>
        </span>
      </div>

      <Meter value={skipped ? 0 : score} tone={tone} className="mt-1.5" />
      <p className="text-muted mt-1 text-[0.6875rem]">{description}</p>
    </button>
  );
}

function SeverityChip({ count, tone, label }: { count: number; tone: Tone; label: string }) {
  if (count === 0) return null;
  return (
    <Badge tone={tone}>
      {count} {label}
    </Badge>
  );
}
