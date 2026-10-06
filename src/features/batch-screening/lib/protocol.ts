import type { JobContext } from '@/entities/analysis';

import type { ScreenFileInput, ScreenOutcome } from './screen-file';

/**
 * The message contract between the page and a screening worker.
 *
 * Everything crossing the boundary is structured-cloneable plain data. The
 * file bytes are transferred rather than copied, which hands ownership to the
 * worker and avoids duplicating a ten-megabyte buffer per file.
 */

export interface ScreenRequest {
  kind: 'screen';
  input: ScreenFileInput;
  job: JobContext | null;
}

export type ScreenResponse =
  | { kind: 'result'; id: string; outcome: ScreenOutcome }
  /** The worker itself failed, as distinct from a file failing to parse. */
  | { kind: 'crashed'; id: string; message: string };
