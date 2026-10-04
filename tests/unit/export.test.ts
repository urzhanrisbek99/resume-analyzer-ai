import { describe, expect, it } from 'vitest';

import { analyseResume } from '@/entities/analysis';
import type { CandidateSummary } from '@/entities/candidate';
import { buildResumeDocument, extractFromText } from '@/entities/resume';
import {
  analysisToMarkdown,
  datedFileName,
  escapeCell,
  safeFileName,
  shortlistToCsv,
} from '@/features/report-export';

import { WEAK_RESUME } from '@/tests/fixtures/resumes';

function candidate(overrides: Partial<CandidateSummary> = {}): CandidateSummary {
  return {
    id: 'c',
    fileName: 'cv.pdf',
    name: 'Анна Иванова',
    headline: 'Frontend Engineer',
    email: 'anna@example.com',
    location: 'Алматы',
    overallScore: 72,
    jobMatchScore: 64,
    parseabilityScore: 90,
    experienceMonths: 42,
    seniority: 'middle',
    skills: { matchedRequired: ['React'], missingRequired: ['Next.js'], matchedOptional: [] },
    criticalCount: 1,
    majorCount: 2,
    flags: ['employment-gap'],
    ...overrides,
  };
}

const FIXED_DATE = new Date('2026-10-04T12:00:00.000Z');

describe('escapeCell', () => {
  it('leaves an ordinary value alone', () => {
    expect(escapeCell('Анна Иванова')).toBe('Анна Иванова');
  });

  it('quotes a value containing a comma', () => {
    expect(escapeCell('Алматы, Казахстан')).toBe('"Алматы, Казахстан"');
  });

  it('doubles embedded quotes', () => {
    expect(escapeCell('ТОО "Альфа"')).toBe('"ТОО ""Альфа"""');
  });

  it('quotes a value containing a newline', () => {
    expect(escapeCell('первая\nвторая')).toBe('"первая\nвторая"');
  });

  /*
   * A cell starting with an operator is executed as a formula by Excel and
   * Sheets. That is wrong on its own and is a known way to attack whoever opens
   * the file, so the value is neutralised rather than passed through.
   */
  it('neutralises a value a spreadsheet would run as a formula', () => {
    expect(escapeCell('=1+1')).toBe("'=1+1");
    expect(escapeCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCell('-2+3')).toBe("'-2+3");
    expect(escapeCell('+1')).toBe("'+1");
  });
});

