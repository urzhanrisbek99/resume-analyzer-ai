import type { DimensionId, ScoreBand, Severity } from './types';

/**
 * Scoring configuration.
 *
 * Weights are a product judgement, so they live in one visible place rather
 * than being scattered across rules. The reasoning:
 *
 * - `parseability` outweighs everything because its failures are absolute. A
 *   resume an ATS cannot read scores zero on every other dimension in practice,
 *   no matter how well written it is.
 * - `content` is next: it is what decides an interview once a human is reading.
 * - `keywords` is weighted for the case where a job advert was supplied. Without
 *   one, its rules all skip and the weight is redistributed, so a resume is
 *   never punished for a comparison the user did not ask for.
 * - `international` is deliberately modest. It reflects one market's norms, and
 *   a candidate applying locally should not be told their CV is broken.
 */
export const DIMENSION_WEIGHTS: Record<DimensionId, number> = {
  parseability: 0.26,
  structure: 0.18,
  content: 0.24,
  keywords: 0.14,
  narrative: 0.08,
  language: 0.05,
  international: 0.05,
};

export const DIMENSION_LABELS: Record<DimensionId, string> = {
  parseability: 'Читаемость для ATS',
  structure: 'Структура',
  content: 'Содержание',
  keywords: 'Совпадение с вакансией',
  narrative: 'Карьерная история',
  language: 'Язык и оформление',
  international: 'Международный рынок',
};

export const DIMENSION_DESCRIPTIONS: Record<DimensionId, string> = {
  parseability: 'Сможет ли система отбора вообще прочитать файл.',
  structure: 'Есть ли все ожидаемые разделы и контакты, в правильном ли порядке.',
  content: 'Показывают ли формулировки результат, а не список обязанностей.',
  keywords: 'Насколько резюме отвечает конкретной вакансии.',
  narrative: 'Складывается ли карьера в понятную историю без пробелов.',
  language: 'Единообразие дат, списков, времён и читаемость текста.',
  international: 'Готовность к найму в зарубежную компанию.',
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'Критично',
  major: 'Важно',
  minor: 'Мелочь',
  info: 'К сведению',
};

/**
 * Score bands. The thresholds are set so that "good" means a resume that will
 * survive automated screening, not one that is merely above average.
 */
export const SCORE_BANDS: Array<{ band: ScoreBand; min: number; label: string }> = [
  { band: 'excellent', min: 85, label: 'Отличное резюме' },
  { band: 'good', min: 70, label: 'Хорошее, есть что улучшить' },
  { band: 'needs-work', min: 50, label: 'Требует доработки' },
  { band: 'poor', min: 0, label: 'Нужна серьёзная переработка' },
];

export function bandFor(score: number): ScoreBand {
  return SCORE_BANDS.find((entry) => score >= entry.min)?.band ?? 'poor';
}

export function bandLabel(band: ScoreBand): string {
  return SCORE_BANDS.find((entry) => entry.band === band)?.label ?? '';
}

/**
 * Engine version, embedded in every result.
 *
 * Bumped whenever rules or weights change, so a stored score can always be
 * traced back to the logic that produced it and stale results are detectable.
 */
export const ENGINE_VERSION = '1.0.0';
