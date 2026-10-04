'use client';

import { useMemo } from 'react';
import { create } from 'zustand';

import { UPLOAD_LIMITS } from '@/shared/config/app';
import { stableId } from '@/shared/lib/id';
import { toErrorMessage } from '@/shared/lib/result';

import { analyseResume, type JobContext } from '@/entities/analysis';
import {
  DEFAULT_SORT,
  sortCandidates,
  type CandidateFailure,
  type CandidateSummary,
  type SortKey,
  type SortState,
} from '@/entities/candidate';
import { parseJobDescription } from '@/entities/job-description';
import { buildResumeDocument, extractFromFile, type ResumeDocument } from '@/entities/resume';

import { summariseCandidate } from '../lib/summarise';

/**
 * Batch screening state.
 *
 * Parsed documents are kept, not just their summaries. Changing the vacancy
 * then re-scores the whole shortlist from memory in milliseconds instead of
 * re-reading forty files -- which is the difference between a tool a recruiter
 * will iterate with and one they will run once.
 */

export type BatchStatus = 'idle' | 'processing' | 'ready';

/** A file that parsed, kept so re-scoring never touches the disk again. */
interface ParsedRecord {
  id: string;
  fileName: string;
  document: ResumeDocument;
}

interface BatchState {
  status: BatchStatus;
  jobText: string;
  /** True once the current vacancy text has been scored against. */
  jobApplied: boolean;

  records: ParsedRecord[];
  summaries: CandidateSummary[];
  failures: CandidateFailure[];

  processed: number;
  total: number;

  sort: SortState;
  selectedCandidateId: string | null;

  setJobText: (text: string) => void;
  applyJob: () => void;
  addFiles: (files: File[]) => Promise<void>;
  removeCandidate: (candidateId: string) => void;
  toggleSort: (key: SortKey) => void;
  selectCandidate: (candidateId: string | null) => void;
  reset: () => void;
}

const INITIAL = {
  status: 'idle' as BatchStatus,
  jobText: '',
  jobApplied: false,
  records: [] as ParsedRecord[],
  summaries: [] as CandidateSummary[],
  failures: [] as CandidateFailure[],
  processed: 0,
  total: 0,
  sort: DEFAULT_SORT,
  selectedCandidateId: null,
};

const MIN_JOB_CHARS = 40;

function toJobContext(jobText: string): JobContext | null {
  const trimmed = jobText.trim();
  if (trimmed.length < MIN_JOB_CHARS) return null;

  const job = parseJobDescription(trimmed);
  return {
    title: job.title,
    requiredSkills: job.skills.filter((skill) => skill.required).map((skill) => skill.canonical),
    niceToHaveSkills: job.skills.filter((skill) => !skill.required).map((skill) => skill.canonical),
    seniority: job.seniority,
    plainText: job.plainText,
  };
}

function summariseAll(records: ParsedRecord[], job: JobContext | null): CandidateSummary[] {
  return records.map((record) =>
    summariseCandidate({
      id: record.id,
      fileName: record.fileName,
      document: record.document,
      result: analyseResume(record.document, { job }),
      job,
    }),
  );
}

/** Hand the main thread back so progress actually paints between files. */
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export const useBatchStore = create<BatchState>((set, get) => ({
  ...INITIAL,

  setJobText(text) {
    set({ jobText: text, jobApplied: false });
  },

  applyJob() {
    const { records, jobText } = get();
    const job = toJobContext(jobText);

    set({
      summaries: summariseAll(records, job),
      jobApplied: job !== null,
      selectedCandidateId: null,
    });
  },

  /**
   * Read and score a batch.
   *
   * Files are processed one at a time with a yield between them. Parsing a PDF
   * is tens of milliseconds of synchronous work; forty of them back to back
   * freeze the tab, and the recruiter sees nothing until the end.
   */
  async addFiles(files) {
    const existing = get().records.length + get().failures.length;
    const room = UPLOAD_LIMITS.maxBatchFiles - existing;
    const accepted = files.slice(0, Math.max(0, room));

    if (accepted.length === 0) return;

    const job = toJobContext(get().jobText);

    set({
      status: 'processing',
      processed: 0,
      total: accepted.length,
      jobApplied: job !== null,
    });

    for (const [index, file] of accepted.entries()) {
      const id = stableId('cand', file.name, file.size, existing + index);

      try {
        if (file.size > UPLOAD_LIMITS.maxFileBytes) {
          throw new Error(
            `Файл больше ${Math.round(UPLOAD_LIMITS.maxFileBytes / (1024 * 1024))} МБ`,
          );
        }

        const started = performance.now();
        const extracted = await extractFromFile({
          bytes: await file.arrayBuffer(),
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        });

        if (!extracted.ok) {
          set((state) => ({
            failures: [
              ...state.failures,
              {
                id,
                fileName: file.name,
                message: extracted.error.message,
                ...(extracted.error.hint ? { hint: extracted.error.hint } : {}),
              },
            ],
          }));
        } else {
          const document = buildResumeDocument({
            extraction: extracted.value,
            file: { name: file.name, sizeBytes: file.size },
            extractionMs: performance.now() - started,
          });

          const record: ParsedRecord = { id, fileName: file.name, document };
          const summary = summariseCandidate({
            id,
            fileName: file.name,
            document,
            result: analyseResume(document, { job }),
            job,
          });

          set((state) => ({
            records: [...state.records, record],
            summaries: [...state.summaries, summary],
          }));
        }
      } catch (cause) {
        set((state) => ({
          failures: [
            ...state.failures,
            {
              id,
              fileName: file.name,
              message: `Не удалось обработать файл: ${toErrorMessage(cause)}`,
            },
          ],
        }));
      }

      set((state) => ({ processed: state.processed + 1 }));
      await yieldToBrowser();
    }

    set({ status: 'ready' });
  },

  removeCandidate(candidateId) {
    set((state) => ({
      records: state.records.filter((record) => record.id !== candidateId),
      summaries: state.summaries.filter((summary) => summary.id !== candidateId),
      failures: state.failures.filter((failure) => failure.id !== candidateId),
      selectedCandidateId:
        state.selectedCandidateId === candidateId ? null : state.selectedCandidateId,
    }));
  },

  /** Clicking the active column flips direction; a new column starts descending. */
  toggleSort(key) {
    set((state) => ({
      sort:
        state.sort.key === key
          ? { key, direction: state.sort.direction === 'desc' ? 'asc' : 'desc' }
          : { key, direction: key === 'name' ? 'asc' : 'desc' },
    }));
  },

  selectCandidate(candidateId) {
    set((state) => ({
      selectedCandidateId: state.selectedCandidateId === candidateId ? null : candidateId,
    }));
  },

  reset() {
    set({ ...INITIAL });
  },
}));

const NO_CANDIDATES: readonly CandidateSummary[] = [];

/**
 * The shortlist in display order.
 *
 * Sorted in a memo rather than in the selector: a selector that returns a new
 * array every call never compares equal to its previous result and re-renders
 * forever.
 */
export function useSortedCandidates(): readonly CandidateSummary[] {
  const summaries = useBatchStore((state) => state.summaries);
  const sort = useBatchStore((state) => state.sort);

  return useMemo(
    () => (summaries.length === 0 ? NO_CANDIDATES : sortCandidates(summaries, sort)),
    [summaries, sort],
  );
}
