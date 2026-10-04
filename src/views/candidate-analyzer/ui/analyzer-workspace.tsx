'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/shared/ui/button';
import { Callout } from '@/shared/ui/callout';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/placeholder';

import { JobInput } from '@/features/jd-matching';
import { useEnhancementAvailability } from '@/features/llm-suggestions';
import { useAnalysisStore, useVisibleFindings } from '@/features/resume-analysis';
import { PasteTextPanel, ResumeDropzone } from '@/features/resume-upload';
import { FindingsPanel } from '@/widgets/findings-panel';
import { ResumePreview } from '@/widgets/resume-preview';
import { ScoreOverview } from '@/widgets/score-overview';

/**
 * The candidate workspace.
 *
 * Owns the arrangement and nothing else: every piece of state lives in the
 * analysis store, and every piece of logic lives in an entity. This file
 * decides what sits next to what, which is exactly as much as a widget should
 * know.
 */
export function AnalyzerWorkspace() {
  const status = useAnalysisStore((state) => state.status);
  const document = useAnalysisStore((state) => state.document);
  const result = useAnalysisStore((state) => state.result);
  const error = useAnalysisStore((state) => state.error);
  const durationMs = useAnalysisStore((state) => state.durationMs);
  const jobText = useAnalysisStore((state) => state.jobText);
  const selectedFindingId = useAnalysisStore((state) => state.selectedFindingId);
  const dimensionFilter = useAnalysisStore((state) => state.dimensionFilter);

  const analyseFile = useAnalysisStore((state) => state.analyseFile);
  const analyseText = useAnalysisStore((state) => state.analyseText);
  const setJobText = useAnalysisStore((state) => state.setJobText);
  const applyJob = useAnalysisStore((state) => state.applyJob);
  const selectFinding = useAnalysisStore((state) => state.selectFinding);
  const setDimensionFilter = useAnalysisStore((state) => state.setDimensionFilter);
  const reset = useAnalysisStore((state) => state.reset);

  const visibleFindings = useVisibleFindings();
  const enhancementAvailable = useEnhancementAvailability();
  const [pasting, setPasting] = useState(false);

  const busy = status === 'reading' || status === 'analysing';
  const activeFinding =
    result?.findings.find((finding) => finding.id === selectedFindingId) ?? null;
  const jobApplied =
    jobText.trim().length > 0 &&
    (result?.dimensions.find((dimension) => dimension.dimension === 'keywords')?.rulesRun ?? 0) > 0;

  if (status === 'ready' && document && result) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-secondary text-[0.8125rem]">
            <span className="font-medium">{document.file.name}</span>
            <span className="text-muted"> · разобрано за {durationMs} мс, локально</span>
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={reset}
            iconLeft={<RotateCcw className="size-4" aria-hidden="true" />}
          >
            Другое резюме
          </Button>
        </div>

        <JobInput
          value={jobText}
          onChange={setJobText}
          onApply={applyJob}
          applied={jobApplied}
          disabled={busy}
        />

        {document.extraction.warnings.length > 0 ? (
          <Callout
            tone="minor"
            title="При разборе были сложности"
            icon={<AlertTriangle className="size-4" aria-hidden="true" />}
          >
            <ul className="list-inside list-disc">
              {document.extraction.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Callout>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <ScoreOverview
            result={result}
            activeDimension={dimensionFilter}
            onSelectDimension={setDimensionFilter}
            className="lg:sticky lg:top-4 lg:self-start"
          />

          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <FindingsPanel
              findings={visibleFindings}
              selectedFindingId={selectedFindingId}
              onSelect={selectFinding}
              dimensionFilter={dimensionFilter}
              totalFindings={result.findings.length}
              document={document}
              seniority={result.metrics.impliedSeniority}
              enhancementAvailable={enhancementAvailable}
            />

            <ResumePreview
              document={document}
              activeFinding={activeFinding}
              className="max-h-[42rem] xl:sticky xl:top-4 xl:self-start"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      {busy ? (
        <Card className="flex flex-col gap-3">
          <p className="text-sm font-medium">
            {status === 'reading' ? 'Читаю файл…' : 'Анализирую…'}
          </p>
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </Card>
      ) : pasting ? (
        <Card>
          <PasteTextPanel
            onSubmit={(text) => {
              setPasting(false);
              void analyseText(text);
            }}
            onCancel={() => setPasting(false)}
          />
        </Card>
      ) : (
        <>
          <ResumeDropzone
            onFiles={(files) => {
              const [first] = files;
              if (first) void analyseFile(first);
            }}
            onPasteText={() => setPasting(true)}
          />

          {error ? (
            <Callout
              tone="critical"
              title={error.message}
              icon={<AlertTriangle className="size-4" aria-hidden="true" />}
            >
              {error.hint}
            </Callout>
          ) : null}

          <JobInput
            value={jobText}
            onChange={setJobText}
            onApply={applyJob}
            applied={false}
            disabled={busy}
          />
        </>
      )}
    </div>
  );
}
