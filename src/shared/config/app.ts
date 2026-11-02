/** Client-safe application constants. */

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Resume Analyzer AI';

export const ROUTES = {
  home: '/',
  candidate: '/analyze',
  recruiter: '/recruiter',
} as const;

/** Upload limits. Enforced client-side before a single byte is read. */
export const UPLOAD_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxBatchFiles: 25,
  acceptedMimeTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
  ],
  acceptedExtensions: ['.pdf', '.docx', '.txt', '.md'],
} as const;

/** Resumes are held in memory only and never uploaded (ADR 0003). */
export const PRIVACY = {
  filesLeaveDevice: false,
  llmReceivesRedactedTextOnly: true,
} as const;
