import { unzipSync } from 'fflate';

import { appError, err, ok, toErrorMessage, type Result } from '@/shared/lib/result';
import { squish } from '@/shared/lib/text';

import { collectFontIssues, findProblematicGlyphs } from './layout';
import {
  emptyLayoutEvidence,
  type ExtractInput,
  type PositionedLine,
  type RawExtraction,
} from './types';

/**
 * DOCX extraction, straight from OOXML.
 *
 * A generic docx-to-HTML converter throws away exactly the things this product
 * needs to judge: which text sits in a table, which sits in a floating text box,
 * whether the section is set in two columns, and which fonts are in play. So the
 * archive is unzipped and `word/document.xml` is read directly.
 */

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const EP_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties';

/** Rough page budget used only when the file carries no page count of its own. */
const CHARS_PER_PAGE = 3200;
const MIN_TEXT_CHARS = 80;

/** Characters that already read as a list marker, in either script. */
const LIST_MARKER_RE = /^[•·◦‣⁃*–—-]/u;

export async function extractDocx({
  bytes,
  fileName,
}: ExtractInput): Promise<Result<RawExtraction>> {
  const warnings: string[] = [];

  try {
    const archive = unzipSync(new Uint8Array(bytes));
    const documentXml = readEntry(archive, 'word/document.xml');
    if (!documentXml) {
      return err(
        appError(
          'extraction-failed',
          `Файл «${fileName}» не похож на документ Word.`,
          'Если это старый формат .doc, пересохраните его как .docx.',
        ),
      );
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(documentXml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
      return err(appError('extraction-failed', `Не удалось разобрать разметку «${fileName}».`));
    }

    const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
    if (!body) {
      return err(appError('empty-document', 'Документ не содержит текста.'));
    }

    const hyperlinks = collectHyperlinks(archive);
    const fontFamilies = new Set<string>([
      ...collectFonts(doc),
      ...collectFontsFromStyles(archive),
    ]);

    const blocks = walkBody(body);
    const plainText = blocks
      .map((block) => block.text)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (plainText.replace(/\s/g, '').length < MIN_TEXT_CHARS) {
      return err(
        appError(
          'empty-document',
          'В документе почти нет текста.',
          'Возможно, содержимое лежит в изображениях или в надписях, которые ATS не читает.',
        ),
      );
    }

    const tableCount = doc.getElementsByTagNameNS(W_NS, 'tbl').length;
    const textBoxCount = doc.getElementsByTagNameNS(W_NS, 'txbxContent').length;
    const imageCount =
      doc.getElementsByTagNameNS(W_NS, 'drawing').length +
      doc.getElementsByTagNameNS(W_NS, 'pict').length;
    const columnCount = maxSectionColumns(doc);
    const headerFooter = readHeaderFooter(archive);
    const pageCount =
      readPageCount(archive) ?? Math.max(1, Math.ceil(plainText.length / CHARS_PER_PAGE));

    if (textBoxCount > 0) {
      warnings.push(`Найдено надписей (текстовых блоков): ${textBoxCount}.`);
    }

    const fonts = collectFontIssues(fontFamilies);
    const glyphs = findProblematicGlyphs(plainText);
    const lines = toPositionedLines(blocks, pageCount);

    return ok({
      format: 'docx',
      plainText,
      lines,
      warnings,
      layout: {
        ...emptyLayoutEvidence(),
        hasTextLayer: true,
        textCharCount: plainText.length,
        pageCount,
        maxColumnsPerPage: columnCount,
        multiColumnPages: columnCount > 1 ? [1] : [],
        tableCount,
        imageCount,
        hasLikelyPhoto: imageCount >= 1 && imageCount <= 3,
        hasHeaderFooterContent: headerFooter.hasContent,
        headerFooterSamples: headerFooter.samples,
        fontFamilies: fonts.fontFamilies,
        nonStandardFonts: fonts.nonStandardFonts,
        hasProblematicGlyphs: glyphs.length > 0,
        problematicGlyphSamples: glyphs,
        embeddedLinks: hyperlinks,
        textBoxCount,
      },
    });
  } catch (cause) {
    return err(
      appError(
        'extraction-failed',
        `Не удалось прочитать «${fileName}»: ${toErrorMessage(cause)}`,
        'Попробуйте пересохранить файл в Word или экспортировать в PDF.',
        cause,
      ),
    );
  }
}

interface DocxBlock {
  text: string;
  /** Heading level from the paragraph style, when Word recorded one. */
  headingLevel: number | null;
  isBold: boolean;
  /** Half-points, as stored by Word. 22 is the 11pt default. */
  fontHalfPoints: number | null;
  isListItem: boolean;
  /** Cell count when the block came out of a table row. */
  cellCount: number;
  indentTwips: number;
}

function readEntry(archive: Record<string, Uint8Array>, path: string): string | null {
  const entry = archive[path];
  if (!entry) return null;
  return new TextDecoder('utf-8').decode(entry);
}

function walkBody(body: Element): DocxBlock[] {
  const blocks: DocxBlock[] = [];

  for (const child of Array.from(body.children)) {
    if (child.namespaceURI !== W_NS) continue;

    if (child.localName === 'p') {
      const block = readParagraph(child);
      if (block) blocks.push(block);
    } else if (child.localName === 'tbl') {
      blocks.push(...readTable(child));
    }
  }

  return blocks;
}

function readParagraph(paragraph: Element): DocxBlock | null {
  const text = paragraphText(paragraph);
  const properties = firstChildNS(paragraph, 'pPr');

  const styleValue = properties ? attributeOf(firstChildNS(properties, 'pStyle'), 'val') : null;
  const headingMatch = styleValue ? /^heading\s*([1-9])$/i.exec(styleValue) : null;

  const runProperties = properties ? firstChildNS(properties, 'rPr') : null;
  const firstRunProperties = firstChildNS(firstChildNS(paragraph, 'r'), 'rPr');

  const sizeValue =
    attributeOf(firstChildNS(runProperties, 'sz'), 'val') ??
    attributeOf(firstChildNS(firstRunProperties, 'sz'), 'val');

  const indentValue = properties ? attributeOf(firstChildNS(properties, 'ind'), 'left') : null;

  if (text.length === 0 && !headingMatch) return null;

  const isListItem = properties ? firstChildNS(properties, 'numPr') !== null : false;

  return {
    // Word stores list markers as numbering properties rather than literal
    // characters. Bullet detection downstream looks for a marker, so put one in
    // here, where both `plainText` and the positioned lines pick it up.
    text: isListItem && text.length > 0 && !LIST_MARKER_RE.test(text) ? `• ${text}` : text,
    headingLevel: headingMatch?.[1] ? Number(headingMatch[1]) : null,
    isBold: hasBold(runProperties) || hasBold(firstRunProperties),
    fontHalfPoints: sizeValue ? Number(sizeValue) : null,
    isListItem,
    cellCount: 0,
    indentTwips: indentValue ? Number(indentValue) : 0,
  };
}

/**
 * Flatten a table into one block per row, keeping the cell count so the
 * tabular-layout rule can report how much content depends on a table.
 */
function readTable(table: Element): DocxBlock[] {
  const rows: DocxBlock[] = [];

  for (const row of Array.from(table.getElementsByTagNameNS(W_NS, 'tr'))) {
    const cells = Array.from(row.getElementsByTagNameNS(W_NS, 'tc'));
    const cellTexts = cells
      .map((cell) =>
        Array.from(cell.getElementsByTagNameNS(W_NS, 'p'))
          .map((p) => paragraphText(p))
          .filter((t) => t.length > 0)
          .join(' '),
      )
      .filter((t) => t.length > 0);

    if (cellTexts.length === 0) continue;

    rows.push({
      text: cellTexts.join('   '),
      headingLevel: null,
      isBold: false,
      fontHalfPoints: null,
      isListItem: false,
      cellCount: cellTexts.length,
      indentTwips: 0,
    });
  }

  return rows;
}

function paragraphText(paragraph: Element): string {
  let text = '';

  for (const node of Array.from(paragraph.getElementsByTagNameNS(W_NS, '*'))) {
    if (node.localName === 't') text += node.textContent ?? '';
    else if (node.localName === 'tab') text += '   ';
    else if (node.localName === 'br') text += ' ';
  }

  return squish(text);
}

function firstChildNS(parent: Element | null, localName: string): Element | null {
  if (!parent) return null;
  for (const child of Array.from(parent.children)) {
    if (child.namespaceURI === W_NS && child.localName === localName) return child;
  }
  return null;
}

function attributeOf(element: Element | null, localName: string): string | null {
  if (!element) return null;
  return element.getAttributeNS(W_NS, localName) ?? element.getAttribute(`w:${localName}`);
}

function hasBold(runProperties: Element | null): boolean {
  const bold = firstChildNS(runProperties, 'b');
  if (!bold) return false;
  const value = attributeOf(bold, 'val');
  return value === null || value === '1' || value === 'true';
}

function collectFonts(doc: Document): string[] {
  const fonts = new Set<string>();
  for (const element of Array.from(doc.getElementsByTagNameNS(W_NS, 'rFonts'))) {
    for (const attribute of ['ascii', 'hAnsi', 'cs', 'eastAsia']) {
      const value = attributeOf(element, attribute);
      if (value) fonts.add(value);
    }
  }
  return [...fonts];
}

function collectFontsFromStyles(archive: Record<string, Uint8Array>): string[] {
  const xml = readEntry(archive, 'word/styles.xml');
  if (!xml) return [];
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return collectFonts(doc);
  } catch {
    return [];
  }
}

