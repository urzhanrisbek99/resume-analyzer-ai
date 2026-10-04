'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';

import { pluralize } from '@/shared/lib/plural';
import { Button } from '@/shared/ui/button';
import { Callout } from '@/shared/ui/callout';
import { Card } from '@/shared/ui/card';
import { Meter } from '@/shared/ui/meter';

import { useBatchStore, useSortedCandidates } from '@/features/batch-screening';
import { JobInput } from '@/features/jd-matching';
import { ResumeDropzone } from '@/features/resume-upload';
import { CandidateRankingTable } from '@/widgets/candidate-ranking-table';

/**
 * The recruiter workspace.
 *
 * The vacancy comes first here, unlike in the candidate flow. Without it the
 * shortlist can only be ordered by resume quality, which is not the question a
 * recruiter is asking -- so the input sits above the dropzone rather than
 * folded away below the results.
 */
export function ScreeningWorkspace() {
  const status = useBatchStore((state) => state.status);
  const jobText = useBatchStore((state) => state.jobText);
  const jobApplied = useBatchStore((state) => state.jobApplied);
  const failures = useBatchStore((state) => state.failures);
  const processed = useBatchStore((state) => state.processed);
  const total = useBatchStore((state) => state.total);
  const sort = useBatchStore((state) => state.sort);
  const selectedCandidateId = useBatchStore((state) => state.selectedCandidateId);

  const setJobText = useBatchStore((state) => state.setJobText);
  const applyJob = useBatchStore((state) => state.applyJob);
  const addFiles = useBatchStore((state) => state.addFiles);
  const removeCandidate = useBatchStore((state) => state.removeCandidate);
  const toggleSort = useBatchStore((state) => state.toggleSort);
  const selectCandidate = useBatchStore((state) => state.selectCandidate);
  const reset = useBatchStore((state) => state.reset);

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
