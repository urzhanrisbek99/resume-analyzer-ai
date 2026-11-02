import type { DimensionId, ScoreBand, Severity } from './types';

/**
 * Dimension weights:
 * - parseability is highest: an unreadable file fails everything else too;
 * - content decides the interview once a human reads it;
 * - keywords are redistributed when no job ad is given;
 * - international is low: it reflects foreign-market norms only.
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

/** "Good" means the resume should survive automated screening. */
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

/** Bump when rules or weights change, so stored scores can be traced. */
export const ENGINE_VERSION = '1.0.0';
