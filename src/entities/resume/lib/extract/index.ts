import { UPLOAD_LIMITS } from '@/shared/config/app';
import { appError, err, type Result } from '@/shared/lib/result';

import type { SourceFormat } from '@/entities/resume/model/types';

import { extractDocx } from './docx';
import { extractPdf } from './pdf';
import { extractPlainText } from './plain';
import type { RawExtraction } from './types';

export type { PositionedLine, RawExtraction } from './types';

/**
 * Format dispatch.
 *
 * Extraction runs in the browser and only in the browser: the file is read from
 * an ArrayBuffer already in memory and no byte of it is ever sent anywhere. See
 * docs/adr/0003-privacy-boundary.md.
 */

export function detectFormat(fileName: string, mimeType: string): SourceFormat | null {
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();

  if (extension === '.pdf' || mimeType === 'application/pdf') return 'pdf';
  if (
    extension === '.docx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  if (extension === '.md' || mimeType === 'text/markdown') return 'md';
  if (extension === '.txt' || mimeType === 'text/plain') return 'txt';

  return null;
}

export interface ExtractFileInput {
  bytes: ArrayBuffer;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export async function extractFromFile(input: ExtractFileInput): Promise<Result<RawExtraction>> {
  if (input.sizeBytes > UPLOAD_LIMITS.maxFileBytes) {
    const limitMb = Math.round(UPLOAD_LIMITS.maxFileBytes / (1024 * 1024));
    return err(
      appError(
        'file-too-large',
        `Файл больше ${limitMb} МБ.`,
        'Резюме такого размера почти всегда означает тяжёлые картинки — уберите их.',
      ),
    );
  }

  const format = detectFormat(input.fileName, input.mimeType);
  if (!format) {
    return err(
      appError(
        'unsupported-format',
        `Формат файла «${input.fileName}» не поддерживается.`,
        `Поддерживаются ${UPLOAD_LIMITS.acceptedExtensions.join(', ')}. Формат .doc нужно пересохранить как .docx.`,
      ),
    );
  }

  switch (format) {
    case 'pdf':
      return extractPdf({ bytes: input.bytes, fileName: input.fileName });
    case 'docx':
      return extractDocx({ bytes: input.bytes, fileName: input.fileName });
    case 'txt':
    case 'md': {
      const text = new TextDecoder('utf-8').decode(input.bytes);
      return extractPlainText({ fileName: input.fileName }, text, format);
    }
  }
}

/** Entry point for text a candidate pasted instead of uploading a file. */
export function extractFromText(text: string): Result<RawExtraction> {
  return extractPlainText({ fileName: 'pasted-text' }, text, 'txt');
}
