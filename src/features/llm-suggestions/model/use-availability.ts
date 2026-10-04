'use client';

import { useEffect, useState } from 'react';

import { isEnhancementAvailable } from '../api/enhance';

/**
 * Whether the server has a model configured.
 *
 * Asked once, on mount, and defaulted to false. The deterministic report is the
 * product; the rewrite action only appears when it can actually work, rather
 * than appearing and then failing when pressed.
 */
export function useEnhancementAvailability(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void isEnhancementAvailable(controller.signal).then((enabled) => {
      if (!controller.signal.aborted) setAvailable(enabled);
    });

    return () => controller.abort();
  }, []);

  return available;
}