describe('shortlistToCsv', () => {
  it('starts with a byte-order mark so Excel reads UTF-8', () => {
    const csv = shortlistToCsv([candidate()], { hasJob: true, generatedAt: FIXED_DATE });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('uses CRLF line endings, as the format specifies', () => {
    const csv = shortlistToCsv([candidate()], { hasJob: true, generatedAt: FIXED_DATE });
    expect(csv).toContain('\r\n');
    expect(csv.split('\r\n').length).toBeGreaterThan(3);
  });

  it('keeps every row the same width as the header', () => {
    const csv = shortlistToCsv([candidate(), candidate({ id: 'd', name: 'Борис' })], {
      hasJob: true,
      generatedAt: FIXED_DATE,
    });

    const rows = stripBom(csv)
      .split('\r\n')
      .filter((row) => row.length > 0 && !row.startsWith('#'));

    const widths = new Set(rows.map((row) => countCells(row)));
    expect(widths.size).toBe(1);
  });

  it('drops the match columns when no vacancy was supplied', () => {
    const withJob = shortlistToCsv([candidate()], { hasJob: true, generatedAt: FIXED_DATE });
    const without = shortlistToCsv([candidate()], { hasJob: false, generatedAt: FIXED_DATE });

    expect(withJob).toContain('Покрытие требований');
    expect(without).not.toContain('Покрытие требований');
    expect(countCells(headerRow(without))).toBeLessThan(countCells(headerRow(withJob)));
  });

  it('records the vacancy so the file explains itself later', () => {
    const csv = shortlistToCsv([candidate()], {
      hasJob: true,
      jobTitle: 'Senior Frontend Engineer',
      generatedAt: FIXED_DATE,
    });

    expect(csv).toContain('# Вакансия: Senior Frontend Engineer');
    expect(csv).toContain('# Кандидатов: 1');
  });

  it('survives a candidate whose name contains a comma and a quote', () => {
    const csv = shortlistToCsv(
      [candidate({ name: 'Иванова, Анна "А."', location: 'Алматы, KZ' })],
      { hasJob: false, generatedAt: FIXED_DATE },
    );

    expect(csv).toContain('"Иванова, Анна ""А."""');
    expect(countCells(headerRow(csv))).toBe(countCells(dataRows(csv)[0]!));
  });

  it('writes an empty cell rather than a zero for an unscored candidate', () => {
    const csv = shortlistToCsv([candidate({ jobMatchScore: null })], {
      hasJob: true,
      generatedAt: FIXED_DATE,
    });

    const cells = splitRow(dataRows(csv)[0]!);
    const index = splitRow(headerRow(csv)).indexOf('Совпадение с вакансией');
    expect(cells[index]).toBe('');
  });
});

describe('analysisToMarkdown', () => {
  const extracted = extractFromText(WEAK_RESUME);
  if (!extracted.ok) throw new Error(extracted.error.message);

  const document = buildResumeDocument({
    extraction: extracted.value,
    file: { name: 'resume.txt', sizeBytes: WEAK_RESUME.length },
    extractionMs: 0,
  });
  const result = analyseResume(document, { now: FIXED_DATE });

  it('leads with the score', () => {
    const markdown = analysisToMarkdown(document, result, { generatedAt: FIXED_DATE });
    expect(markdown.startsWith('# Разбор резюме')).toBe(true);
    expect(markdown).toContain(`**Итоговая оценка: ${result.overallScore} из 100**`);
  });

  it('includes every finding the engine produced', () => {
    const markdown = analysisToMarkdown(document, result, { generatedAt: FIXED_DATE });
    for (const finding of result.findings) {
      expect(markdown).toContain(finding.title);
      expect(markdown).toContain(finding.ruleId);
    }
  });

  it('carries the reasoning, not just the verdict', () => {
    const markdown = analysisToMarkdown(document, result, { generatedAt: FIXED_DATE });
    expect(markdown).toContain('**Почему это важно.**');
    expect(markdown).toContain('**Что сделать.**');
  });

  it('leaves the candidate name out unless asked for it', () => {
    const shared = analysisToMarkdown(document, result, { generatedAt: FIXED_DATE });
    const personal = analysisToMarkdown(document, result, {
      generatedAt: FIXED_DATE,
      includeContacts: true,
    });

    expect(shared).not.toContain('Кандидат:');
    if (document.contacts.fullName) expect(personal).toContain('Кандидат:');
  });

  it('is reproducible for the same input', () => {
    const first = analysisToMarkdown(document, result, { generatedAt: FIXED_DATE });
    const second = analysisToMarkdown(document, result, { generatedAt: FIXED_DATE });
    expect(second).toBe(first);
  });
});

describe('file names', () => {
  it('strips characters a filesystem rejects', () => {
    expect(safeFileName('Иванова/Анна: CV*2026?')).toBe('Иванова-Анна- CV-2026-');
  });

  it('never returns an empty name', () => {
    expect(safeFileName('...')).toBe('export');
    expect(safeFileName('   ')).toBe('export');
  });

  it('dates a file so saved copies sort by hand', () => {
    expect(datedFileName('шортлист', 'csv', FIXED_DATE)).toBe('шортлист-2026-10-04.csv');
  });
});

/* ----------------------------------------------------------------------- */

/**
 * Drop the byte-order mark before parsing.
 *
 * Built from its code point rather than written literally: an invisible
 * character in a regex is unreviewable, and the lint rule that forbids it here
 * exists for exactly that reason.
 */
function stripBom(csv: string): string {
  return csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
}

function headerRow(csv: string): string {
  return stripBom(csv)
    .split('\r\n')
    .find((row) => row.startsWith('Позиция'))!;
}

function dataRows(csv: string): string[] {
  const rows = stripBom(csv).split('\r\n');
  const start = rows.findIndex((row) => row.startsWith('Позиция'));
  return rows.slice(start + 1).filter((row) => row.length > 0);
}

/** Split on commas that sit outside quotes, the way a parser would. */
function splitRow(row: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i += 1) {
    const char = row[i];
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);

  return cells;
}

function countCells(row: string): number {
  return splitRow(row).length;
}
