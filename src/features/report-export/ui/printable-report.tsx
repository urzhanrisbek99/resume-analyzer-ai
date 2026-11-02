import { formatMonths } from '@/shared/lib/dates';
import { plural } from '@/shared/lib/plural';

import {
  bandLabel,
  DIMENSION_LABELS,
  SEVERITY_LABELS,
  type AnalysisResult,
  type Severity,
} from '@/entities/analysis';
import type { ResumeDocument } from '@/entities/resume';

/**
 * Print-only report with every finding expanded, so the saved PDF does not
 * depend on UI state. Uses the browser's PDF output: selectable text, real
 * fonts and links, no PDF library.
 */

export interface PrintableReportProps {
  document: ResumeDocument;
  result: AnalysisResult;
}

const SEVERITY_ORDER: Severity[] = ['critical', 'major', 'minor', 'info'];

export function PrintableReport({ document, result }: PrintableReportProps) {
  const counts = SEVERITY_ORDER.map((severity) => ({
    severity,
    findings: result.findings.filter((finding) => finding.severity === severity),
  })).filter((group) => group.findings.length > 0);

  return (
    <article className="print-report" aria-hidden="true">
      <header className="print-header">
        <h1>Разбор резюме</h1>
        <p className="print-score">
          <strong>{result.overallScore}</strong> из 100 — {bandLabel(result.band)}
        </p>
        <p className="print-meta">
          {document.file.name} · {document.layout.pageCount}{' '}
          {plural(document.layout.pageCount, 'страница', 'страницы', 'страниц')} ·{' '}
          {new Date(result.createdAt).toLocaleDateString('ru-RU')}
        </p>
      </header>

      <section className="print-section">
        <h2>Оценка по измерениям</h2>
        <table className="print-table">
          <thead>
            <tr>
              <th scope="col">Измерение</th>
              <th scope="col">Балл</th>
              <th scope="col">Замечаний</th>
            </tr>
          </thead>
          <tbody>
            {result.dimensions.map((dimension) => {
              const total =
                dimension.findingCounts.critical +
                dimension.findingCounts.major +
                dimension.findingCounts.minor +
                dimension.findingCounts.info;

              return (
                <tr key={dimension.dimension}>
                  <th scope="row">{DIMENSION_LABELS[dimension.dimension]}</th>
                  <td>{dimension.rulesRun === 0 ? '—' : dimension.score}</td>
                  <td>{dimension.rulesRun === 0 ? 'не проверялось' : total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {counts.map(({ severity, findings }) => (
        <section className="print-section" key={severity}>
          <h2>
            {SEVERITY_LABELS[severity]} ({findings.length})
          </h2>

          {findings.map((finding) => (
            <div className="print-finding" key={finding.id}>
              <h3>{finding.title}</h3>
              <p>{finding.detail}</p>
              <p>
                <strong>Почему это важно.</strong> {finding.why}
              </p>
              <p>
                <strong>Что сделать.</strong> {finding.fix}
              </p>

              {finding.example ? (
                <div className="print-example">
                  <p className="print-before">{finding.example.before}</p>
                  <p className="print-after">{finding.example.after}</p>
                </div>
              ) : null}

              <p className="print-rule">
                {DIMENSION_LABELS[finding.dimension]} · −{finding.penalty} баллов · {finding.ruleId}
              </p>
            </div>
          ))}
        </section>
      ))}

      <section className="print-section">
        <h2>Измеренное</h2>
        <table className="print-table">
          <tbody>
            <tr>
              <th scope="row">Пунктов с достижениями</th>
              <td>{result.metrics.bullets.total}</td>
            </tr>
            <tr>
              <th scope="row">С измеримым результатом</th>
              <td>
                {result.metrics.bullets.total === 0
                  ? '—'
                  : `${result.metrics.bullets.quantified} из ${result.metrics.bullets.total}`}
              </td>
            </tr>
            <tr>
              <th scope="row">Суммарный опыт</th>
              <td>
                {result.metrics.tenure.totalMonths > 0
                  ? formatMonths(result.metrics.tenure.totalMonths)
                  : '—'}
              </td>
            </tr>
            <tr>
              <th scope="row">Мест работы</th>
              <td>{result.metrics.tenure.jobCount}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer className="print-footer">
        Движок версии {result.engineVersion}. Оценка детерминирована: тот же документ всегда даёт
        тот же результат.
      </footer>
    </article>
  );
}
