import type { Result } from '@/shared/lib/result';

/**
 * Provider interface for language models. Features depend on `LlmProvider`,
 * not on a vendor SDK. Server-side only.
 */

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  /** Instructions that frame the task. Sent separately from the conversation. */
  system: string;
  messages: LlmMessage[];
  maxOutputTokens?: number;
  /** 0-1. Suggestion rewriting wants low values; it is not a creative task. */
  temperature?: number;
  signal?: AbortSignal;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmCompletion {
  text: string;
  usage: LlmUsage;
  /** Identifier of the model that produced this, for the cost panel and logs. */
  model: string;
}

export interface LlmProvider {
  /** Stable key, e.g. the value of `LLM_PROVIDER`. */
  readonly id: string;
  readonly model: string;
  complete(request: LlmRequest): Promise<Result<LlmCompletion>>;
  /** Incremental text chunks. Absent when the adapter cannot stream. */
  stream?(request: LlmRequest): AsyncIterable<string>;
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
  maxOutputTokens: number;
}

/** Builds a provider from validated configuration. */
export type ProviderFactory = (config: ProviderConfig) => LlmProvider;
