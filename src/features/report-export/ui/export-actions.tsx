'use client';

import { FileDown, Printer, Table } from 'lucide-react';

import { Button } from '@/shared/ui/button';

import type { AnalysisResult } from '@/entities/analysis';
import type { CandidateSummary } from '@/entities/candidate';
import type { ResumeDocument } from '@/entities/resume';

import { datedFileName, downloadText, safeFileName } from '../lib/download';
import { shortlistToCsv } from '../lib/to-csv';
import { analysisToMarkdown } from '../lib/to-markdown';

/**
 * Export actions.
 *
 * Both formats are generated in the browser from data already in memory, so
 * exporting keeps the same privacy guarantee as everything else: no upload, no
 * round trip, nothing to intercept.
 */

export interface ReportExportActionsProps {
  document: ResumeDocument;
  result: AnalysisResult;
}

export function ReportExportActions({ document, result }: ReportExportActionsProps) {
  const stem = safeFileName(document.file.name.replace(/\.[^.]+$/, '')) || 'resume';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => window.print()}
        iconLeft={<Printer className="size-4" aria-hidden="true" />}
      >
        Сохранить PDF
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          downloadText(
            datedFileName(`${stem}-отчёт`, 'md'),
            analysisToMarkdown(document, result),
            'text/markdown',
          )
        }
        iconLeft={<FileDown className="size-4" aria-hidden="true" />}
      >
        Markdown
      </Button>
    </div>
  );
}

export interface ShortlistExportActionsProps {
  candidates: readonly CandidateSummary[];
  hasJob: boolean;
  jobTitle: string | null;
}

export function ShortlistExportActions({
  candidates,
  hasJob,
  jobTitle,
}: ShortlistExportActionsProps) {
  if (candidates.length === 0) return null;

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() =>
        downloadText(
          datedFileName('шортлист', 'csv'),
          shortlistToCsv(candidates, { hasJob, jobTitle }),
          'text/csv',
        )
      }
      iconLeft={<Table className="size-4" aria-hidden="true" />}
    >
      Выгрузить CSV
    </Button>
  );
}
