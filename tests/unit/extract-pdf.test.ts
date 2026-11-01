import { beforeAll, describe, expect, it } from 'vitest';

import { extractFromFile } from '@/entities/resume';

import { column, makePdfBuffer, type PdfRun } from '@/tests/fixtures/make-pdf';

/**
 * PDF extraction against real documents.
 *
 * This file was covered at three percent, which made it the least tested and
 * most load-bearing code in the project: the whole parseability dimension is
 * built on evidence only a real PDF carries. Text fixtures cannot express a
 * column gutter or a header, because those are positions, not characters.
 *
 * Pages are built by placing runs at explicit coordinates, so each test reads
 * as a description of a page rather than an opaque binary.
 */

const PAGE_WIDTH = 612;

/**
 * Loading pdf.js costs several seconds, and whichever test paid for it first
 * would fail the default timeout for a reason that has nothing to do with what
 * it asserts. Paying it once up front keeps every timing honest.
 */
beforeAll(async () => {
  await extract(
    makePdfBuffer({ pages: [{ runs: column({ x: 72, startY: 700, lines: ['warm up'] }) }] }),
  );
}, 60_000);

async function extract(bytes: ArrayBuffer, fileName = 'cv.pdf') {
  return extractFromFile({
    bytes,
    fileName,
    mimeType: 'application/pdf',
    sizeBytes: bytes.byteLength,
  });
}

async function extractOk(bytes: ArrayBuffer, fileName = 'cv.pdf') {
  const result = await extract(bytes, fileName);
  if (!result.ok) throw new Error(`${fileName}: ${result.error.message}`);
  return result.value;
}

const BODY_LINES = [
  'Senior Backend Engineer, Stripe',
  'March 2020 - Present',
  'Rebuilt the settlement pipeline',
  'Cut p99 latency to 95ms',
  'Led a team of five engineers',
  'Backend Engineer, Square',
  'July 2016 - February 2020',
  'Designed dispute resolution',
  'Reduced on-call pages by 62%',
];

function singleColumnPage(): PdfRun[] {
  return [
    ...column({ x: 72, startY: 720, lines: ['Maria Chen'], sizePt: 18, bold: true }),
    ...column({ x: 72, startY: 696, lines: ['maria.chen@example.com, +1 415 555 0142'] }),
    ...column({ x: 72, startY: 660, lines: ['EXPERIENCE'], bold: true }),
    ...column({ x: 72, startY: 636, lines: BODY_LINES }),
  ];
}

describe('a conventional single-column resume', () => {
  it('reads the text in reading order', async () => {
    const extraction = await extractOk(makePdfBuffer({ pages: [{ runs: singleColumnPage() }] }));

    expect(extraction.format).toBe('pdf');
    expect(extraction.layout.hasTextLayer).toBe(true);

    const lines = extraction.plainText.split('\n').filter((line) => line.trim().length > 0);
    expect(lines[0]).toBe('Maria Chen');
    expect(lines[1]).toContain('maria.chen@example.com');
    expect(extraction.plainText.indexOf('EXPERIENCE')).toBeLessThan(
      extraction.plainText.indexOf('Cut p99 latency'),
    );
  });

  it('reports a clean layout', async () => {
    const extraction = await extractOk(makePdfBuffer({ pages: [{ runs: singleColumnPage() }] }));

    expect(extraction.layout.maxColumnsPerPage).toBe(1);
    expect(extraction.layout.multiColumnPages).toHaveLength(0);
    expect(extraction.layout.tableCount).toBe(0);
    expect(extraction.layout.hasHeaderFooterContent).toBe(false);
    expect(extraction.layout.pageCount).toBe(1);
  });

  it('keeps the typography heading detection depends on', async () => {
    const extraction = await extractOk(makePdfBuffer({ pages: [{ runs: singleColumnPage() }] }));

    const name = extraction.lines.find((line) => line.text === 'Maria Chen');
    const body = extraction.lines.find((line) => line.text.startsWith('Rebuilt'));

    expect(name?.isBold).toBe(true);
    expect(body?.isBold).toBe(false);
    // The name is set at 18pt against an 11pt body; without that difference,
    // heading detection has nothing to work with.
    expect(name!.fontSizeRatio).toBeGreaterThan(body!.fontSizeRatio);
  });
});

describe('the two-column layout that defeats an ATS', () => {
  /**
   * A sidebar on the left and the body on the right, with a real gutter no line
   * crosses. This is the single most common reason a well-written resume
   * arrives at a recruiter as interleaved nonsense.
   */
  function twoColumnPage(): PdfRun[] {
    return [
      ...column({
        x: 60,
        startY: 700,
        lines: ['SKILLS', 'Go', 'Python', 'Kubernetes', 'PostgreSQL', 'AWS', 'Kafka', 'Redis'],
      }),
      ...column({
        x: 330,
        startY: 700,
        lines: BODY_LINES,
      }),
    ];
  }

  it('detects the gutter', async () => {
    const extraction = await extractOk(makePdfBuffer({ pages: [{ runs: twoColumnPage() }] }));

    expect(extraction.layout.maxColumnsPerPage).toBe(2);
    expect(extraction.layout.multiColumnPages).toContain(1);
  });

  it('does not see columns in a page that merely has short lines', async () => {
    // One narrow column, nothing beside it. A skills list set this way covers a
    // small share of the page width, which must not read as a gutter.
    const shortLines = column({
      x: 72,
      startY: 720,
      lines: [
        'SKILLS',
        'Go',
        'Python',
        'Kubernetes',
        'PostgreSQL',
        'AWS',
        'Kafka',
        'Redis',
        'Docker',
        'SQL',
        'Terraform',
        'gRPC',
        'Nginx',
        'Linux',
        'Bash',
        'GitHub Actions',
        'Prometheus',
        'Grafana',
        'RabbitMQ',
        'Elasticsearch',
      ],
    });

    const extraction = await extractOk(makePdfBuffer({ pages: [{ runs: shortLines }] }));
    expect(extraction.layout.maxColumnsPerPage).toBe(1);
  });
});