function collectHyperlinks(archive: Record<string, Uint8Array>): string[] {
  const xml = readEntry(archive, 'word/_rels/document.xml.rels');
  if (!xml) return [];
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const urls = new Set<string>();
    for (const relationship of Array.from(doc.getElementsByTagName('Relationship'))) {
      const type = relationship.getAttribute('Type') ?? '';
      const target = relationship.getAttribute('Target');
      if (target && type.endsWith('/hyperlink')) urls.add(target);
    }
    return [...urls];
  } catch {
    return [];
  }
}

function maxSectionColumns(doc: Document): number {
  let columns = 1;
  for (const section of Array.from(doc.getElementsByTagNameNS(W_NS, 'sectPr'))) {
    const cols = firstChildNS(section, 'cols');
    const num = attributeOf(cols, 'num');
    if (num) columns = Math.max(columns, Number(num) || 1);
  }
  return columns;
}

function readHeaderFooter(archive: Record<string, Uint8Array>): {
  hasContent: boolean;
  samples: string[];
} {
  const samples: string[] = [];

  for (const path of Object.keys(archive)) {
    if (!/^word\/(header|footer)\d*\.xml$/.test(path)) continue;
    const xml = readEntry(archive, path);
    if (!xml) continue;
    try {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const text = squish(
        Array.from(doc.getElementsByTagNameNS(W_NS, 't'))
          .map((node) => node.textContent ?? '')
          .join(' '),
      );
      // Page numbering alone is harmless furniture.
      if (text.length > 3 && !/^\d+(\s*\/\s*\d+)?$/.test(text)) samples.push(text);
    } catch {
      // A malformed header is not worth failing extraction over.
    }
  }

  return { hasContent: samples.length > 0, samples: samples.slice(0, 5) };
}

