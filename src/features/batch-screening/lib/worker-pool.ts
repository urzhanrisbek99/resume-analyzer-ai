'use client';

import type { JobContext } from '@/entities/analysis';

import type { ScreenRequest, ScreenResponse } from './protocol';
import { screenFile, type ScreenFileInput, type ScreenOutcome } from './screen-file';

/**
 * A small pool of screening workers.
 *
 * Parsing a PDF is tens of milliseconds of synchronous work. Twenty-five of
 * them on the main thread freeze the tab: the progress bar does not move, the
 * sort controls do not respond, and the recruiter watches a dead page. Moving
 * the work off-thread fixes the freeze; running several in parallel also makes
 * it finish sooner, which is a separate win.
 *
 * The pool is deliberately modest. Each worker loads pdf.js, so spawning one
 * per core costs more memory than the time it saves, and the work is I/O-light
 * enough that four is already past the point of diminishing returns.
 *
 * Every failure mode falls back to running on the main thread rather than
 * dropping a file: a slow result is a result, a lost resume is a bug.
 */

const MAX_WORKERS = 4;

function desiredWorkerCount(fileCount: number): number {
  const cores = typeof navigator === 'undefined' ? 1 : (navigator.hardwareConcurrency ?? 2);
  // Leave a core for the page itself; never spawn more workers than files.
  return Math.max(1, Math.min(MAX_WORKERS, cores - 1, fileCount));
}

export function workersSupported(): boolean {
  return typeof Worker !== 'undefined';
}

function createWorker(): Worker {
  return new Worker(new URL('./screening.worker.ts', import.meta.url), {
    type: 'module',
    name: 'resume-screening',
  });
}

export interface RunScreeningOptions {
  files: ScreenFileInput[];
  job: JobContext | null;
  /** Called as each file finishes, in completion order, not input order. */
  onResult: (outcome: ScreenOutcome) => void;
  signal?: AbortSignal;
}

/**
 * Screen a batch, off the main thread where possible.
 *
 * Results are reported as they arrive rather than collected and returned at the
 * end, so the table fills in progressively instead of appearing all at once.
 */
export async function runScreening({
  files,
  job,
  onResult,
  signal,
}: RunScreeningOptions): Promise<void> {
  if (files.length === 0) return;

  if (!workersSupported()) {
    await runOnMainThread(files, job, onResult, signal);
    return;
  }

  const queue = [...files];
  const workers: Worker[] = [];

  try {
    const count = desiredWorkerCount(files.length);
    for (let i = 0; i < count; i += 1) workers.push(createWorker());
  } catch {
    // Construction can fail under a strict Content-Security-Policy.
    for (const worker of workers) worker.terminate();
    await runOnMainThread(queue, job, onResult, signal);
    return;
  }

  try {
    await Promise.all(workers.map((worker) => drain(worker, queue, job, onResult, signal)));
  } finally {
    for (const worker of workers) worker.terminate();
  }

  // Anything a crashed worker left behind still gets screened.
  if (queue.length > 0 && !signal?.aborted) {
    await runOnMainThread(queue, job, onResult, signal);
  }
}

/** Feed one worker from the shared queue until the queue is empty. */
async function drain(
  worker: Worker,
  queue: ScreenFileInput[],
  job: JobContext | null,
  onResult: (outcome: ScreenOutcome) => void,
  signal?: AbortSignal,
): Promise<void> {
  while (queue.length > 0) {
    if (signal?.aborted) return;

    const next = queue.shift();
    if (!next) return;

    try {
      onResult(await screenOnWorker(worker, next, job));
    } catch {
      // This worker is no longer usable. Put the file back for someone else.
      queue.unshift(next);
      return;
    }
  }
}

function screenOnWorker(
  worker: Worker,
  input: ScreenFileInput,
  job: JobContext | null,
): Promise<ScreenOutcome> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<ScreenResponse>) => {
      const response = event.data;
      if (response.id !== input.id) return;

      cleanup();
      if (response.kind === 'result') resolve(response.outcome);
      else reject(new Error(response.message));
    };

    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message || 'worker error'));
    };

    function cleanup() {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    }

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    const request: ScreenRequest = { kind: 'screen', input, job };
    // Transfer the buffer: ownership moves, nothing is copied.
    worker.postMessage(request, [input.bytes]);
  });
}

/**
 * The fallback, and the path taken when workers are unavailable.
 *
 * Yields between files so the progress bar still paints. Slower than the pool,
 * but identical in behaviour because it calls the same function.
 */
async function runOnMainThread(
  files: ScreenFileInput[],
  job: JobContext | null,
  onResult: (outcome: ScreenOutcome) => void,
  signal?: AbortSignal,
): Promise<void> {
  const queue = [...files];
  files.length = 0;

  for (const file of queue) {
    if (signal?.aborted) return;
    onResult(await screenFile(file, job));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}
