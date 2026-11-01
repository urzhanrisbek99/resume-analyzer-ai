/**
 * Build a PDF in memory, by hand.
 *
 * No library, for the same reason the fixtures are not committed as binaries: a
 * generator that places each run at an explicit coordinate is the only way to
 * test layout forensics honestly. Column detection looks for a vertical gutter
 * no line crosses, and the only way to assert that is to put text at known x
 * positions and check what comes back.
 *
 * The output is a plain uncompressed PDF 1.4 with a correct cross-reference
 * table, which is what pdf.js needs to read it without recovery heuristics.
 */

export interface PdfRun {
  text: string;
  /** Points from the left edge of the page. */
  x: number;
  /** Points from the bottom edge, as PDF measures it. */
  y: number;
  sizePt?: number;
  bold?: boolean;
}

export interface PdfPageSpec {
  runs: PdfRun[];
}

export interface PdfOptions {
  pages: PdfPageSpec[];
  /** US Letter by default, the size most resume templates assume. */
  width?: number;
  height?: number;
}

const DEFAULT_SIZE = 11;

/** Escape the three characters that terminate or nest a PDF string. */
const escapePdfText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/**
 * WinAnsi covers Latin text; anything outside it would need an embedded font
 * with a CMap, which is far more machinery than a fixture needs. Characters
 * that do not fit are dropped rather than written as mojibake.
 */
const toWinAnsi = (value: string) =>
  [...value].filter((char) => char.codePointAt(0)! < 256).join('');

function contentStream(runs: PdfRun[]): string {
  const operations = runs.map((run) => {
    const font = run.bold ? '/F2' : '/F1';
    const size = run.sizePt ?? DEFAULT_SIZE;
    return `BT ${font} ${size} Tf 1 0 0 1 ${run.x} ${run.y} Tm (${escapePdfText(toWinAnsi(run.text))}) Tj ET`;
  });

  return operations.join('\n');
}

export function makePdf({ pages, width = 612, height = 792 }: PdfOptions): Uint8Array {
  const objects: string[] = [];
  /** Object numbers are one-based; index 0 is the free head of the chain. */
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  // Reserve 1 for the catalog and 2 for the page tree, so pages can point back.
  const catalogId = add('');
  const pagesId = add('');
  const fontRegularId = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  const fontBoldId = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );

  const pageIds: number[] = [];

  for (const page of pages) {
    const stream = contentStream(page.runs);
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);

    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${width} ${height}] ` +
          `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> ` +
          `/Contents ${contentId} 0 R >>`,
      ),
    );
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  // Assemble, recording where each object starts: the xref table is byte
  // offsets, and pdf.js falls back to a slow full-file scan without them.
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];

  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = body.length;
  const pad = (value: number, width_: number) => String(value).padStart(width_, '0');

  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${pad(offset, 10)} 00000 n \n`;

  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(body + xref + trailer);
}

export function makePdfBuffer(options: PdfOptions): ArrayBuffer {
  const bytes = makePdf(options);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/* ------------------------------------------------------------------------- */
/* Layout helpers, so a test reads as a description of the page               */
/* ------------------------------------------------------------------------- */

export interface ColumnText {
  x: number;
  startY: number;
  lines: string[];
  sizePt?: number;
  bold?: boolean;
}

/** Lay out lines down a column at a fixed x, 16pt apart. */
export function column({ x, startY, lines, sizePt, bold }: ColumnText): PdfRun[] {
  return lines.map((text, index) => ({
    text,
    x,
    y: startY - index * 16,
    ...(sizePt === undefined ? {} : { sizePt }),
    ...(bold === undefined ? {} : { bold }),
  }));
}
