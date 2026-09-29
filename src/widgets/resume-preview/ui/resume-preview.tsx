'use client';

import { useEffect, useMemo, useRef } from 'react';

import { cn } from '@/shared/lib/cn';
import { pluralize } from '@/shared/lib/plural';
import type { TextSpan } from '@/shared/lib/text';
import { Card, CardHeader } from '@/shared/ui/card';

import type { Finding } from '@/entities/analysis';
import type { ResumeDocument } from '@/entities/resume';

/**
 * The resume as the analyzer sees it.
 *
 * Two jobs. First, it shows the text an ATS would actually extract, which is
 * often a revelation on its own -- a two-column CV renders here as the
 * interleaved mess a parser produces. Second, selecting a finding highlights the
 * exact characters it refers to, which is the difference between "add numbers
 * to your bullets" and "this bullet, right here".
 */

export interface ResumePreviewProps {
  document: ResumeDocument;
  /** The expanded finding, whose anchors are highlighted. */
  activeFinding: Finding | null;
  className?: string;
}

interface Segment {
  text: string;
  highlighted: boolean;
}

export function ResumePreview({ document, activeFinding, className }: ResumePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const firstMarkRef = useRef<HTMLElement>(null);

  const spans = useMemo(
    () => normaliseSpans(activeFinding, document.plainText.length),
    [activeFinding, document.plainText.length],
  );

  const segments = useMemo(
    () => splitIntoSegments(document.plainText, spans),
    [document.plainText, spans],
  );

  // Bring the first highlight into view whenever the selection changes.
  useEffect(() => {
    if (spans.length === 0) return;
    firstMarkRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [spans]);

  // Index of the first highlight, computed rather than counted during render:
  // mutating a variable while rendering is exactly what React Compiler forbids.
  const firstHighlightIndex = segments.findIndex((segment) => segment.highlighted);

  return (
    <Card className={cn('flex min-h-0 flex-col', className)} padded={false}>
      <div className="px-5 pt-5">
        <CardHeader
          as="h2"
          title="Как это читает ATS"
          description={
            spans.length > 0
              ? 'Подсвечено то, к чему относится выбранное замечание'
              : `${document.file.name} · ${pluralize(document.layout.pageCount, 'страница', 'страницы', 'страниц')}`
          }
        />
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        role="region"
        aria-label="Извлечённый текст резюме"
        className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-5"
      >
        <pre className="font-mono text-[0.75rem] leading-relaxed whitespace-pre-wrap">
          {segments.map((segment, index) => {
            if (!segment.highlighted) return <span key={index}>{segment.text}</span>;

            return (
              <mark
                key={index}
                ref={index === firstHighlightIndex ? firstMarkRef : undefined}
                className="finding-highlight"
              >
                {segment.text}
              </mark>
            );
          })}
        </pre>
      </div>
    </Card>
  );
}

/**
 * Collect the finding's spans, clamped to the document and merged where they
 * overlap, so a highlight is never rendered twice or out of bounds.
 */
function normaliseSpans(finding: Finding | null, length: number): TextSpan[] {
  if (!finding) return [];

  const raw = finding.anchors
    .map((anchor) => anchor.span)
    .filter((span): span is TextSpan => span !== undefined)
    .map((span) => ({
      start: Math.max(0, Math.min(span.start, length)),
      end: Math.max(0, Math.min(span.end, length)),
    }))
    .filter((span) => span.end > span.start)
    .sort((a, b) => a.start - b.start);

  const merged: TextSpan[] = [];
  for (const span of raw) {
    const previous = merged[merged.length - 1];
    if (previous && span.start <= previous.end) {
      previous.end = Math.max(previous.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }

  return merged;
}

function splitIntoSegments(text: string, spans: TextSpan[]): Segment[] {
  if (spans.length === 0) return [{ text, highlighted: false }];

  const segments: Segment[] = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.start > cursor) {
      segments.push({ text: text.slice(cursor, span.start), highlighted: false });
    }
    segments.push({ text: text.slice(span.start, span.end), highlighted: true });
    cursor = span.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), highlighted: false });
  }

  return segments;
}
