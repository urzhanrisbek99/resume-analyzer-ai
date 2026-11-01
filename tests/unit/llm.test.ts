import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { llmConfig, resetServerEnvCache, serverEnv } from '@/shared/config/env';
import { getLlmProvider, resetLlmProvider, SUPPORTED_PROVIDERS } from '@/shared/llm';

/**
 * The optional layer, and the configuration that decides whether it exists.
 *
 * Two things are worth testing here and neither of them is the model. The first
 * is that a missing or half-filled configuration degrades the product instead
 * of breaking it -- the deterministic engine is the product, and a deployment
 * with no key has to start cleanly. The second is that a vendor error arrives
 * at the user as an explanation rather than as a stack trace.
 *
 * The vendor SDK is replaced, so no test here can reach the network or need a
 * key. What is being checked is the adapter, which is the only file that knows
 * which company supplies the model.
 */

const sdk = vi.hoisted(() => ({
  create: (() => {
    throw new Error('create not configured for this test');
  }) as (...args: unknown[]) => unknown,
  stream: (() => {
    throw new Error('stream not configured for this test');
  }) as (...args: unknown[]) => unknown,
  calls: [] as unknown[][],
  constructedWith: [] as unknown[],
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    messages = {
      create: (...args: unknown[]) => {
        sdk.calls.push(args);
        return sdk.create(...args);
      },
      stream: (...args: unknown[]) => {
        sdk.calls.push(args);
        return sdk.stream(...args);
      },
    };

    constructor(options: unknown) {
      sdk.constructedWith.push(options);
    }
  },
}));

const ORIGINAL_ENV = { ...process.env };

function configure(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetServerEnvCache();
  resetLlmProvider();
}

function configureProvider(overrides: Record<string, string | undefined> = {}) {
  configure({
    LLM_PROVIDER: 'anthropic',
    LLM_API_KEY: 'test-key',
    LLM_MODEL: 'test-model',
    ...overrides,
  });
}

beforeEach(() => {
  configure({ LLM_PROVIDER: undefined, LLM_API_KEY: undefined, LLM_MODEL: undefined });
  sdk.calls.length = 0;
  sdk.constructedWith.length = 0;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetServerEnvCache();
  resetLlmProvider();
});

describe('configuration', () => {
  it('reports the layer as disabled when nothing is set', () => {
    expect(llmConfig()).toEqual({ enabled: false });
  });

  it.each([
    ['without a key', { LLM_API_KEY: undefined }],
    ['without a provider', { LLM_PROVIDER: undefined }],
    ['without a model', { LLM_MODEL: undefined }],
  ])('treats a configuration %s as disabled rather than as an error', (_name, overrides) => {
    configureProvider(overrides);

    expect(llmConfig().enabled).toBe(false);
  });

  it('exposes the full configuration once all three are present', () => {
    configureProvider();

    expect(llmConfig()).toEqual({
      enabled: true,
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'test-model',
      maxOutputTokens: 2048,
    });
  });

  it('applies the documented defaults', () => {
    const env = serverEnv();

    expect(env.LLM_MAX_OUTPUT_TOKENS).toBe(2048);
    expect(env.RATE_LIMIT_PER_MINUTE).toBe(10);
  });

  it('reads the limits from the environment when they are given', () => {
    configure({ LLM_MAX_OUTPUT_TOKENS: '4096', RATE_LIMIT_PER_MINUTE: '60' });

    expect(serverEnv().LLM_MAX_OUTPUT_TOKENS).toBe(4096);
    expect(serverEnv().RATE_LIMIT_PER_MINUTE).toBe(60);
  });

  it.each(['0', '99999', 'many'])(
    'refuses a malformed token limit (%s) and names the variable',
    (value) => {
      configure({ LLM_MAX_OUTPUT_TOKENS: value });

      expect(() => serverEnv()).toThrow(/LLM_MAX_OUTPUT_TOKENS/);
    },
  );

  it('parses once and keeps the result', () => {
    const first = serverEnv();
    process.env.RATE_LIMIT_PER_MINUTE = '999';

    // Without the cache the application would read a different environment
    // depending on when it happened to ask.
    expect(serverEnv()).toBe(first);
    expect(serverEnv().RATE_LIMIT_PER_MINUTE).toBe(10);
  });
});

