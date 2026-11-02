'use client';

import { useEffect, useState } from 'react';

import { isEnhancementAvailable } from '../api/enhance';

/** Whether the server has a model configured. Checked once; false until known. */
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
