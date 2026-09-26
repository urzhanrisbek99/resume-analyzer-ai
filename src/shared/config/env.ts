import { z } from 'zod';

/**
 * Server-side environment, validated once at module load.
 *
 * The deterministic engine has no environment dependencies at all, so a missing
 * API key degrades the product rather than breaking it: `llm.enabled` is false
 * and the UI hides the suggestion layer.
 */
const serverEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-5'),
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

export interface LlmAvailability {
  enabled: boolean;
  model: string;
  maxOutputTokens: number;
}

export function llmAvailability(): LlmAvailability {
  const env = serverEnv();
  return {
    enabled: Boolean(env.ANTHROPIC_API_KEY),
    model: env.ANTHROPIC_MODEL,
    maxOutputTokens: env.LLM_MAX_OUTPUT_TOKENS,
  };
}

/** Test seam: drop the memoised value between cases. */
export function resetServerEnvCache(): void {
  cached = null;
}
