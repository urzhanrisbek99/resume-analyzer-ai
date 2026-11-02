import { toErrorMessage } from '@/shared/lib/result';

import { analyseResume, type JobContext } from '@/entities/analysis';
import type { CandidateFailure, CandidateSummary } from '@/entities/candidate';
import { buildResumeDocument, extractFromFile, type ResumeDocument } from '@/entities/resume';

import { summariseCandidate } from './summarise';

/**
 * Reads, scores and summarises one file. Plain async function with no worker,
 * store or DOM dependency, so the worker and the main-thread fallback share it.
 */

export interface ScreenFileInput {
  id: string;
  fileName: string;
  /** Detached by the caller when transferred to a worker. */
  bytes: ArrayBuffer;
  mimeType: string;
  sizeBytes: number;
}

export type ScreenOutcome =
  | { status: 'ready'; document: ResumeDocument; summary: CandidateSummary }
  | { status: 'failed'; failure: CandidateFailure };

export async function screenFile(
  input: ScreenFileInput,
  job: JobContext | null,
): Promise<ScreenOutcome> {
  const started = performance.now();

  try {
    const extracted = await extractFromFile({
      bytes: input.bytes,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    });

    if (!extracted.ok) {
      return {
        status: 'failed',
        failure: {
          id: input.id,
          fileName: input.fileName,
          message: extracted.error.message,
          ...(extracted.error.hint ? { hint: extracted.error.hint } : {}),
        },
      };
    }

    const document = buildResumeDocument({
      extraction: extracted.value,
      file: { name: input.fileName, sizeBytes: input.sizeBytes },
      extractionMs: performance.now() - started,
    });

    return {
      status: 'ready',
      document,
      summary: summariseCandidate({
        id: input.id,
        fileName: input.fileName,
        document,
        result: analyseResume(document, { job }),
        job,
      }),
    };
  } catch (cause) {
    return {
      status: 'failed',
      failure: {
        id: input.id,
        fileName: input.fileName,
        message: `Не удалось обработать файл: ${toErrorMessage(cause)}`,
      },
    };
  }
}
