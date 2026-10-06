/// <reference lib="webworker" />

import { toErrorMessage } from '@/shared/lib/result';

import type { ScreenRequest, ScreenResponse } from './protocol';
import { screenFile } from './screen-file';

/**
 * The screening worker.
 *
 * Does nothing of its own: it receives a file, calls the same `screenFile` the
 * main thread would, and posts back the result. Keeping the worker this thin is
 * the point -- all the logic stays in a plain function that runs and is tested
 * without one.
 *
 * pdf.js spawns a worker of its own from in here. Nested workers are supported
 * everywhere this application runs; where they are not, the pool catches the
 * failure and falls back to the main thread rather than losing the file.
 */

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', (event: MessageEvent<ScreenRequest>) => {
  const request = event.data;
  if (request?.kind !== 'screen') return;

  void handle(request);
});

async function handle(request: ScreenRequest): Promise<void> {
  try {
    const outcome = await screenFile(request.input, request.job);
    const response: ScreenResponse = { kind: 'result', id: request.input.id, outcome };
    scope.postMessage(response);
  } catch (cause) {
    const response: ScreenResponse = {
      kind: 'crashed',
      id: request.input.id,
      message: toErrorMessage(cause),
    };
    scope.postMessage(response);
  }
}
