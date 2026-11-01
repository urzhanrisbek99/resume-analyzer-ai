// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { extractFromFile } from '@/entities/resume';

import { makeDocxBuffer, type DocxParagraph } from '@/tests/fixtures/make-docx';

/**
 * DOCX extraction against real archives.
 *
 * Until now this file was covered at three percent: the corpus is plain text,
 * so the layout evidence that only a real document carries -- tables, text
 * boxes, section columns, fonts, header content -- was never exercised. Those
 * are the facts the whole parseability dimension is built on, which made them
 * the least tested and most load-bearing code in the project.
 *
 * Needs a DOM, because the extractor parses OOXML with `DOMParser`.
 */

const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function extract(bytes: ArrayBuffer, fileName = 'cv.docx') {
  const result = await extractFromFile({
    bytes,
    fileName,
    mimeType: MIME,
    sizeBytes: bytes.byteLength,
  });

  if (!result.ok) throw new Error(`${fileName}: ${result.error.message}`);
  return result.value;
}

const RESUME_PARAGRAPHS: DocxParagraph[] = [
  { text: 'Maria Chen', bold: true, sizeHalfPoints: 32 },
  { text: 'Senior Backend Engineer' },
  { text: 'maria.chen@example.com | +1 415 555 0142 | San Francisco' },
  { text: '' },
  { text: 'EXPERIENCE', bold: true, style: 'Heading1' },
  { text: 'Senior Backend Engineer, Stripe, March 2020 - Present' },
  { text: 'Rebuilt the settlement pipeline, raising throughput to 2.1M daily', listItem: true },
  { text: 'Cut p99 latency on the ledger service from 840ms to 95ms', listItem: true },
  { text: '' },
  { text: 'SKILLS', bold: true, style: 'Heading1' },
  { text: 'Go, Python, Kubernetes, PostgreSQL, AWS' },
];

describe('a plain one-column document', () => {
  it('reads the text and reports a clean layout', async () => {
    const extraction = await extract(makeDocxBuffer({ paragraphs: RESUME_PARAGRAPHS }));

    expect(extraction.format).toBe('docx');
    expect(extraction.plainText).toContain('Maria Chen');
    expect(extraction.plainText).toContain('maria.chen@example.com');

    expect(extraction.layout.hasTextLayer).toBe(true);
    expect(extraction.layout.maxColumnsPerPage).toBe(1);
    expect(extraction.layout.tableCount).toBe(0);
    expect(extraction.layout.textBoxCount).toBe(0);
    expect(extraction.layout.hasHeaderFooterContent).toBe(false);
  });

  it('materialises the list markers Word stores as numbering', async () => {
    // Word records a bullet as a numbering property, not a character. Without a
    // marker in the text, bullet detection downstream sees no achievements at
    // all in any Word document.
    const extraction = await extract(makeDocxBuffer({ paragraphs: RESUME_PARAGRAPHS }));

    const bulletLines = extraction.plainText
      .split('\n')
      .filter((line) => line.trimStart().startsWith('•'));

    expect(bulletLines).toHaveLength(2);
    expect(bulletLines[0]).toContain('settlement pipeline');
  });

  it('carries the fonts the document declares', async () => {
    const extraction = await extract(
      makeDocxBuffer({ paragraphs: RESUME_PARAGRAPHS, fonts: ['Calibri'] }),
    );

    expect(extraction.layout.fontFamilies).toContain('Calibri');
    expect(extraction.layout.nonStandardFonts).toHaveLength(0);
  });
});

describe('the layouts that defeat an applicant tracking system', () => {
  it('detects a two-column section', async () => {
    const extraction = await extract(makeDocxBuffer({ paragraphs: RESUME_PARAGRAPHS, columns: 2 }));

    expect(extraction.layout.maxColumnsPerPage).toBe(2);
    expect(extraction.layout.multiColumnPages).toContain(1);
  });

  it('counts tables and still reads what is inside them', async () => {
    const extraction = await extract(
      makeDocxBuffer({
        paragraphs: RESUME_PARAGRAPHS,
        tables: [
          [
            ['Company', 'Role', 'Period'],
            ['Stripe', 'Senior Backend Engineer', '2020 - Present'],
            ['Square', 'Backend Engineer', '2016 - 2020'],
          ],
        ],
      }),
    );

    expect(extraction.layout.tableCount).toBe(1);
    expect(extraction.plainText).toContain('Stripe');
    expect(extraction.plainText).toContain('Senior Backend Engineer');
  });

  it('finds content hidden in a floating text box', async () => {
    const extraction = await extract(
      makeDocxBuffer({
        paragraphs: RESUME_PARAGRAPHS,
        textBoxText: 'Available from June. Open to relocation.',
      }),
    );

    expect(extraction.layout.textBoxCount).toBe(1);
    expect(extraction.warnings.join(' ')).toMatch(/надпис/i);
  });

  it('reports contact details stranded in the page header', async () => {
    const extraction = await extract(
      makeDocxBuffer({
        paragraphs: RESUME_PARAGRAPHS,
        headerText: 'maria.chen@example.com | +1 415 555 0142',
      }),
    );

    expect(extraction.layout.hasHeaderFooterContent).toBe(true);
    expect(extraction.layout.headerFooterSamples.join(' ')).toContain('maria.chen@example.com');
  });

  it('flags fonts outside the set parsers handle reliably', async () => {
    const extraction = await extract(
      makeDocxBuffer({ paragraphs: RESUME_PARAGRAPHS, fonts: ['Brush Script MT'] }),
    );

    expect(extraction.layout.nonStandardFonts).toContain('Brush Script MT');
  });

  it('recovers a hyperlink that never appears as visible text', async () => {
    const extraction = await extract(makeDocxBuffer({ paragraphs: RESUME_PARAGRAPHS }));

    expect(extraction.layout.embeddedLinks.join(' ')).toContain('linkedin.com/in/hidden-link');
    expect(extraction.plainText).not.toContain('hidden-link');
  });
});

describe('page count', () => {
  it('prefers the count Word recorded over an estimate', async () => {
    const extraction = await extract(
      makeDocxBuffer({ paragraphs: RESUME_PARAGRAPHS, pageCount: 3 }),
    );

    expect(extraction.layout.pageCount).toBe(3);
  });

  it('estimates from length when the document does not say', async () => {
    const extraction = await extract(makeDocxBuffer({ paragraphs: RESUME_PARAGRAPHS }));
    expect(extraction.layout.pageCount).toBeGreaterThanOrEqual(1);
  });
});

describe('documents that cannot be read', () => {
  it('explains an archive that is not a Word document', async () => {
    const notADocx = new TextEncoder().encode('this is not a zip archive at all');
    const result = await extractFromFile({
      bytes: notADocx.buffer as ArrayBuffer,
      fileName: 'broken.docx',
      mimeType: MIME,
      sizeBytes: notADocx.byteLength,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('extraction-failed');
  });

  it('refuses a document with almost no text rather than scoring it', async () => {
    const result = await extractFromFile({
      bytes: makeDocxBuffer({ paragraphs: [{ text: 'Hi' }] }),
      fileName: 'empty.docx',
      mimeType: MIME,
      sizeBytes: 500,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('empty-document');
  });
});
