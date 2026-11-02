import type { LayoutEvidence, SourceFormat } from '../../model/types';

/**
 * A line with page geometry, normalised to 0-1 with a top-left origin so PDF
 * and DOCX produce comparable numbers.
 */
export interface PositionedLine {
  text: string;
  /** 1-based. */
  page: number;
  x: number;
  y: number;
  width: number;
  fontSizeRatio: number;
  fontFamilies: string[];
  isBold: boolean;
  /** Number of wide horizontal gaps inside the line, a tabular-layout signal. */
  innerGaps: number;
  /** Ranges the line covers; one per side when it crosses a column gutter. */
  spans?: readonly TextSpan[];
}

/** An occupied horizontal range, normalised against page width. */
export interface TextSpan {
  x: number;
  width: number;
}

export interface RawExtraction {
  format: SourceFormat;
  /** Canonical text: one section per block, lines preserved, no page furniture. */
  plainText: string;
  lines: PositionedLine[];
  layout: LayoutEvidence;
  warnings: string[];
}

export interface ExtractInput {
  bytes: ArrayBuffer;
  fileName: string;
}

/** Fonts that every mainstream ATS parser handles without glyph loss. */
export const SAFE_FONT_KEYWORDS = [
  'arial',
  'helvetica',
  'calibri',
  'times',
  'georgia',
  'garamond',
  'cambria',
  'verdana',
  'tahoma',
  'trebuchet',
  'roboto',
  'opensans',
  'open sans',
  'lato',
  'inter',
  'segoe',
  'liberation',
  'dejavu',
  'nimbus',
  'notosans',
  'noto sans',
  'pt sans',
  'ptsans',
] as const;

/** Glyphs that survive rendering but garble on copy-paste or ATS ingestion. */
export const PROBLEMATIC_GLYPHS = [
  // Latin ligatures copy as one glyph: an ATS reads "workflow" as "work" + junk.
  'ﬀ', // ff
  'ﬁ', // fi
  'ﬂ', // fl
  'ﬃ', // ffi
  'ﬄ', // ffl
  'ﬅ', // long s + t
  'ﬆ', // st
  '\u0000', // NUL: a sign of a broken text stream
  '�', // replacement character: the encoding already failed
] as const;

export function emptyLayoutEvidence(): LayoutEvidence {
  return {
    hasTextLayer: false,
    textCharCount: 0,
    pageCount: 0,
    maxColumnsPerPage: 1,
    multiColumnPages: [],
    tableCount: 0,
    imageCount: 0,
    hasLikelyPhoto: false,
    hasHeaderFooterContent: false,
    headerFooterSamples: [],
    fontFamilies: [],
    nonStandardFonts: [],
    hasProblematicGlyphs: false,
    problematicGlyphSamples: [],
    embeddedLinks: [],
    textBoxCount: 0,
  };
}