describe('provider registry', () => {
  it('returns no provider when the layer is disabled', async () => {
    await expect(getLlmProvider()).resolves.toBeNull();
  });

  it('builds the configured provider and passes the key to it', async () => {
    configureProvider();

    const provider = await getLlmProvider();

    expect(provider?.id).toBe('anthropic');
    expect(provider?.model).toBe('test-model');
    expect(sdk.constructedWith).toEqual([{ apiKey: 'test-key' }]);
  });

  it('builds the provider once', async () => {
    configureProvider();

    const first = await getLlmProvider();
    const second = await getLlmProvider();

    expect(second).toBe(first);
    expect(sdk.constructedWith).toHaveLength(1);
  });

  it('rejects an unknown provider by name, listing the ones that exist', async () => {
    configureProvider({ LLM_PROVIDER: 'definitely-not-a-vendor' });

    await expect(getLlmProvider()).rejects.toThrow(/definitely-not-a-vendor/);
    await expect(getLlmProvider()).rejects.toThrow(new RegExp(SUPPORTED_PROVIDERS.join('|')));
  });
});

describe('the vendor adapter', () => {
  async function provider() {
    configureProvider();
    const configured = await getLlmProvider();
    if (!configured) throw new Error('provider was not configured');
    return configured;
  }

  const REQUEST = {
    system: 'Rewrite the bullet.',
    messages: [{ role: 'user' as const, content: 'Responsible for the backend.' }],
  };

  it('joins the text blocks and reports the usage', async () => {
    sdk.create = () => ({
      content: [
        { type: 'text', text: 'Rebuilt the settlement pipeline' },
        { type: 'thinking', thinking: 'ignored' },
        { type: 'text', text: ', cutting p99 latency to 95ms.' },
      ],
      model: 'test-model-20260101',
      usage: { input_tokens: 412, output_tokens: 57 },
    });

    const result = await (await provider()).complete(REQUEST);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe('Rebuilt the settlement pipeline, cutting p99 latency to 95ms.');
    expect(result.value.usage).toEqual({ inputTokens: 412, outputTokens: 57 });
    // The model the request named may not be the one that answered.
    expect(result.value.model).toBe('test-model-20260101');
  });

  it('sends the configured limit and a low temperature by default', async () => {
    sdk.create = () => ({ content: [], model: 'm', usage: { input_tokens: 1, output_tokens: 1 } });

    await (await provider()).complete(REQUEST);

    const [body] = sdk.calls[0] as [Record<string, unknown>];
    expect(body.max_tokens).toBe(2048);
    expect(body.temperature).toBe(0.2);
    expect(body.system).toBe(REQUEST.system);
  });

  it('lets a request override the limit and the temperature', async () => {
    sdk.create = () => ({ content: [], model: 'm', usage: { input_tokens: 1, output_tokens: 1 } });

    await (await provider()).complete({ ...REQUEST, maxOutputTokens: 512, temperature: 0.9 });

    const [body] = sdk.calls[0] as [Record<string, unknown>];
    expect(body.max_tokens).toBe(512);
    expect(body.temperature).toBe(0.9);
  });

  it.each([
    [429, 'rate-limited', /подождите/i],
    [401, 'llm-unavailable', /LLM_API_KEY/],
    [403, 'llm-unavailable', /LLM_API_KEY/],
  ])('turns HTTP %i into an explanation the user can act on', async (status, code, text) => {
    sdk.create = () => {
      throw Object.assign(new Error('upstream said no'), { status });
    };

    const result = await (await provider()).complete(REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(code);
    expect(`${result.error.message} ${result.error.hint ?? ''}`).toMatch(text);
  });

  it('reports an unclassified failure without losing the cause', async () => {
    sdk.create = () => {
      throw new Error('socket hang up');
    };

    const result = await (await provider()).complete(REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('llm-failed');
    expect(result.error.message).toContain('socket hang up');
  });

  it('streams the text deltas and nothing else', async () => {
    sdk.stream = async function* () {
      yield { type: 'message_start' };
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Rebuilt ' } };
      yield { type: 'content_block_delta', delta: { type: 'signature_delta', signature: 'x' } };
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'the pipeline' } };
      yield { type: 'message_stop' };
    };

    const configured = await provider();
    const chunks: string[] = [];
    for await (const chunk of configured.stream?.(REQUEST) ?? []) chunks.push(chunk);

    expect(chunks.join('')).toBe('Rebuilt the pipeline');
  });

  it('passes an abort signal through to the vendor call', async () => {
    sdk.create = () => ({ content: [], model: 'm', usage: { input_tokens: 1, output_tokens: 1 } });
    const controller = new AbortController();

    await (await provider()).complete({ ...REQUEST, signal: controller.signal });

    expect(sdk.calls[0]?.[1]).toEqual({ signal: controller.signal });
  });
});
