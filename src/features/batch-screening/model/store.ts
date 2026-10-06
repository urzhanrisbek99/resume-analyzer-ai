'use client';

import { useMemo } from 'react';
import { create } from 'zustand';

import { UPLOAD_LIMITS } from '@/shared/config/app';
import { stableId } from '@/shared/lib/id';

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
import type { ResumeDocument } from '@/entities/resume';

import { summariseCandidate } from '../lib/summarise';
import { runScreening, workersSupported } from '../lib/worker-pool';

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
  /** Parsed once on apply, so the export can label the file. */
  jobTitle: string | null;

  records: ParsedRecord[];
  summaries: CandidateSummary[];
  failures: CandidateFailure[];

  processed: number;
  total: number;
  /** False when the browser refused workers and the main thread did the work. */
  offThread: boolean;

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
  jobTitle: null,
  records: [] as ParsedRecord[],
  summaries: [] as CandidateSummary[],
  failures: [] as CandidateFailure[],
  processed: 0,
  total: 0,
  offThread: false,
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
      jobTitle: job?.title ?? null,
      selectedCandidateId: null,
    });
  },

  /**
   * Read and score a batch, off the main thread where possible.
   *
   * Results are applied as they arrive rather than at the end, so the table
   * fills in progressively. Completion order is not input order, which is fine:
   * the shortlist is sorted by fit, never by upload sequence.
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
      jobTitle: job?.title ?? null,
      offThread: workersSupported(),
    });

    const inputs = await Promise.all(
      accepted.map(async (file, index) => ({
        id: stableId('cand', file.name, file.size, existing + index),
        fileName: file.name,
        bytes: await file.arrayBuffer(),
        mimeType: file.type,
        sizeBytes: file.size,
      })),
    );

    const oversized = inputs.filter((input) => input.sizeBytes > UPLOAD_LIMITS.maxFileBytes);
    const withinLimit = inputs.filter((input) => input.sizeBytes <= UPLOAD_LIMITS.maxFileBytes);

    if (oversized.length > 0) {
      const limitMb = Math.round(UPLOAD_LIMITS.maxFileBytes / (1024 * 1024));
      set((state) => ({
        failures: [
          ...state.failures,
          ...oversized.map((input) => ({
            id: input.id,
            fileName: input.fileName,
            message: `Файл больше ${limitMb} МБ.`,
            hint: 'Резюме такого размера почти всегда означает тяжёлые картинки.',
          })),
        ],
        processed: state.processed + oversized.length,
      }));
    }

    await runScreening({
      files: withinLimit,
      job,
      onResult: (outcome) => {
        set((state) =>
          outcome.status === 'ready'
            ? {
                records: [
                  ...state.records,
                  {
                    id: outcome.summary.id,
                    fileName: outcome.summary.fileName,
                    document: outcome.document,
                  },
                ],
                summaries: [...state.summaries, outcome.summary],
                processed: state.processed + 1,
              }
            : {
                failures: [...state.failures, outcome.failure],
                processed: state.processed + 1,
              },
        );
      },
    });

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
