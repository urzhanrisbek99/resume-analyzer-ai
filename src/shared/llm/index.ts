import { llmConfig } from '@/shared/config/env';

import type { LlmProvider, ProviderFactory } from './types';

export type {
  LlmCompletion,
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmUsage,
  ProviderConfig,
  ProviderFactory,
} from './types';

/** Provider registry. Adapters load on demand, so unused vendor SDKs stay out of the bundle. */
const FACTORIES: Record<string, () => Promise<ProviderFactory>> = {
  anthropic: async () => (await import('./providers/anthropic')).createProvider,
};

export const SUPPORTED_PROVIDERS = Object.keys(FACTORIES);

let cached: LlmProvider | null = null;

/** The configured provider, or null when none is set (a supported state). */
export async function getLlmProvider(): Promise<LlmProvider | null> {
  if (cached) return cached;

  const config = llmConfig();
  if (!config.enabled) return null;

  const load = FACTORIES[config.provider];
  if (!load) {
    throw new Error(
      `Unknown LLM provider "${config.provider}". Supported: ${SUPPORTED_PROVIDERS.join(', ')}.`,
    );
  }

  const factory = await load();
  cached = factory({
    apiKey: config.apiKey,
    model: config.model,
    maxOutputTokens: config.maxOutputTokens,
  });

  return cached;
}

/** Test seam: drop the memoised provider between cases. */
export function resetLlmProvider(): void {
  cached = null;
}