describe('page furniture', () => {
  it('finds contact details stranded in a repeated header', async () => {
    const header: PdfRun[] = [{ text: 'maria.chen@example.com +1 415 555 0142', x: 72, y: 760 }];

    const extraction = await extractOk(
      makePdfBuffer({
        pages: [
          { runs: [...header, ...column({ x: 72, startY: 700, lines: BODY_LINES })] },
          { runs: [...header, ...column({ x: 72, startY: 700, lines: BODY_LINES })] },
        ],
      }),
    );

    expect(extraction.layout.pageCount).toBe(2);
    expect(extraction.layout.hasHeaderFooterContent).toBe(true);
    expect(extraction.layout.headerFooterSamples.join(' ')).toContain('maria.chen@example.com');
  });

  it('keeps header content out of the body text it would otherwise corrupt', async () => {
    const header: PdfRun[] = [{ text: 'Curriculum Vitae page header', x: 72, y: 760 }];

    const extraction = await extractOk(
      makePdfBuffer({
        pages: [
          { runs: [...header, ...column({ x: 72, startY: 700, lines: BODY_LINES })] },
          { runs: [...header, ...column({ x: 72, startY: 700, lines: BODY_LINES })] },
        ],
      }),
    );

    expect(extraction.plainText).not.toContain('Curriculum Vitae page header');
  });

  it('does not report a bare page number as lost content', async () => {
    const extraction = await extractOk(
      makePdfBuffer({
        pages: [
          {
            runs: [
              { text: '1', x: 300, y: 40 },
              ...column({ x: 72, startY: 700, lines: BODY_LINES }),
            ],
          },
          {
            runs: [
              { text: '2', x: 300, y: 40 },
              ...column({ x: 72, startY: 700, lines: BODY_LINES }),
            ],
          },
        ],
      }),
    );

    expect(extraction.layout.hasHeaderFooterContent).toBe(false);
  });
});

describe('tabular layout', () => {
  it('detects rows laid out with wide horizontal gaps', async () => {
    // Three runs on one baseline, far enough apart to be columns of a table --
    // which is how a borderless table looks to a parser, and why counting drawn
    // rectangles would miss it.
    const row = (y: number, cells: [string, string, string]): PdfRun[] => [
      { text: cells[0], x: 72, y },
      { text: cells[1], x: 240, y },
      { text: cells[2], x: 430, y },
    ];

    const extraction = await extractOk(
      makePdfBuffer({
        pages: [
          {
            runs: [
              ...row(700, ['Company', 'Role', 'Period']),
              ...row(680, ['Stripe', 'Senior Engineer', '2020-2024']),
              ...row(660, ['Square', 'Engineer', '2016-2020']),
              ...column({ x: 72, startY: 600, lines: BODY_LINES }),
            ],
          },
        ],
      }),
    );

    expect(extraction.layout.tableCount).toBeGreaterThanOrEqual(3);
  });
});

describe('documents that cannot be read', () => {
  it('explains a scan with no text layer instead of scoring it', async () => {
    const result = await extract(makePdfBuffer({ pages: [{ runs: [] }] }), 'scan.pdf');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('no-text-layer');
      expect(result.error.hint).toMatch(/скан|экспорт/i);
    }
  });

  it('explains a file that is not a PDF at all', async () => {
    const notAPdf = new TextEncoder().encode('%PDF- but not really, this is nonsense');
    const result = await extract(notAPdf.buffer as ArrayBuffer, 'broken.pdf');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(['extraction-failed', 'no-text-layer']).toContain(result.error.code);
  });
});

describe('coordinates survive into the document model', () => {
  it('normalises positions against the page box', async () => {
    const extraction = await extractOk(
      makePdfBuffer({ pages: [{ runs: column({ x: 72, startY: 700, lines: BODY_LINES }) }] }),
    );

    for (const line of extraction.lines) {
      expect(line.x).toBeGreaterThanOrEqual(0);
      expect(line.x).toBeLessThanOrEqual(1);
      expect(line.y).toBeGreaterThanOrEqual(0);
      expect(line.y).toBeLessThanOrEqual(1);
      expect(line.page).toBe(1);
    }

    const first = extraction.lines[0]!;
    expect(first.x).toBeCloseTo(72 / PAGE_WIDTH, 2);
  });
});
