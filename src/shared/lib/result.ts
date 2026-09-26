/**
 * Explicit success/failure values.
 *
 * Extraction fails for mundane reasons (an encrypted PDF, a scan with no text
 * layer) that the UI must explain rather than swallow, so those paths return a
 * Result instead of throwing.
 */

export type Result<T, E = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export type ErrorCode =
  | 'unsupported-format'
  | 'file-too-large'
  | 'encrypted-document'
  | 'no-text-layer'
  | 'empty-document'
  | 'extraction-failed'
  | 'llm-unavailable'
  | 'llm-failed'
  | 'rate-limited'
  | 'invalid-input';

export interface AppError {
  code: ErrorCode;
  /** Shown to the user. Written in Russian, actionable, never a stack trace. */
  message: string;
  /** Optional remediation hint, e.g. how to re-export the file. */
  hint?: string;
  cause?: unknown;
}

export function appError(code: ErrorCode, message: string, hint?: string, cause?: unknown): AppError {
  return hint === undefined ? { code, message, cause } : { code, message, hint, cause };
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invariant violated: ${message}`);
}

/** Narrow an unknown thrown value into something loggable. */
export function toErrorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  return 'Unknown error';
}
