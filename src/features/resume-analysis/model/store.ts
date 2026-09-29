'use client';

import { create } from 'zustand';

import { UPLOAD_LIMITS } from '@/shared/config/app';
import { appError, type AppError } from '@/shared/lib/result';

import {
  analyseResume,
  type AnalysisResult,
  type DimensionId,
  type JobContext,
} from '@/entities/analysis';
import { parseJobDescription } from '@/entities/job-description';
import {
  buildResumeDocument,
  extractFromFile,
  extractFromText,
  type ResumeDocument,
} from '@/entities/resume';

/**
 * Analysis state.
 *
 * The whole pipeline runs here, in the browser: the file is read into memory,
 * parsed, scored and displayed without a single byte crossing the network. That
 * is a deliberate product guarantee, not an implementation detail -- see
 * docs/adr/0003-privacy-boundary.md -- and it is also why this is a store rather
 * than a server action.
 */

export type AnalysisStatus = 'idle' | 'reading' | 'analysing' | 'ready' | 'error';

/** Which findings the panel is showing. */
export type DimensionFilter = DimensionId | 'all';

interface AnalysisState {
  status: AnalysisStatus;
  document: ResumeDocument | null;
  result: AnalysisResult | null;
  error: AppError | null;
  fileName: string | null;
  /** Milliseconds spent on the last full run, shown in the diagnostics panel. */
  durationMs: number;

  jobText: string;
  selectedFindingId: string | null;
  dimensionFilter: DimensionFilter;

  analyseFile: (file: File) => Promise<void>;
  analyseText: (text: string, label?: string) => Promise<void>;
  setJobText: (text: string) => void;
  applyJob: () => void;
  selectFinding: (findingId: string | null) => void;
  setDimensionFilter: (filter: DimensionFilter) => void;
  reset: () => void;
}

const INITIAL = {
  status: 'idle' as AnalysisStatus,
  document: null,
  result: null,
  error: null,
  fileName: null,
  durationMs: 0,
  jobText: '',
  selectedFindingId: null,
  dimensionFilter: 'all' as DimensionFilter,
};

/** Map a parsed advert onto the minimal shape the engine consumes. */
function toJobContext(jobText: string): JobContext | null {
  const trimmed = jobText.trim();
  if (trimmed.length < 40) return null;

  const job = parseJobDescription(trimmed);
  return {
    title: job.title,
    requiredSkills: job.skills.filter((skill) => skill.required).map((skill) => skill.canonical),
    niceToHaveSkills: job.skills.filter((skill) => !skill.required).map((skill) => skill.canonical),
    seniority: job.seniority,
    plainText: job.plainText,
  };
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  ...INITIAL,

  async analyseFile(file: File) {
    set({ status: 'reading', error: null, fileName: file.name, selectedFindingId: null });

    if (file.size > UPLOAD_LIMITS.maxFileBytes) {
      const limitMb = Math.round(UPLOAD_LIMITS.maxFileBytes / (1024 * 1024));
      set({
        status: 'error',
        error: appError(
          'file-too-large',
          `Файл больше ${limitMb} МБ.`,
          'Резюме такого размера почти всегда означает тяжёлые картинки — уберите их.',
        ),
      });
      return;
    }

    const started = performance.now();

    try {
      const bytes = await file.arrayBuffer();
      const extracted = await extractFromFile({
        bytes,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      if (!extracted.ok) {
        set({ status: 'error', error: extracted.error });
        return;
      }

      set({ status: 'analysing' });

      const document = buildResumeDocument({
        extraction: extracted.value,
        file: { name: file.name, sizeBytes: file.size },
        extractionMs: performance.now() - started,
      });

      const result = analyseResume(document, { job: toJobContext(get().jobText) });

      set({
        status: 'ready',
        document,
        result,
        durationMs: Math.round(performance.now() - started),
      });
    } catch (cause) {
      set({
        status: 'error',
        error: appError(
          'extraction-failed',
          `Не удалось обработать «${file.name}».`,
          'Попробуйте другой формат — PDF, DOCX или обычный текст.',
          cause,
        ),
      });
    }
  },

  async analyseText(text: string, label = 'Вставленный текст') {
    set({ status: 'analysing', error: null, fileName: label, selectedFindingId: null });
    const started = performance.now();

    const extracted = extractFromText(text);
    if (!extracted.ok) {
      set({ status: 'error', error: extracted.error });
      return;
    }

    const document = buildResumeDocument({
      extraction: extracted.value,
      file: { name: label, sizeBytes: text.length },
      extractionMs: performance.now() - started,
    });

    const result = analyseResume(document, { job: toJobContext(get().jobText) });

    set({
      status: 'ready',
      document,
      result,
      durationMs: Math.round(performance.now() - started),
    });
  },

  setJobText(text: string) {
    set({ jobText: text });
  },

  /**
   * Re-score against the current advert.
   *
   * Cheap enough to run synchronously: the document is already parsed, and the
   * engine is pure arithmetic over it.
   */
  applyJob() {
    const { document, jobText } = get();
    if (!document) return;

    set({
      result: analyseResume(document, { job: toJobContext(jobText) }),
      selectedFindingId: null,
    });
  },

  selectFinding(findingId) {
    set({ selectedFindingId: get().selectedFindingId === findingId ? null : findingId });
  },

  setDimensionFilter(filter) {
    set({ dimensionFilter: filter, selectedFindingId: null });
  },

  reset() {
    set({ ...INITIAL });
  },
}));

/** Findings for the active dimension filter, in engine order. */
export function useVisibleFindings() {
  return useAnalysisStore((state) => {
    const findings = state.result?.findings ?? [];
    return state.dimensionFilter === 'all'
      ? findings
      : findings.filter((finding) => finding.dimension === state.dimensionFilter);
  });
}
