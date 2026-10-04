'use client';

import { ArrowDown, ArrowUp, ChevronRight, Trash2, Users } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { formatMonths } from '@/shared/lib/dates';
import { pluralize } from '@/shared/lib/plural';
import { Badge, type Tone } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardHeader } from '@/shared/ui/card';
import { Meter } from '@/shared/ui/meter';
import { EmptyState } from '@/shared/ui/placeholder';

import {
  rankBreakdown,
  requiredCoverage,
  type CandidateSummary,
  type SortKey,
  type SortState,
} from '@/entities/candidate';

import { CandidateFlags } from './candidate-flags';

/**
 * The shortlist.
 *
 * A recruiter screening forty resumes is answering one question per row: is
 * this person worth twenty minutes. So each row carries the fit, the gap that
 * would cost them the call, and nothing else; the detail lives one expansion
 * away rather than in a column nobody can read at this density.
 */

export interface CandidateRankingTableProps {
  candidates: readonly CandidateSummary[];
  sort: SortState;
  onToggleSort: (key: SortKey) => void;
  selectedCandidateId: string | null;
  onSelect: (candidateId: string | null) => void;
  onRemove: (candidateId: string) => void;
  hasJob: boolean;
  className?: string;
}

interface Column {
  key: SortKey;
  label: string;
  /** Right-aligned for numbers, which is how they are compared. */
  numeric?: boolean;
  hideWithoutJob?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'rank', label: '#', numeric: true },
  { key: 'name', label: 'Кандидат' },
  { key: 'requiredCoverage', label: 'Требования', numeric: true, hideWithoutJob: true },
  { key: 'jobMatchScore', label: 'Совпадение', numeric: true, hideWithoutJob: true },
  { key: 'overallScore', label: 'Резюме', numeric: true },
  { key: 'experienceMonths', label: 'Опыт', numeric: true },
  { key: 'flags', label: 'На что обратить внимание' },
];

function toneForScore(score: number): Tone {
  if (score >= 85) return 'good';
  if (score >= 70) return 'minor';
  if (score >= 50) return 'major';
  return 'critical';
}

