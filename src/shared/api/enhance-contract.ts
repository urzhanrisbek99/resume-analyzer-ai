import { z } from 'zod';

/**
 * The contract for the suggestion endpoint, shared by both sides.
 *
 * Request and response are validated against the same schemas on the client and
 * on the server. A model can return anything, so its output is parsed before it
 * reaches a component rather than trusted into the UI.
 */

/** Keeps a single request cheap and bounded, and keeps prompts small. */
export const MAX_EXCERPTS = 6;
export const MAX_EXCERPT_CHARS = 400;

export const enhanceRequestSchema = z.object({
  /** Which rule the rewrite is answering, for prompt framing and logs. */
  ruleId: z.string().min(1).max(80),
  /** The rule's own advice, so the model works to the same standard. */
  guidance: z.string().min(1).max(600),
  /**
   * The lines to rewrite, already PII-redacted by the client. Placeholders of
   * the form [[PII_0]] are expected to survive into the output untouched.
   */
  excerpts: z.array(z.string().min(3).max(MAX_EXCERPT_CHARS)).min(1).max(MAX_EXCERPTS),
  /** Minimal framing so the rewrite matches the seniority being claimed. */
  context: z.object({
    headline: z.string().max(120).nullable(),
    seniority: z.enum(['junior', 'middle', 'senior', 'lead', 'unknown']),
    language: z.enum(['ru', 'en']),
  }),
});

export type EnhanceRequest = z.infer<typeof enhanceRequestSchema>;

export const suggestionSchema = z.object({
  before: z.string(),
  after: z.string(),
  /** One short sentence on what changed, so the user learns the pattern. */
  rationale: z.string(),
});

export type Suggestion = z.infer<typeof suggestionSchema>;

export const enhanceResponseSchema = z.object({
  suggestions: z.array(suggestionSchema),
  model: z.string(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
});

export type EnhanceResponse = z.infer<typeof enhanceResponseSchema>;

export const enhanceAvailabilitySchema = z.object({
  enabled: z.boolean(),
});

export type EnhanceAvailability = z.infer<typeof enhanceAvailabilitySchema>;

/** The shape every failure takes, so the client never guesses. */
export const enhanceErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  hint: z.string().optional(),
});

export type EnhanceError = z.infer<typeof enhanceErrorSchema>;
