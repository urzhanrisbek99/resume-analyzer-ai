import { z } from 'zod';

/**
 * Server environment, validated at module load. Without a model key the
 * suggestion layer is hidden; the deterministic engine needs no config.
 */
const serverEnvSchema = z.object({
  LLM_PROVIDER: z.string().min(1).optional(),
  LLM_API_KEY: z.string().min(1).optional(),
  // No default: a model is pinned per deployment, never guessed in code.
  LLM_MODEL: z.string().min(1).optional(),
  LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(8192).default(2048),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(10),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/** Throws only on malformed values, never on absent optional ones. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid server environment: ${issues}`);
  }

  cached = parsed.data;
  return cached;
}

export type LlmConfig =
  | { enabled: false }
  | {
      enabled: true;
      provider: string;
      apiKey: string;
      model: string;
      maxOutputTokens: number;
    };

/** Key, provider and model are all required; a partial config means disabled, not an error. */
export function llmConfig(): LlmConfig {
  const env = serverEnv();
  if (!env.LLM_API_KEY || !env.LLM_PROVIDER || !env.LLM_MODEL) return { enabled: false };

  return {
    enabled: true,
    provider: env.LLM_PROVIDER,
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
    maxOutputTokens: env.LLM_MAX_OUTPUT_TOKENS,
  };
}

/** Test seam: drop the memoised value between cases. */
export function resetServerEnvCache(): void {
  cached = null;
}
