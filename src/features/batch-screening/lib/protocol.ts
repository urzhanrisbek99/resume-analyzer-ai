import type { JobContext } from '@/entities/analysis';

import type { ScreenFileInput, ScreenOutcome } from './screen-file';

/** Page-worker message contract. File bytes are transferred, not copied. */

export interface ScreenRequest {
  kind: 'screen';
  input: ScreenFileInput;
  job: JobContext | null;
}

export type ScreenResponse =
  | { kind: 'result'; id: string; outcome: ScreenOutcome }
  /** The worker itself failed, as distinct from a file failing to parse. */
  | { kind: 'crashed'; id: string; message: string };