export function CandidateRankingTable({
  candidates,
  sort,
  onToggleSort,
  selectedCandidateId,
  onSelect,
  onRemove,
  hasJob,
  className,
}: CandidateRankingTableProps) {
  const columns = COLUMNS.filter((column) => hasJob || !column.hideWithoutJob);

  if (candidates.length === 0) {
    return (
      <Card className={className} padded={false}>
        <EmptyState
          icon={<Users className="size-8" aria-hidden="true" />}
          title="Пока никого нет"
          description="Загрузите резюме кандидатов, чтобы увидеть их в одном списке."
        />
      </Card>
    );
  }

  return (
    <Card className={cn('overflow-hidden', className)} padded={false}>
      <div className="px-5 pt-5 pb-3">
        <CardHeader
          as="h2"
          title="Кандидаты"
          description={
            hasJob
              ? `${pluralize(candidates.length, 'кандидат', 'кандидата', 'кандидатов')} · отсортированы по соответствию вакансии`
              : `${pluralize(candidates.length, 'кандидат', 'кандидата', 'кандидатов')} · укажите вакансию, чтобы ранжировать по соответствию`
          }
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[0.8125rem]">
          <caption className="sr-only">
            Кандидаты, отсортированные по{' '}
            {sort.key === 'rank' ? 'соответствию' : 'выбранной колонке'}
          </caption>

          <thead>
            <tr className="border-y border-[var(--border-subtle)]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    sort.key === column.key
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className={cn(
                    'surface-sunken px-3 py-2 font-medium whitespace-nowrap',
                    column.numeric && 'text-right',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onToggleSort(column.key)}
                    className={cn(
                      'text-secondary hover:text-[var(--text-primary)] inline-flex items-center gap-1 text-[0.75rem] transition-colors',
                      column.numeric && 'flex-row-reverse',
                      sort.key === column.key && 'text-[var(--text-primary)] font-semibold',
                    )}
                  >
                    {column.label}
                    {sort.key === column.key ? (
                      sort.direction === 'asc' ? (
                        <ArrowUp className="size-3" aria-hidden="true" />
                      ) : (
                        <ArrowDown className="size-3" aria-hidden="true" />
                      )
                    ) : null}
                  </button>
                </th>
              ))}
              <th scope="col" className="surface-sunken px-3 py-2">
                <span className="sr-only">Действия</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {candidates.map((candidate, index) => {
              const expanded = selectedCandidateId === candidate.id;
              const breakdown = rankBreakdown(candidate);

              return (
                <Fragment key={candidate.id}>
                  <tr
                    className={cn(
                      'border-b border-[var(--border-subtle)] transition-colors',
                      expanded ? 'surface-sunken' : 'hover:surface-sunken',
                    )}
                  >
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                      {index + 1}
                    </td>

                    <th scope="row" className="px-3 py-2.5 text-left font-normal">
                      <button
                        type="button"
                        onClick={() => onSelect(candidate.id)}
                        aria-expanded={expanded}
                        className="group flex items-start gap-2 text-left"
                      >
                        <ChevronRight
                          className={cn(
                            'text-muted mt-0.5 size-3.5 shrink-0 transition-transform',
                            expanded && 'rotate-90',
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="block font-medium group-hover:underline">
                            {candidate.name ?? candidate.fileName}
                          </span>
                          <span className="text-muted block text-[0.75rem]">
                            {candidate.headline ?? candidate.email ?? candidate.fileName}
                          </span>
                        </span>
                      </button>
                    </th>

                    {hasJob ? (
                      <>
                        <td className="px-3 py-2.5 text-right">
                          <CoverageCell candidate={candidate} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <ScoreCell value={candidate.jobMatchScore} />
                        </td>
                      </>
                    ) : null}

                    <td className="px-3 py-2.5 text-right">
                      <ScoreCell value={candidate.overallScore} />
                    </td>

                    <td className="text-secondary px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                      {candidate.experienceMonths > 0
                        ? formatMonths(candidate.experienceMonths)
                        : '—'}
                    </td>

                    <td className="px-3 py-2.5">
                      <CandidateFlagsCell candidate={candidate} />
                    </td>

                    <td className="px-3 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemove(candidate.id)}
                        aria-label={`Убрать ${candidate.name ?? candidate.fileName} из списка`}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>

                  {expanded ? (
                    <tr className="surface-sunken border-b border-[var(--border-subtle)]">
                      <td colSpan={columns.length + 1} className="px-3 pt-1 pb-4">
                        <CandidateDetail
                          candidate={candidate}
                          breakdownTotal={breakdown.total}
                          hasJob={hasJob}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ScoreCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">—</span>;
  return (
    <span
      className={cn(
        'inline-block min-w-8 rounded px-1.5 py-0.5 text-center font-semibold tabular-nums',
        value >= 70
          ? 'bg-good-100 text-good-700 dark:bg-good-700/25 dark:text-good-100'
          : value >= 50
            ? 'bg-minor-100 text-minor-700 dark:bg-minor-700/25 dark:text-minor-100'
            : 'bg-critical-100 text-critical-700 dark:bg-critical-700/25 dark:text-critical-100',
      )}
    >
      {value}
    </span>
  );
}

function CoverageCell({ candidate }: { candidate: CandidateSummary }) {
  const { matchedRequired, missingRequired } = candidate.skills;
  const total = matchedRequired.length + missingRequired.length;

  if (total === 0) return <span className="text-muted">—</span>;

  return (
    <span className="inline-flex items-center justify-end gap-2">
      <Meter
        value={requiredCoverage(candidate) * 100}
        tone={toneForScore(requiredCoverage(candidate) * 100)}
        className="w-14"
      />
      <span className="font-medium tabular-nums">
        {matchedRequired.length}/{total}
      </span>
    </span>
  );
}

function CandidateFlagsCell({ candidate }: { candidate: CandidateSummary }) {
  if (candidate.flags.length === 0 && candidate.criticalCount === 0) {
    return <span className="text-muted text-[0.75rem]">—</span>;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {candidate.criticalCount > 0 ? (
        <Badge tone="critical" title="Критичные замечания к резюме">
          {candidate.criticalCount} критичных
        </Badge>
      ) : null}
      <CandidateFlags flags={candidate.flags} />
    </span>
  );
}

function CandidateDetail({
  candidate,
  breakdownTotal,
  hasJob,
}: {
  candidate: CandidateSummary;
  breakdownTotal: number;
  hasJob: boolean;
}) {
  return (
    <div className="grid gap-4 pl-6 sm:grid-cols-2">
      <div>
        <DetailLabel>Контакты</DetailLabel>
        <p className="text-[0.8125rem]">{candidate.email ?? 'почта не найдена'}</p>
        {candidate.location ? (
          <p className="text-secondary text-[0.8125rem]">{candidate.location}</p>
        ) : null}
        <p className="text-muted mt-1 text-[0.75rem]">{candidate.fileName}</p>
      </div>

      <div>
        <DetailLabel>Оценка</DetailLabel>
        <p className="text-[0.8125rem]">
          Итог {breakdownTotal} · резюме {candidate.overallScore}
          {candidate.jobMatchScore !== null ? ` · совпадение ${candidate.jobMatchScore}` : ''}
        </p>
        <p className="text-muted text-[0.75rem]">
          Уровень по резюме:{' '}
          {candidate.seniority === 'unknown' ? 'не определён' : candidate.seniority}
        </p>
      </div>

      {hasJob ? (
        <>
          <div>
            <DetailLabel>Есть из требований</DetailLabel>
            <SkillList items={candidate.skills.matchedRequired} tone="good" empty="ничего" />
            {candidate.skills.matchedOptional.length > 0 ? (
              <>
                <DetailLabel className="mt-3">Из желательных</DetailLabel>
                <SkillList items={candidate.skills.matchedOptional} tone="accent" empty="—" />
              </>
            ) : null}
          </div>

          <div>
            <DetailLabel>Не найдено в резюме</DetailLabel>
            <SkillList
              items={candidate.skills.missingRequired}
              tone="critical"
              empty="всё на месте"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function DetailLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'text-muted mb-1 text-[0.6875rem] font-semibold tracking-wide uppercase',
        className,
      )}
    >
      {children}
    </p>
  );
}

function SkillList({
  items,
  tone,
  empty,
}: {
  items: readonly string[];
  tone: Tone;
  empty: string;
}) {
  if (items.length === 0) return <p className="text-muted text-[0.8125rem]">{empty}</p>;

  return (
    <ul className="flex flex-wrap gap-1">
      {items.map((item) => (
        <li key={item}>
          <Badge tone={tone}>{item}</Badge>
        </li>
      ))}
    </ul>
  );
}
