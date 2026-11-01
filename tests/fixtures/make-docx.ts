import { zipSync, strToU8 } from 'fflate';

/**
 * Build a .docx in memory.
 *
 * Fixtures as code rather than binaries in the repository. A committed .docx is
 * opaque: a reviewer cannot see what makes it a two-column document or where
 * the header content sits, and nobody can adjust it without opening Word. This
 * emits the same OOXML the extractor reads, and the test states its own shape.
 */

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export interface DocxParagraph {
  text: string;
  /** Word stores list markers as numbering properties, not characters. */
  listItem?: boolean;
  bold?: boolean;
  /** Half-points, as Word records them. 22 is the 11pt default. */
  sizeHalfPoints?: number;
  /** Named style, e.g. "Heading1". */
  style?: string;
}

export interface DocxOptions {
  paragraphs: DocxParagraph[];
  /** Rows of cells; each becomes a `w:tbl`. */
  tables?: string[][][];
  /** Section column count. Two is the layout that defeats most ATS parsers. */
  columns?: number;
  /** Content placed in the page header, which some parsers drop entirely. */
  headerText?: string;
  /** Text inside a floating text box, which most parsers never reach. */
  textBoxText?: string;
  /** Written into docProps/app.xml, where Word records its own page count. */
  pageCount?: number;
  fonts?: string[];
}

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function paragraphXml(paragraph: DocxParagraph, fonts: string[]): string {
  const font = fonts[0] ?? 'Calibri';

  const properties = [
    paragraph.style ? `<w:pStyle w:val="${paragraph.style}"/>` : '',
    paragraph.listItem ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : '',
    paragraph.bold || paragraph.sizeHalfPoints
      ? `<w:rPr>${paragraph.bold ? '<w:b/>' : ''}${
          paragraph.sizeHalfPoints ? `<w:sz w:val="${paragraph.sizeHalfPoints}"/>` : ''
        }</w:rPr>`
      : '',
  ].join('');

  return (
    `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}` +
    `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/></w:rPr>` +
    `<w:t xml:space="preserve">${escapeXml(paragraph.text)}</w:t></w:r></w:p>`
  );
}

function tableXml(rows: string[][]): string {
  const cells = (row: string[]) =>
    row
      .map(
        (cell) =>
          `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>` +
          `<w:p><w:r><w:t xml:space="preserve">${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`,
      )
      .join('');

  return `<w:tbl>${rows.map((row) => `<w:tr>${cells(row)}</w:tr>`).join('')}</w:tbl>`;
}

function textBoxXml(text: string): string {
  return (
    '<w:p><w:r><w:pict><v:shape><v:textbox><w:txbxContent>' +
    `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>` +
    '</w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>'
  );
}

export function makeDocx(options: DocxOptions): Uint8Array {
  const {
    paragraphs,
    tables = [],
    columns = 1,
    headerText,
    textBoxText,
    pageCount,
    fonts = ['Calibri'],
  } = options;

  const body =
    paragraphs.map((paragraph) => paragraphXml(paragraph, fonts)).join('') +
    tables.map(tableXml).join('') +
    (textBoxText ? textBoxXml(textBoxText) : '') +
    `<w:sectPr>${columns > 1 ? `<w:cols w:num="${columns}"/>` : '<w:cols w:num="1"/>'}` +
    (headerText ? '<w:headerReference w:type="default" r:id="rId10"/>' : '') +
    '</w:sectPr>';

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>',
    ),

    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    ),

    'word/document.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<w:document xmlns:w="${W_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
        'xmlns:v="urn:schemas-microsoft-com:vml">' +
        `<w:body>${body}</w:body></w:document>`,
    ),

    'word/styles.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<w:styles xmlns:w="${W_NS}"><w:docDefaults><w:rPrDefault><w:rPr>` +
        `<w:rFonts w:ascii="${fonts[0] ?? 'Calibri'}" w:hAnsi="${fonts[1] ?? fonts[0] ?? 'Calibri'}"/>` +
        '</w:rPr></w:rPrDefault></w:docDefaults></w:styles>',
    ),
  };

  if (headerText) {
    files['word/header1.xml'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<w:hdr xmlns:w="${W_NS}"><w:p><w:r><w:t xml:space="preserve">${escapeXml(headerText)}</w:t></w:r></w:p></w:hdr>`,
    );
  }

  if (pageCount !== undefined) {
    files['docProps/app.xml'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
        `<Pages>${pageCount}</Pages></Properties>`,
    );
  }

  files['word/_rels/document.xml.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" ' +
      'Target="https://linkedin.com/in/hidden-link" TargetMode="External"/>' +
      (headerText
        ? '<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
        : '') +
      '</Relationships>',
  );

  return zipSync(files);
}

/** The bytes as an ArrayBuffer, which is what the extractor takes. */
export function makeDocxBuffer(options: DocxOptions): ArrayBuffer {
  const bytes = makeDocx(options);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
