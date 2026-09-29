import Anthropic from '@anthropic-ai/sdk';

import { appError, err, ok, toErrorMessage, type Result } from '@/shared/lib/result';

import type { LlmCompletion, LlmProvider, LlmRequest, ProviderConfig } from '../types';

/**
 * Vendor adapter.
 *
 * This file is the only place in the codebase that knows which company supplies
 * the model. Everything above it sees `LlmProvider` and nothing else, so a
 * second adapter sits beside this one without touching a single caller.
 */

const DEFAULT_TEMPERATURE = 0.2;

export function createProvider(config: ProviderConfig): LlmProvider {
  const client = new Anthropic({ apiKey: config.apiKey });

  return {
    id: 'anthropic',
    model: config.model,

    async complete(request: LlmRequest): Promise<Result<LlmCompletion>> {
      try {
        const response = await client.messages.create(
          {
            model: config.model,
            max_tokens: request.maxOutputTokens ?? config.maxOutputTokens,
            temperature: request.temperature ?? DEFAULT_TEMPERATURE,
            system: request.system,
            messages: request.messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          },
          request.signal ? { signal: request.signal } : undefined,
        );

        const text = response.content
          .filter(
            (block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text',
          )
          .map((block) => block.text)
          .join('');

        return ok({
          text,
          model: response.model,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          },
        });
      } catch (cause) {
        return err(toAppError(cause));
      }
    },

    async *stream(request: LlmRequest): AsyncIterable<string> {
      const streamed = client.messages.stream(
        {
          model: config.model,
          max_tokens: request.maxOutputTokens ?? config.maxOutputTokens,
          temperature: request.temperature ?? DEFAULT_TEMPERATURE,
          system: request.system,
          messages: request.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        },
        request.signal ? { signal: request.signal } : undefined,
      );

      for await (const event of streamed) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    },
  };
}

function toAppError(cause: unknown) {
  const message = toErrorMessage(cause);
  const status =
    typeof cause === 'object' && cause !== null && 'status' in cause
      ? Number((cause as { status: unknown }).status)
      : undefined;

  if (status === 429) {
    return appError(
      'rate-limited',
      'Слишком много запросов к модели. Подождите минуту и попробуйте снова.',
      undefined,
      cause,
    );
  }

  if (status === 401 || status === 403) {
    return appError(
      'llm-unavailable',
      'Ключ доступа к модели отклонён.',
      'Проверьте переменную LLM_API_KEY в настройках окружения.',
      cause,
    );
  }

  return appError('llm-failed', `Модель не ответила: ${message}`, undefined, cause);
}
