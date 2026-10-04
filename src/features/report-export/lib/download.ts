'use client';

/**
 * Hand the user a file.
 *
 * An object URL and a synthetic click, which is the only way a browser lets a
 * page produce a download from data it generated itself. The URL is revoked
 * afterwards so the blob is not pinned in memory for the life of the tab.
 */

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

/**
 * Strip what filesystems reject.
 *
 * A candidate name can legitimately contain a slash or a colon, and Windows
 * silently refuses the download rather than reporting why.
 */
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
