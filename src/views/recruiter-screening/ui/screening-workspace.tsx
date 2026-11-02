'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { pluralize } from '@/shared/lib/plural';
import { Button } from '@/shared/ui/button';
import { Callout } from '@/shared/ui/callout';
import { Card } from '@/shared/ui/card';
import { Meter } from '@/shared/ui/meter';

import { useBatchStore, useSortedCandidates } from '@/features/batch-screening';
import { JobInput } from '@/features/jd-matching';
import { ShortlistExportActions } from '@/features/report-export';
import { ResumeDropzone } from '@/features/resume-upload';
import { CandidateRankingTable } from '@/widgets/candidate-ranking-table';

/**
 * Layout of the recruiter flow. The job input sits above the dropzone because
 * without it candidates can only be ranked by resume quality.
 */
export function ScreeningWorkspace() {
  const {
    status,
    jobText,
    jobApplied,
    jobTitle,
    failures,
    processed,
    total,
    offThread,
    sort,
    selectedCandidateId,
    setJobText,
    applyJob,
    addFiles,
    removeCandidate,
    toggleSort,
    selectCandidate,
    reset,
  } = useBatchStore(
    useShallow((state) => ({
      status: state.status,
      jobText: state.jobText,
      jobApplied: state.jobApplied,
      jobTitle: state.jobTitle,
      failures: state.failures,
      processed: state.processed,
      total: state.total,
      offThread: state.offThread,
      sort: state.sort,
      selectedCandidateId: state.selectedCandidateId,
      setJobText: state.setJobText,
      applyJob: state.applyJob,
      addFiles: state.addFiles,
      removeCandidate: state.removeCandidate,
      toggleSort: state.toggleSort,
      selectCandidate: state.selectCandidate,
      reset: state.reset,
    })),
  );

  const candidates = useSortedCandidates();
  const busy = status === 'processing';
  const hasAnything = candidates.length > 0 || failures.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <JobInput
        value={jobText}
        onChange={setJobText}
        onApply={applyJob}
        applied={jobApplied}
        disabled={busy}
      />

      <ResumeDropzone
        multiple
        onFiles={(files) => void addFiles(files)}
        disabled={busy}
        label="Перетащите резюме кандидатов или нажмите, чтобы выбрать"
        hint="Все файлы разбираются в браузере. Ни один из них не загружается на сервер."
      />

      {busy ? (
        <Card className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-[0.8125rem]">
            <span className="font-medium">Разбираю резюме…</span>
            <span className="text-muted tabular-nums">
              {processed} из {total}
            </span>
          </div>
          <Meter value={processed} max={total} tone="accent" label="Прогресс разбора" />
          <p className="text-muted text-[0.6875rem]">
            {offThread
              ? 'Разбор идёт в фоновых потоках — интерфейс остаётся отзывчивым.'
              : 'Браузер не разрешил фоновые потоки, разбор идёт в основном.'}
          </p>
        </Card>
      ) : null}

      {hasAnything ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-secondary text-[0.8125rem]">
            {pluralize(candidates.length, 'кандидат', 'кандидата', 'кандидатов')} в списке
            {failures.length > 0
              ? `, ${pluralize(failures.length, 'файл', 'файла', 'файлов')} не прочитано`
              : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <ShortlistExportActions
              candidates={candidates}
              hasJob={jobApplied}
              jobTitle={jobTitle}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={reset}
              disabled={busy}
              iconLeft={<RotateCcw className="size-4" aria-hidden="true" />}
            >
              Очистить список
            </Button>
          </div>
        </div>
      ) : null}

      {failures.length > 0 ? (
        <Callout
          tone="major"
          title="Эти файлы прочитать не удалось"
          icon={<AlertTriangle className="size-4" aria-hidden="true" />}
        >
          <ul className="mt-1 flex flex-col gap-1">
            {failures.map((failure) => (
              <li key={failure.id}>
                <span className="font-medium">{failure.fileName}</span> — {failure.message}
                {failure.hint ? <span className="text-muted"> {failure.hint}</span> : null}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <CandidateRankingTable
        candidates={candidates}
        sort={sort}
        onToggleSort={toggleSort}
        selectedCandidateId={selectedCandidateId}
        onSelect={selectCandidate}
        onRemove={removeCandidate}
        hasJob={jobApplied}
      />
    </div>
  );
}
