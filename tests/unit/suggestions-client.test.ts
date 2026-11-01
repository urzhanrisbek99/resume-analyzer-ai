import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { enhanceRequestSchema, type EnhanceRequest } from '@/shared/api/enhance-contract';

import { analyseResume } from '@/entities/analysis';
import { buildResumeDocument, extractFromText } from '@/entities/resume';
import { requestSuggestions, isEnhancementAvailable } from '@/features/llm-suggestions';

import { WEAK_RESUME } from '@/tests/fixtures/resumes';

/**
 * The client half of the suggestion layer.
 *
 * It is where the privacy boundary is actually enforced -- the browser is the
 * only side holding the document -- so the test that matters most is the one
 * that reads the request body and finds no name, no address and no link in it.
 *
 * The rest is the other half of not trusting the model: an answer that does not
 * match the contract has to become an error rather than reach a component, and
 * a placeholder has to turn back into the real name before anyone reads it.
 */

function parse(text: string) {
  const extracted = extractFromText(text);
  if (!extracted.ok) throw new Error(extracted.error.message);

  return buildResumeDocument({
    extraction: extracted.value,
    file: { name: 'resume.txt', sizeBytes: text.length },
    extractionMs: 0,
  });
}

const document = parse(WEAK_RESUME);
const analysis = analyseResume(document, { now: new Date('2026-01-15T00:00:00.000Z') });
const anchoredFinding = analysis.findings.find((finding) =>
  finding.anchors.some((anchor) => anchor.span),
);

const PII = ['Ivan Petrov', 'ivan.petrov@example.com'];

let fetchMock: ReturnType<typeof vi.fn>;

/** The body of the one POST the client made, parsed. */
function sentPayload(): EnhanceRequest {
  const call = fetchMock.mock.calls.find(
    ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
  );
  if (!call) throw new Error('no POST was made');
  const body = (call[1] as RequestInit).body;
  return enhanceRequestSchema.parse(JSON.parse(String(body)));
}

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValue(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function ask(overrides: Partial<Parameters<typeof requestSuggestions>[0]> = {}) {
  if (!anchoredFinding) throw new Error('the fixture produced no anchored finding');

  return requestSuggestions({
    finding: anchoredFinding,
    document,
    seniority: analysis.metrics.impliedSeniority,
    ...overrides,
  });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('what leaves the browser', () => {
  it('carries no personal data at all', async () => {
    respond(200, {
      suggestions: [{ before: 'a', after: 'Построил сервис', rationale: 'Действие.' }],
      model: 'test-model',
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    await ask();

    const raw = JSON.stringify(sentPayload());
    for (const value of PII) expect(raw).not.toContain(value);
  });

  it('passes its own contract, with the rule and the lines it points at', async () => {
    respond(200, {
      suggestions: [{ before: 'a', after: 'Построил сервис', rationale: 'Действие.' }],
      model: 'test-model',
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    await ask();
    const payload = sentPayload();

    expect(payload.ruleId).toBe(anchoredFinding?.ruleId);
    expect(payload.excerpts.length).toBeGreaterThan(0);
    expect(payload.context.language).toBe('ru');
  });

  it('does not call the service at all for a finding with no lines', async () => {
    const unanchored = analysis.findings.find((finding) => finding.anchors.length === 0);
    expect(unanchored, 'the fixture produced no unanchored finding').toBeDefined();

    const result = await ask({ finding: unanchored! });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-input');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('what comes back', () => {
  it('puts the real values back into the rewrite', async () => {
    // The model is required to keep placeholders untouched; the client is what
    // turns them back into a name, so the user never sees the machinery.
    const { text: redacted } = await import('@/entities/resume').then((module) => ({
      text: module.redactForLlm(document).text,
    }));
    const placeholder = redacted.match(/\[\[PII_\d+]]/)?.[0];
    expect(placeholder, 'redaction produced no placeholder to restore').toBeDefined();

    respond(200, {
      suggestions: [
        {
          before: 'Senior Frontend Engineer',
          after: `${placeholder} rebuilt the checkout flow`,
          rationale: 'Действие вместо обязанности.',
        },
      ],
      model: 'test-model',
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const result = await ask();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.suggestions[0]?.after).not.toContain('[[PII_');
    expect(result.value.model).toBe('test-model');
  });

  it('refuses an answer that does not match the contract', async () => {
    respond(200, { suggestions: [{ before: 'a', after: 42 }], model: 'test-model' });

    const result = await ask();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('llm-failed');
  });

  it.each([
    [429, 'rate-limited', 'rate-limited'],
    [503, 'llm-unavailable', 'llm-unavailable'],
    [502, 'llm-failed', 'llm-failed'],
    [502, 'something-new', 'llm-failed'],
  ])('maps a %i response with code %s onto %s', async (status, code, expected) => {
    respond(status, { code, message: 'Сервис недоступен.', hint: 'Попробуйте позже.' });

    const result = await ask();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(expected);
      expect(result.error.hint).toBe('Попробуйте позже.');
    }
  });

  it('reports the status when the error body is not the shape it should be', async () => {
    respond(500, '<html>Gateway Timeout</html>');

    const result = await ask();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('500');
  });

  it('reports a cancelled request as cancelled, not as a failure of the model', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    const result = await ask();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/отменён/i);
  });

  it('survives the network being gone', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await ask();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Failed to fetch');
  });
});

describe('availability', () => {
  it('is true when the service says so', async () => {
    respond(200, { enabled: true });

    await expect(isEnhancementAvailable()).resolves.toBe(true);
  });

  it('is false when the service says so', async () => {
    respond(200, { enabled: false });

    await expect(isEnhancementAvailable()).resolves.toBe(false);
  });

  it.each([
    ['the service answers with an error', () => respond(500, { code: 'x', message: 'y' })],
    ['the answer is not the expected shape', () => respond(200, { on: true })],
    ['the request fails outright', () => fetchMock.mockRejectedValue(new Error('offline'))],
  ])('is false when %s', async (_name, arrange) => {
    arrange();

    await expect(isEnhancementAvailable()).resolves.toBe(false);
  });
});
