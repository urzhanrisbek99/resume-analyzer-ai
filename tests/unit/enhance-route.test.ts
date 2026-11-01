import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from '@/app/api/enhance/route';
import { resetRateLimits } from '@/shared/api/rate-limit';
import { ok, err, appError, type ErrorCode, type Result } from '@/shared/lib/result';
import type { LlmCompletion, LlmRequest } from '@/shared/llm';

/**
 * The one server endpoint in the project.
 *
 * Everything it does is defensive, which is the point: the input comes from a
 * browser and the output comes from a language model, so neither can be
 * trusted. A model that answers with prose around its JSON, repeats the line it
 * was asked to improve, or returns an object of the wrong shape must not reach
 * the interface, and a failure must arrive as something the user can act on.
 */

const llm = vi.hoisted(() => ({
  provider: null as null | {
    id: string;
    model: string;
    complete: (request: LlmRequest) => Promise<Result<LlmCompletion>>;
  },
  getProviderError: null as Error | null,
  requests: [] as LlmRequest[],
}));

vi.mock('@/shared/llm', () => ({
  getLlmProvider: async () => {
    if (llm.getProviderError) throw llm.getProviderError;
    return llm.provider;
  },
}));

function reply(text: string): void {
  llm.provider = {
    id: 'test',
    model: 'test-model',
    complete: async (request) => {
      llm.requests.push(request);
      return ok({
        text,
        model: 'test-model-20260101',
        usage: { inputTokens: 300, outputTokens: 80 },
      });
    },
  };
}

function failWith(code: ErrorCode, message: string, hint?: string): void {
  llm.provider = {
    id: 'test',
    model: 'test-model',
    complete: async () => err(appError(code, message, hint)),
  };
}

const VALID_BODY = {
  ruleId: 'bullets-lack-numbers',
  guidance: 'Добавьте измеримый результат хотя бы в половину пунктов.',
  excerpts: ['Отвечал за разработку внутренних сервисов компании'],
  context: { headline: 'Backend Engineer', seniority: 'senior', language: 'ru' },
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request('http://localhost/api/enhance', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  resetRateLimits();
  llm.provider = null;
  llm.getProviderError = null;
  llm.requests.length = 0;
});

afterEach(() => {
  resetRateLimits();
});

describe('availability', () => {
  it('reports the layer as off when nothing is configured', async () => {
    await expect((await GET()).json()).resolves.toEqual({ enabled: false });
  });

  it('reports the layer as on once a provider exists', async () => {
    reply('{}');

    await expect((await GET()).json()).resolves.toEqual({ enabled: true });
  });

  it('reports off rather than failing when the configuration is broken', async () => {
    // A misspelled provider name throws on load. The client asks this endpoint
    // whether to show the feature at all, so an exception here would break a
    // page over a feature that is optional by design.
    llm.getProviderError = new Error('Unknown LLM provider "antropic".');

    await expect((await GET()).json()).resolves.toEqual({ enabled: false });
  });
});

describe('input validation', () => {
  it('rejects a body that is not JSON', async () => {
    const response = await post('not json at all');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'invalid-input' });
  });

  it('rejects a body that does not match the contract, and says what failed', async () => {
    const response = await post({ ...VALID_BODY, excerpts: [] });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { code: string; hint?: string };
    expect(payload.code).toBe('invalid-input');
    expect(payload.hint).toContain('excerpts');
  });

  it('rejects more excerpts than a request is allowed to carry', async () => {
    const response = await post({ ...VALID_BODY, excerpts: Array(7).fill('Делал разные задачи') });

    expect(response.status).toBe(400);
  });

  it('answers 503 with the variables to set when no model is configured', async () => {
    const response = await post(VALID_BODY);

    expect(response.status).toBe(503);
    const payload = (await response.json()) as { code: string; hint?: string };
    expect(payload.code).toBe('llm-unavailable');
    expect(payload.hint).toMatch(/LLM_PROVIDER.*LLM_API_KEY.*LLM_MODEL/);
  });
});

