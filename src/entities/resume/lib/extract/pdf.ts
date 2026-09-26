import { appError, err, ok, toErrorMessage, type Result } from '@/shared/lib/result';
import { squish } from '@/shared/lib/text';

import {
  analyseColumns,
  analyseHeaderFooter,
  collectFontIssues,
  countTabularRows,
  findProblematicGlyphs,
} from './layout';
import {
  emptyLayoutEvidence,
  type ExtractInput,
  type PositionedLine,
  type RawExtraction,
} from './types';

/**
 * PDF extraction.
 *
 * Two jobs, and the second one is the reason this file is not three lines long:
 * recover the reading order as an ATS would, and record the physical layout
 * facts that make a PDF unparseable in the first place.
 */

/** Text runs closer than this (as a share of page width) belong to one word run. */
const WIDE_GAP_RATIO = 0.035;
/** Baselines within this share of page height are the same visual line. */
const LINE_TOLERANCE_RATIO = 0.006;
/** Below this many characters the document has no usable text layer. */
const MIN_TEXT_CHARS = 120;

/** Derived from the module itself, so a pdf.js upgrade surfaces as a type error. */
type PdfjsModule = typeof import('pdfjs-dist');
type PdfLoadingTask = ReturnType<PdfjsModule['getDocument']>;

interface TextRun {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
}

let workerConfigured = false;

/**
 * The worker is served from `public/` (see scripts/copy-pdf-worker.mjs) rather
 * than resolved through the bundler, so the URL cannot break on a bundler bump.
 */
function configureWorker(globalWorkerOptions: { workerSrc: string }): void {
  if (workerConfigured) return;
  globalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  workerConfigured = true;
}

export async function extractPdf({
  bytes,
  fileName,
}: ExtractInput): Promise<Result<RawExtraction>> {
  const warnings: string[] = [];
  let loadingTask: PdfLoadingTask | null = null;

  try {
    const pdfjs = await import('pdfjs-dist');
    configureWorker(pdfjs.GlobalWorkerOptions);

    // The loading task owns `destroy`; the document proxy only has `cleanup`.
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      // No network fetches are needed to read text, and none should happen.
      useWorkerFetch: false,
      // Keep glyph mapping faithful so ligature detection stays meaningful.
      disableFontFace: true,
    });
    const document = await loadingTask.promise;

    const pageCount = document.numPages;
    const lines: PositionedLine[] = [];
    const fontFamilies = new Set<string>();
    const embeddedLinks = new Set<string>();
    let imageCount = 0;
    let imagesOnFirstPage = 0;

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const pageWidth = viewport.width || 1;
      const pageHeight = viewport.height || 1;

      const textContent = await page.getTextContent();

      for (const style of Object.values(textContent.styles)) {
        const family = (style as { fontFamily?: string }).fontFamily;
        if (family) fontFamilies.add(family);
      }

      const runs: TextRun[] = [];
      for (const item of textContent.items) {
        // TextMarkedContent entries carry no geometry; only text items do.
        if (!('str' in item)) continue;
        const transform = item.transform;
        const x = transform[4];
        const y = transform[5];
        if (typeof x !== 'number' || typeof y !== 'number') continue;
        if (item.str.length === 0) continue;

        runs.push({
          text: item.str,
          x,
          y,
          width: item.width,
          height: item.height || (transform[3] ?? 0),
          fontName: item.fontName,
        });
      }

      lines.push(
        ...groupRunsIntoLines(runs, pageNumber, pageWidth, pageHeight, textContent.styles),
      );

      try {
        const annotations = await page.getAnnotations();
        for (const annotation of annotations) {
          const url = (annotation as { url?: string }).url;
          if (url) embeddedLinks.add(url);
        }
      } catch {
        warnings.push(`Не удалось прочитать ссылки на странице ${pageNumber}.`);
      }

      try {
        const { fnArray } = await page.getOperatorList();
        const imageOps = new Set<number>([
          pdfjs.OPS.paintImageXObject,
          pdfjs.OPS.paintInlineImageXObject,
          pdfjs.OPS.paintImageMaskXObject,
        ]);
        let pageImages = 0;
        for (const fn of fnArray) if (imageOps.has(fn)) pageImages += 1;
        imageCount += pageImages;
        if (pageNumber === 1) imagesOnFirstPage = pageImages;
      } catch {
        warnings.push(`Не удалось проанализировать графику на странице ${pageNumber}.`);
      }

      page.cleanup();
    }

    const headerFooter = analyseHeaderFooter(lines, pageCount);
    const bodyLines = lines.filter((line) => !headerFooter.excludedTexts.has(line.text));
    const plainText = buildPlainText(bodyLines);

    if (plainText.replace(/\s/g, '').length < MIN_TEXT_CHARS) {
      return err(
        appError(
          'no-text-layer',
          'В этом PDF нет текстового слоя — скорее всего, это скан или картинка.',
          'ATS не прочитает такой файл вообще. Экспортируйте резюме из текстового редактора в PDF, а не сканируйте распечатку.',
        ),
      );
    }

    const columns = analyseColumns(lines);
    const fonts = collectFontIssues(fontFamilies);
    const glyphs = findProblematicGlyphs(plainText);

    return ok({
      format: 'pdf',
      plainText,
      lines: bodyLines,
      warnings,
      layout: {
        ...emptyLayoutEvidence(),
        hasTextLayer: true,
        textCharCount: plainText.length,
        pageCount,
        maxColumnsPerPage: columns.maxColumnsPerPage,
        multiColumnPages: columns.multiColumnPages,
        tableCount: countTabularRows(bodyLines),
        imageCount,
        // A single image on page one is the classic portrait-photo pattern. It
        // could also be a logo, so the rule that reads this asks rather than
        // asserts.
        hasLikelyPhoto: imagesOnFirstPage >= 1 && imagesOnFirstPage <= 3,
        hasHeaderFooterContent: headerFooter.hasHeaderFooterContent,
        headerFooterSamples: headerFooter.samples,
        fontFamilies: fonts.fontFamilies,
        nonStandardFonts: fonts.nonStandardFonts,
        hasProblematicGlyphs: glyphs.length > 0,
        problematicGlyphSamples: glyphs,
        embeddedLinks: [...embeddedLinks],
      },
    });
  } catch (cause) {
    const message = toErrorMessage(cause);
    if (/password/i.test(message)) {
      return err(
        appError(
          'encrypted-document',
          'PDF защищён паролем, прочитать его не получается.',
          'Снимите пароль и загрузите файл заново. Многие ATS тоже не умеют открывать защищённые файлы.',
          cause,
        ),
      );
    }
    return err(
      appError(
        'extraction-failed',
        `Не удалось разобрать «${fileName}».`,
        'Попробуйте пересохранить файл или загрузить версию в DOCX.',
        cause,
      ),
    );
  } finally {
    // Frees the worker, whether extraction succeeded or threw.
    await loadingTask?.destroy().catch(() => undefined);
  }
}

