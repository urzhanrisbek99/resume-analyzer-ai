'use client';

/** Downloads generated data via an object URL, revoked afterwards. */

export type ExportMimeType = 'text/markdown' | 'text/csv' | 'application/json';

export function downloadText(fileName: string, contents: string, mimeType: ExportMimeType): void {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName(fileName);
  anchor.rel = 'noopener';

  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Revoking immediately races the download in some browsers; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Windows silently refuses downloads whose names contain `/` or `:`. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 120);

  return cleaned.length > 0 ? cleaned : 'export';
}

/** `resume-report-2026-10-04` — sortable, and unambiguous across locales. */
export function datedFileName(stem: string, extension: string, now = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  return `${stem}-${iso}.${extension}`;
}
