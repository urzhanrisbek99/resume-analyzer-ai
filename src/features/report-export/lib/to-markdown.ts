import { formatMonths } from '@/shared/lib/dates';
import { plural } from '@/shared/lib/plural';

import {
  bandLabel,
  DIMENSION_LABELS,
  SEVERITY_LABELS,
  type AnalysisResult,
  type Finding,
  type Severity,
} from '@/entities/analysis';
import type { ResumeDocument } from '@/entities/resume';

/**
 * The report as text.
 *
 * Markdown rather than a rendered file because the usual next step is pasting
 * it somewhere: into notes while rewriting, into a message to whoever is
 * helping, into an issue. It also survives being read as plain text, which a
 * PDF does not.
 *
 * Findings keep engine order, so the document is a work list rather than a
 * catalogue: fix from the top and stop when time runs out.
 */

export interface MarkdownReportOptions {
  /** Included so a saved report can be traced to the version that made it. */
  generatedAt?: Date;
  /** Omitted by default: the point of the report is usually to share it. */
  includeContacts?: boolean;
}

export function analysisToMarkdown(
  document: ResumeDocument,
  result: AnalysisResult,
  { generatedAt = new Date(), includeContacts = false }: MarkdownReportOptions = {},
): string {
  const sections: string[] = [];

  sections.push(header(document, result, generatedAt, includeContacts));
  sections.push(dimensionTable(result));

  const bySeverity = groupBySeverity(result.findings);
  for (const severity of ['critical', 'major', 'minor', 'info'] as const) {
    const findings = bySeverity.get(severity);
    if (!findings || findings.length === 0) continue;
    sections.push(findingsSection(severity, findings));
  }

  sections.push(metricsSection(result));
  sections.push(footer(result));

  return sections.join('\n\n');
}

function header(
  document: ResumeDocument,
  result: AnalysisResult,
  generatedAt: Date,
  includeContacts: boolean,
): string {
  const lines = [
    '# Разбор резюме',
    '',
    `**Итоговая оценка: ${result.overallScore} из 100** — ${bandLabel(result.band)}`,
    '',
    `- Файл: ${document.file.name}`,
    `- Страниц: ${document.layout.pageCount}`,
    `- Разобрано: ${generatedAt.toLocaleString('ru-RU')}`,
  ];

  if (includeContacts && document.contacts.fullName) {
    lines.push(`- Кандидат: ${document.contacts.fullName}`);
  }

  const counts = countSeverities(result.findings);
  if (counts.critical > 0) {
    lines.push(
      '',
      `> ${counts.critical} ${plural(counts.critical, 'критичная проблема', 'критичные проблемы', 'критичных проблем')}. ` +
        'С ними резюме отсеивается автоматическим отбором, не доходя до человека.',
    );
  }

  return lines.join('\n');
}

function dimensionTable(result: AnalysisResult): string {
  const rows = result.dimensions.map((dimension) => {
    const score = dimension.rulesRun === 0 ? '—' : String(dimension.score);
    const note =
      dimension.rulesRun === 0
        ? 'не проверялось'
        : `${dimension.rulesRun} ${plural(dimension.rulesRun, 'проверка', 'проверки', 'проверок')}`;

    return `| ${DIMENSION_LABELS[dimension.dimension]} | ${score} | ${note} |`;
  });

  return [
    '## Оценка по измерениям',
    '',
    '| Измерение | Балл | Проверок |',
    '| --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function findingsSection(severity: Severity, findings: Finding[]): string {
  const blocks = findings.map((finding) => {
    const lines = [
      `### ${finding.title}`,
      '',
      finding.detail,
      '',
      `**Почему это важно.** ${finding.why}`,
      '',
      `**Что сделать.** ${finding.fix}`,
    ];

    if (finding.example) {
      lines.push('', '```diff', `- ${finding.example.before}`, `+ ${finding.example.after}`, '```');
    }

    const anchors = finding.anchors
      .map((anchor) => anchor.label)
      .filter((label): label is string => Boolean(label));

    if (anchors.length > 0) {
      lines.push('', 'Относится к:', ...anchors.map((label) => `- ${label}`));
    }

    lines.push(
      '',
      `<sub>${DIMENSION_LABELS[finding.dimension]} · −${finding.penalty} баллов · \`${finding.ruleId}\`</sub>`,
    );

    return lines.join('\n');
  });

  return [`## ${SEVERITY_LABELS[severity]} (${findings.length})`, '', blocks.join('\n\n')].join(
    '\n',
  );
}

function metricsSection(result: AnalysisResult): string {
  const { bullets, tenure } = result.metrics;

  const rows: Array<[string, string]> = [
    ['Слов в резюме', String(result.metrics.wordCount)],
    ['Пунктов с достижениями', String(bullets.total)],
    [
      'Из них с измеримым результатом',
      bullets.total === 0
        ? '—'
        : `${bullets.quantified} (${Math.round((bullets.quantified / bullets.total) * 100)}%)`,
    ],
    ['Начинаются с глагола действия', bullets.total === 0 ? '—' : String(bullets.actionVerbLed)],
    ['Суммарный опыт', tenure.totalMonths > 0 ? formatMonths(tenure.totalMonths) : '—'],
    ['Мест работы', String(tenure.jobCount)],
    ['Перерывов длиннее полугода', String(tenure.gaps.filter((gap) => gap.months >= 6).length)],
  ];

  return [
    '## Измеренное',
    '',
    '| Показатель | Значение |',
    '| --- | --- |',
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
  ].join('\n');
}

function footer(result: AnalysisResult): string {
  return [
    '---',
    '',
    `<sub>Движок версии ${result.engineVersion}. Оценка детерминирована: тот же документ всегда даёт тот же результат.</sub>`,
  ].join('\n');
}

function groupBySeverity(findings: readonly Finding[]): Map<Severity, Finding[]> {
  const grouped = new Map<Severity, Finding[]>();
  for (const finding of findings) {
    const bucket = grouped.get(finding.severity);
    if (bucket) bucket.push(finding);
    else grouped.set(finding.severity, [finding]);
  }
  return grouped;
}

function countSeverities(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, major: 0, minor: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}