describe('a successful rewrite', () => {
  const ANSWER = JSON.stringify({
    suggestions: [
      {
        before: 'Отвечал за разработку внутренних сервисов компании',
        after: 'Построил три внутренних сервиса, которыми пользуются 40 сотрудников',
        rationale: 'Действие вместо обязанности, добавлен масштаб.',
      },
    ],
  });

  it('returns the rewrite with the model and the usage', async () => {
    reply(ANSWER);

    const response = await post(VALID_BODY);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      suggestions: Array<{ after: string }>;
      model: string;
      usage: { inputTokens: number };
    };
    expect(payload.suggestions).toHaveLength(1);
    expect(payload.suggestions[0]?.after).toContain('Построил');
    expect(payload.model).toBe('test-model-20260101');
    expect(payload.usage.inputTokens).toBe(300);
  });

  it('tells the caller how much of the budget is left', async () => {
    reply(ANSWER);

    const response = await post(VALID_BODY);

    expect(response.headers.get('X-RateLimit-Remaining')).toBe('9');
  });

  it('frames the prompt with the rule, the lines and the language', async () => {
    reply(ANSWER);

    await post(VALID_BODY);

    const [request] = llm.requests;
    expect(request?.system).toContain('Russian');
    expect(request?.system).toContain('[[PII_0]]');
    expect(request?.messages[0]?.content).toContain(VALID_BODY.guidance);
    expect(request?.messages[0]?.content).toContain(VALID_BODY.excerpts[0]);
    expect(request?.messages[0]?.content).toContain('Backend Engineer');
  });

  it('asks for English when the resume is in English', async () => {
    reply(ANSWER);

    await post({
      ...VALID_BODY,
      context: { headline: null, seniority: 'unknown', language: 'en' },
    });

    expect(llm.requests[0]?.system).toContain('English');
    // Nothing is claimed about a seniority the engine could not determine.
    expect(llm.requests[0]?.messages[0]?.content).not.toContain('Seniority');
  });
});

describe('a model answering badly', () => {
  it('finds the JSON inside a code fence and surrounding prose', async () => {
    reply(
      [
        'Sure! Here is the rewrite you asked for:',
        '```json',
        JSON.stringify({
          suggestions: [
            { before: 'Отвечал за разработку', after: 'Построил сервис', rationale: 'Действие.' },
          ],
        }),
        '```',
        'Let me know if you want another pass.',
      ].join('\n'),
    );

    const response = await post(VALID_BODY);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { suggestions: Array<{ after: string }> };
    expect(payload.suggestions[0]?.after).toBe('Построил сервис');
  });

  it('drops a rewrite identical to the line it was given', async () => {
    const line = VALID_BODY.excerpts[0]!;
    reply(JSON.stringify({ suggestions: [{ before: line, after: line, rationale: 'Ничего.' }] }));

    const response = await post(VALID_BODY);

    // Showing an unchanged line back as a suggestion is worse than showing none.
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: 'llm-failed' });
  });

  it('keeps the valid entries and drops the malformed ones', async () => {
    reply(
      JSON.stringify({
        suggestions: [
          { before: 'a', after: 'Построил сервис', rationale: 'Действие.' },
          { before: 'b', after: 42, rationale: 'Не строка.' },
          { nonsense: true },
        ],
      }),
    );

    const response = await post({
      ...VALID_BODY,
      excerpts: [VALID_BODY.excerpts[0]!, 'Занимался поддержкой кода'],
    });

    const payload = (await response.json()) as { suggestions: Array<{ after: string }> };
    expect(payload.suggestions).toHaveLength(1);
    expect(payload.suggestions[0]?.after).toBe('Построил сервис');
  });

  it.each([
    ['prose with no JSON at all', 'I cannot help with that.'],
    ['JSON that does not parse', '{"suggestions": ['],
    ['the wrong top-level shape', '{"result": "ok"}'],
  ])('reports %s as a failure rather than an empty success', async (_name, text) => {
    reply(text);

    const response = await post(VALID_BODY);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: 'llm-failed' });
  });
});

describe('failures from the model', () => {
  it('passes a vendor rate limit through as 429', async () => {
    failWith('rate-limited', 'Слишком много запросов к модели.');

    const response = await post(VALID_BODY);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ code: 'rate-limited' });
  });

  it('reports any other vendor failure as a bad gateway, keeping the hint', async () => {
    failWith('llm-unavailable', 'Ключ доступа к модели отклонён.', 'Проверьте LLM_API_KEY.');

    const response = await post(VALID_BODY);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: 'llm-unavailable',
      hint: 'Проверьте LLM_API_KEY.',
    });
  });
});

describe('the cost guard', () => {
  it('stops a caller past the per-minute limit and says when to retry', async () => {
    reply(
      JSON.stringify({
        suggestions: [{ before: 'a', after: 'Построил сервис', rationale: 'Действие.' }],
      }),
    );

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await post(VALID_BODY)).status).toBe(200);
    }

    const blocked = await post(VALID_BODY);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    // The model is never called for a request the guard rejected.
    expect(llm.requests).toHaveLength(10);
  });

  it('counts callers separately', async () => {
    reply(
      JSON.stringify({
        suggestions: [{ before: 'a', after: 'Построил сервис', rationale: 'Действие.' }],
      }),
    );

    for (let attempt = 0; attempt < 11; attempt += 1) await post(VALID_BODY);
    const other = await post(VALID_BODY, { 'x-forwarded-for': '198.51.100.4' });

    expect(other.status).toBe(200);
  });
});