/** Word stores its own page count in docProps/app.xml; prefer it over guessing. */
function readPageCount(archive: Record<string, Uint8Array>): number | null {
  const xml = readEntry(archive, 'docProps/app.xml');
  if (!xml) return null;
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const node =
      doc.getElementsByTagNameNS(EP_NS, 'Pages')[0] ?? doc.getElementsByTagName('Pages')[0];
    const value = Number(node?.textContent ?? '');
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * DOCX has no coordinates, so geometry is synthesised: a monotonic y from the
 * block order and an x from the paragraph indent. That is enough for the rules
 * that read geometry, and column detection comes from `sectPr` instead.
 */
function toPositionedLines(blocks: DocxBlock[], pageCount: number): PositionedLine[] {
  const perPage = Math.max(1, Math.ceil(blocks.length / Math.max(1, pageCount)));

  return blocks.map((block, index) => {
    const page = Math.floor(index / perPage) + 1;
    const positionOnPage = (index % perPage) / perPage;
    const halfPoints = block.fontHalfPoints ?? (block.headingLevel ? 28 : 22);

    return {
      text: block.text,
      page,
      // 1 inch = 1440 twips; A4 body width is roughly 6.5 inches.
      x: Math.min(0.5, block.indentTwips / (1440 * 6.5)),
      y: positionOnPage,
      width: Math.min(1, block.text.length / 95),
      fontSizeRatio: halfPoints / 2 / 792,
      fontFamilies: [],
      isBold: block.isBold || block.headingLevel !== null,
      innerGaps: block.cellCount > 1 ? block.cellCount - 1 : 0,
    };
  });
}
