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

/**
 * Provider registry.
 *
 * Adapters are loaded on demand so that an unused vendor SDK never reaches the
 * bundle, and so that a deployment without a key does not import one at all.
 */
const FACTORIES: Record<string, () => Promise<ProviderFactory>> = {
  anthropic: async () => (await import('./providers/anthropic')).createProvider,
};

export const SUPPORTED_PROVIDERS = Object.keys(FACTORIES);

let cached: LlmProvider | null = null;

/**
 * The configured provider, or null when no key is set.
 *
 * Null is a supported state, not a failure: the deterministic engine is the
 * product, and the suggestion layer is an optional addition on top of it.
 */
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
