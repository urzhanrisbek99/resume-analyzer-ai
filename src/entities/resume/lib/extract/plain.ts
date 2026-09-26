import { appError, err, ok, type Result } from '@/shared/lib/result';
import { squish } from '@/shared/lib/text';

import { collectFontIssues, findProblematicGlyphs } from './layout';
import {
  emptyLayoutEvidence,
  type ExtractInput,
  type PositionedLine,
  type RawExtraction,
} from './types';

/**
 * Plain text and Markdown.
 *
 * The happiest possible input for an ATS, and a useful escape hatch: a candidate
 * whose PDF has no text layer can paste the content and still get a full report
 * on structure, content and keywords.
 */

const MIN_TEXT_CHARS = 80;
const CHARS_PER_PAGE = 3400;

export function extractPlainText(
  { fileName }: Pick<ExtractInput, 'fileName'>,
  text: string,
  format: 'txt' | 'md' = 'txt',
): Result<RawExtraction> {
  const normalised = text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (normalised.replace(/\s/g, '').length < MIN_TEXT_CHARS) {
    return err(
      appError(
        'empty-document',
        `В «${fileName}» слишком мало текста для анализа.`,
        'Нужно хотя бы несколько строк опыта работы.',
      ),
    );
  }

  const rawLines = normalised.split('\n');
  const pageCount = Math.max(1, Math.ceil(normalised.length / CHARS_PER_PAGE));
  const linesPerPage = Math.max(1, Math.ceil(rawLines.length / pageCount));

  const lines: PositionedLine[] = rawLines
    .map((line, index): PositionedLine | null => {
      const content = squish(line);
      if (content.length === 0) return null;

      const indent = line.length - line.trimStart().length;
      // Runs separated by three or more spaces are a hand-made table.
      const innerGaps = (line.match(/ {3,}|\t/g) ?? []).length;

      return {
        text: content,
        page: Math.floor(index / linesPerPage) + 1,
        x: Math.min(0.4, indent / 80),
        y: (index % linesPerPage) / linesPerPage,
        width: Math.min(1, content.length / 90),
        // No typography in plain text; report a neutral body size.
        fontSizeRatio: 0.0139,
        fontFamilies: [],
        isBold: /^#{1,6}\s/.test(line) || /^\*\*.+\*\*$/.test(content),
        innerGaps,
      };
    })
    .filter((line): line is PositionedLine => line !== null);

  const glyphs = findProblematicGlyphs(normalised);
  const fonts = collectFontIssues([]);

  return ok({
    format,
    plainText: normalised,
    lines,
    warnings: [],
    layout: {
      ...emptyLayoutEvidence(),
      hasTextLayer: true,
      textCharCount: normalised.length,
      pageCount,
      tableCount: lines.filter((line) => line.innerGaps >= 2).length,
      fontFamilies: fonts.fontFamilies,
      nonStandardFonts: fonts.nonStandardFonts,
      hasProblematicGlyphs: glyphs.length > 0,
      problematicGlyphSamples: glyphs,
      embeddedLinks: [...new Set(normalised.match(/https?:\/\/[^\s)>\]]+/g) ?? [])],
    },
  });
}
