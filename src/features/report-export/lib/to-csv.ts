import { formatMonths } from '@/shared/lib/dates';

import { rankScore, requiredCoverage, type CandidateSummary } from '@/entities/candidate';

/**
 * Shortlist as CSV. Values are RFC 4180 quoted, and the file starts with a
 * BOM because Excel otherwise misreads UTF-8 Cyrillic.
 */

/** Built from its code point: a literal BOM is invisible in source and diffs. */
const BOM = String.fromCharCode(0xfeff);

const FLAG_LABELS: Record<string, string> = {
  'ats-unreadable': 'плохо читается',
  'missing-contacts': 'нет почты',
  'employment-gap': 'перерыв в опыте',
  'short-tenures': 'короткие сроки',
  'undated-experience': 'без дат',
};

export interface ShortlistCsvOptions {
  /** Omits the match columns when no vacancy was supplied. */
  hasJob: boolean;
  jobTitle?: string | null;
  generatedAt?: Date;
}

export function shortlistToCsv(
  candidates: readonly CandidateSummary[],
  { hasJob, jobTitle, generatedAt = new Date() }: ShortlistCsvOptions,
): string {
  const header = [
    'Позиция',
    'Кандидат',
    'Должность в резюме',
    'Почта',
    'Город',
    ...(hasJob
      ? ['Покрытие требований', 'Есть из требований', 'Не найдено', 'Совпадение с вакансией']
      : []),
    'Оценка резюме',
    'Итоговый балл',
    'Опыт',
    'Уровень',
    'Критичных замечаний',
    'Важных замечаний',
    'На что обратить внимание',
  ];

  const rows = candidates.map((candidate, index) => [
    String(index + 1),
    candidate.name ?? candidate.fileName,
    candidate.headline ?? '',
    candidate.email ?? '',
    candidate.location ?? '',
    ...(hasJob
      ? [
          formatCoverage(candidate),
          candidate.skills.matchedRequired.join('; '),
          candidate.skills.missingRequired.join('; '),
          candidate.jobMatchScore === null ? '' : String(candidate.jobMatchScore),
        ]
      : []),
    String(candidate.overallScore),
    String(rankScore(candidate)),
    candidate.experienceMonths > 0 ? formatMonths(candidate.experienceMonths) : '',
    candidate.seniority === 'unknown' ? '' : candidate.seniority,
    String(candidate.criticalCount),
    String(candidate.majorCount),
    candidate.flags.map((flag) => FLAG_LABELS[flag] ?? flag).join('; '),
  ]);

  const preamble = [
    `# Шортлист, ${generatedAt.toLocaleDateString('ru-RU')}`,
    jobTitle ? `# Вакансия: ${jobTitle}` : null,
    `# Кандидатов: ${candidates.length}`,
  ].filter((line): line is string => line !== null);

  return BOM + [...preamble, toRow(header), ...rows.map(toRow)].join('\r\n') + '\r\n';
}

function formatCoverage(candidate: CandidateSummary): string {
  const { matchedRequired, missingRequired } = candidate.skills;
  const total = matchedRequired.length + missingRequired.length;
  if (total === 0) return '';
  return `${matchedRequired.length}/${total} (${Math.round(requiredCoverage(candidate) * 100)}%)`;
}

function toRow(cells: readonly string[]): string {
  return cells.map(escapeCell).join(',');
}

/** RFC 4180 quoting. Leading `= + - @` get an apostrophe to prevent formula injection. */
export function escapeCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}
