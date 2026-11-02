/// <reference lib="webworker" />

import { toErrorMessage } from '@/shared/lib/result';

import type { ScreenRequest, ScreenResponse } from './protocol';
import { screenFile } from './screen-file';

/**
 * Thin wrapper around `screenFile`. pdf.js spawns a nested worker from here;
 * if that fails, the pool falls back to the main thread.
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