/**
 * Group text runs into visual lines, then into a reading order.
 *
 * Runs arrive in drawing order, which for a two-column layout means the left
 * column and the right column interleave. Grouping by baseline and sorting by
 * position reconstructs what a human sees.
 */
function groupRunsIntoLines(
  runs: TextRun[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
  styles: Record<string, unknown>,
): PositionedLine[] {
  if (runs.length === 0) return [];

  const tolerance = pageHeight * LINE_TOLERANCE_RATIO;
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);

  const buckets: TextRun[][] = [];
  for (const run of sorted) {
    const last = buckets[buckets.length - 1];
    const reference = last?.[0];
    if (last && reference && Math.abs(reference.y - run.y) <= tolerance) last.push(run);
    else buckets.push([run]);
  }

  const wideGap = pageWidth * WIDE_GAP_RATIO;

  return buckets.map((bucket) => {
    const ordered = [...bucket].sort((a, b) => a.x - b.x);
    const first = ordered[0]!;
    const last = ordered[ordered.length - 1]!;

    let text = '';
    let innerGaps = 0;
    let previousEnd: number | null = null;

    for (const run of ordered) {
      if (previousEnd !== null) {
        const gap = run.x - previousEnd;
        if (gap > wideGap) {
          innerGaps += 1;
          text += '\t';
        } else if (gap > 0.5 && !text.endsWith(' ') && !run.text.startsWith(' ')) {
          text += ' ';
        }
      }
      text += run.text;
      previousEnd = run.x + run.width;
    }

    const fontFamilies = [
      ...new Set(
        ordered
          .map((run) => (styles[run.fontName] as { fontFamily?: string } | undefined)?.fontFamily)
          .filter((family): family is string => Boolean(family)),
      ),
    ];

    const maxHeight = ordered.reduce((max, run) => Math.max(max, run.height), 0);

    return {
      text: text.replace(/[ \t]+$/g, ''),
      page: pageNumber,
      x: first.x / pageWidth,
      y: 1 - first.y / pageHeight,
      width: Math.max(0, (last.x + last.width - first.x) / pageWidth),
      fontSizeRatio: maxHeight / pageHeight,
      fontFamilies,
      // pdf.js reports the PostScript name; the bold suffix is the usable signal.
      isBold: ordered.some((run) => /bold|black|heavy|semib/i.test(run.fontName)),
      innerGaps,
    };
  });
}

/**
 * Flatten lines into text, inserting a blank line where the vertical gap is
 * larger than the local line height. Those breaks are what heading detection and
 * bullet grouping later rely on.
 */
function buildPlainText(lines: PositionedLine[]): string {
  const ordered = [...lines].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);

  const gaps = ordered
    .map((line, index) => {
      const previous = ordered[index - 1];
      if (!previous || previous.page !== line.page) return null;
      return line.y - previous.y;
    })
    .filter((gap): gap is number => gap !== null && gap > 0)
    .sort((a, b) => a - b);
  const medianGap = gaps.length > 0 ? (gaps[Math.floor(gaps.length / 2)] ?? 0.02) : 0.02;
  const paragraphGap = medianGap * 1.6;

  let out = '';
  ordered.forEach((line, index) => {
    const previous = ordered[index - 1];
    if (previous) {
      const samePage = previous.page === line.page;
      const gap = line.y - previous.y;
      out += !samePage || gap > paragraphGap ? '\n\n' : '\n';
    }
    out += squish(line.text.replace(/\t/g, '   '));
  });

  return out.replace(/\n{3,}/g, '\n\n').trim();
}
