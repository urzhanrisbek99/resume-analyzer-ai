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
  type TextSpan,
} from './types';

/**
 * PDF extraction: recovers the reading order an ATS would see and records
 * layout facts (columns, images, fonts) that hurt parseability.
 */

/** Text runs closer than this (as a share of page width) belong to one word run. */
const WIDE_GAP_RATIO = 0.035;
/** Baselines within this share of page height are the same visual line. */
const LINE_TOLERANCE_RATIO = 0.006;
/** Below this many characters the document has no usable text layer. */
const MIN_TEXT_CHARS = 120;

type PdfjsModule = typeof import('pdfjs-dist');
type PdfLoadingTask = ReturnType<PdfjsModule['getDocument']>;

interface TextRun {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font: FontDescriptor;
}

interface FontDescriptor {
  family: string;
  bold: boolean;
}

/**
 * `getTextContent` reports only an internal font id and a generic family.
 * The registry filled by the operator list maps that id to the real typeface
 * and weight. pdf.js leaves it untyped, so the shape is declared here.
 */
interface FontRegistry {
  has(id: string): boolean;
  get(id: string): { name?: unknown; bold?: unknown; black?: unknown } | undefined;
}

const BOLD_NAME = /bold|black|heavy|semib/i;

let workerConfigured = false;

/**
 * The worker is served from `public/` (see scripts/copy-pdf-worker.mjs).
 * Outside a browser it is left unset so pdf.js runs on the calling thread,
 * which keeps the extractor usable in tests.
 */
function configureWorker(globalWorkerOptions: { workerSrc: string }): void {
  if (workerConfigured || typeof window === 'undefined') return;
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
      useWorkerFetch: false,
      // Keep glyph mapping faithful so ligatures can be detected.
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

      // Reading the operator list counts images and fills the font registry.
      let fontRegistry: FontRegistry | undefined;
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
        fontRegistry = (page as unknown as { commonObjs?: FontRegistry }).commonObjs;
      } catch {
        warnings.push(`Не удалось проанализировать графику на странице ${pageNumber}.`);
      }

      const textContent = await page.getTextContent();
      const describe = fontResolver(fontRegistry, textContent.styles);

      const runs: TextRun[] = [];
      for (const item of textContent.items) {
        // TextMarkedContent entries carry no geometry; only text items do.
        if (!('str' in item)) continue;
        const transform = item.transform;
        const x = transform[4];
        const y = transform[5];
        if (typeof x !== 'number' || typeof y !== 'number') continue;
        // Whitespace-only items encode positioning jumps. Dropping them keeps
        // wide gaps visible for column detection; gaps come from coordinates.
        if (item.str.trim().length === 0) continue;

        const font = describe(item.fontName);
        if (font.family) fontFamilies.add(font.family);

        runs.push({
          text: item.str,
          x,
          y,
          width: item.width,
          height: item.height || (transform[3] ?? 0),
          font,
        });
      }

      lines.push(...groupRunsIntoLines(runs, pageNumber, pageWidth, pageHeight));

      try {
        const annotations = await page.getAnnotations();
        for (const annotation of annotations) {
          const url = (annotation as { url?: string }).url;
          if (url) embeddedLinks.add(url);
        }
      } catch {
        warnings.push(`Не удалось прочитать ссылки на странице ${pageNumber}.`);
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
        // One to three images on page one is usually a photo, possibly a logo.
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
    await loadingTask?.destroy().catch(() => undefined);
  }
}

/** Falls back to the text style's generic family when the registry is unavailable. */
function fontResolver(
  registry: FontRegistry | undefined,
  styles: Record<string, unknown>,
): (id: string) => FontDescriptor {
  const cache = new Map<string, FontDescriptor>();

  return (id: string): FontDescriptor => {
    const cached = cache.get(id);
    if (cached) return cached;

    const descriptor = fromRegistry(registry, id) ?? {
      family: (styles[id] as { fontFamily?: string } | undefined)?.fontFamily ?? '',
      bold: BOLD_NAME.test(id),
    };
    cache.set(id, descriptor);
    return descriptor;
  };
}

function fromRegistry(registry: FontRegistry | undefined, id: string): FontDescriptor | null {
  if (!registry?.has(id)) return null;

  let font;
  try {
    font = registry.get(id);
  } catch {
    return null;
  }
  if (!font) return null;

  const name = typeof font.name === 'string' ? font.name : '';
  return {
    family: familyFromFontName(name),
    // Fonts mark bold either by flag or only in the name.
    bold: font.bold === true || font.black === true || BOLD_NAME.test(name),
  };
}

/** "BCDEEE+Calibri-Bold" -> "Calibri": drops the subset tag and weight suffix. */
function familyFromFontName(name: string): string {
  const withoutSubsetTag = name.replace(/^[A-Z]{6}\+/, '');
  const [base = ''] = withoutSubsetTag.split(/[-,]/, 1);
  return squish(base.replace(/([a-z])([A-Z])/g, '$1 $2'));
}

/**
 * Runs arrive in drawing order, which interleaves the columns of a two-column
 * layout. Grouping by baseline and sorting by x restores reading order.
 */
function groupRunsIntoLines(
  runs: TextRun[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
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
    // A line crossing a column gutter becomes two spans, as a reader sees it.
    const spans: TextSpan[] = [];
    let spanStart = first.x;

    for (const run of ordered) {
      if (previousEnd !== null) {
        const gap = run.x - previousEnd;
        if (gap > wideGap) {
          innerGaps += 1;
          text += '\t';
          spans.push({ x: spanStart / pageWidth, width: (previousEnd - spanStart) / pageWidth });
          spanStart = run.x;
        } else if (gap > 0.5 && !text.endsWith(' ') && !run.text.startsWith(' ')) {
          text += ' ';
        }
      }
      text += run.text;
      previousEnd = run.x + run.width;
    }
    spans.push({
      x: spanStart / pageWidth,
      width: Math.max(0, ((previousEnd ?? spanStart) - spanStart) / pageWidth),
    });

    const fontFamilies = [
      ...new Set(ordered.map((run) => run.font.family).filter((family) => family.length > 0)),
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
      isBold: ordered.some((run) => run.font.bold),
      innerGaps,
      spans,
    };
  });
}

/** Inserts a blank line where the vertical gap exceeds the line height. */
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
