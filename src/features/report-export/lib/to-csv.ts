import { formatMonths } from '@/shared/lib/dates';

import { rankScore, requiredCoverage, type CandidateSummary } from '@/entities/candidate';

/**
 * The shortlist as a spreadsheet.
 *
 * CSV is the format recruiters actually work in: it opens in Excel, in Google
 * Sheets and in whatever the ATS imports. Two details decide whether it works
 * at all, and both are easy to get wrong:
 *
 *   - Quoting. A value containing a comma, a quote or a newline must be wrapped
 *     and its quotes doubled, or the row silently splits into the wrong columns.
 *   - Encoding. Excel reads a UTF-8 file as the system codepage unless it finds
 *     a byte-order mark, which turns every Cyrillic name into mojibake.
 */

/**
 * Excel needs this to recognise UTF-8. Sheets and LibreOffice ignore it.
 *
 * Built from its code point: a literal byte-order mark in source is an
 * invisible character that no reviewer can see and no diff explains.
 */
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
  /** Written into the header comment so the file explains itself later. */
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

/**
 * RFC 4180 quoting.
 *
 * A leading `=`, `+`, `-` or `@` is also prefixed with an apostrophe: without
 * it a spreadsheet treats the value as a formula, which is both wrong and a
 * known injection vector when the file is opened by someone else.
 */
export function escapeCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}
