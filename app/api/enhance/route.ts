import { NextResponse } from 'next/server';

import {
  enhanceRequestSchema,
  suggestionSchema,
  type EnhanceRequest,
  type EnhanceResponse,
  type Suggestion,
} from '@/shared/api/enhance-contract';
import { clientKey, rateLimit } from '@/shared/api/rate-limit';
import { serverEnv } from '@/shared/config/env';
import { getLlmProvider } from '@/shared/llm';

/**
 * Rewrite a handful of resume lines to the standard a rule describes.
 *
 * Scope is deliberately narrow. The model is not asked to assess the resume --
 * that is the deterministic engine's job, and a score that moved because a model
 * felt differently today would be worthless. It is asked to do the one thing it
 * is genuinely better at: turning a flat sentence into a sharp one.
 *
 * The text arriving here is already PII-redacted by the client, which is the
 * only side that holds the document. See docs/adr/0003-privacy-boundary.md.
 */

export const runtime = 'nodejs';
/** Never cached: the body differs on every call and nothing here is static. */
export const dynamic = 'force-dynamic';

export async function GET() {
  const provider = await getLlmProvider().catch(() => null);
  return NextResponse.json({ enabled: provider !== null });
}

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request.headers), serverEnv().RATE_LIMIT_PER_MINUTE);
  if (!limit.allowed) {
    return problem(
      429,
      'rate-limited',
      'Слишком много запросов к модели.',
      `Попробуйте снова через ${limit.retryAfterSeconds} с.`,
      { 'Retry-After': String(limit.retryAfterSeconds) },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, 'invalid-input', 'Тело запроса не является корректным JSON.');
  }

  const parsed = enhanceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problem(
      400,
      'invalid-input',
      'Запрос не прошёл проверку.',
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }

  const provider = await getLlmProvider();
  if (!provider) {
    return problem(
      503,
      'llm-unavailable',
      'Слой рекомендаций не настроен.',
      'Задайте LLM_PROVIDER, LLM_API_KEY и LLM_MODEL в окружении.',
    );
  }

  const completion = await provider.complete({
    system: systemPrompt(parsed.data),
    messages: [{ role: 'user', content: userPrompt(parsed.data) }],
    temperature: 0.3,
  });

  if (!completion.ok) {
    const { code, message, hint } = completion.error;
    return problem(code === 'rate-limited' ? 429 : 502, code, message, hint);
  }

  const suggestions = parseSuggestions(completion.value.text, parsed.data.excerpts);
  if (suggestions.length === 0) {
    return problem(
      502,
      'llm-failed',
      'Модель вернула ответ, который не удалось разобрать.',
      'Попробуйте ещё раз.',
    );
  }

  const payload: EnhanceResponse = {
    suggestions,
    model: completion.value.model,
    usage: completion.value.usage,
  };

  return NextResponse.json(payload, {
    headers: { 'X-RateLimit-Remaining': String(limit.remaining) },
  });
}

const LANGUAGE_NAME = { ru: 'Russian', en: 'English' } as const;

function systemPrompt({ context }: EnhanceRequest): string {
  return [
    'You rewrite individual lines from a CV so they survive both an applicant',
    'tracking system and a recruiter skimming for six seconds.',
    '',
    'Rules you must follow:',
    `- Write in ${LANGUAGE_NAME[context.language]}, the language of the original line.`,
    '- Open with a completed-action verb. Never with a duty or a responsibility.',
    '- Keep every placeholder of the form [[PII_0]] exactly as it appears.',
    '- Never invent a number, a company, a technology or an outcome. If the',
    '  original has no measurable result, restructure what is there and say in',
    '  the rationale which metric the candidate should add themselves.',
    '- One or two lines per rewrite. No padding, no adjectives about character.',
    '- Preserve the original meaning. You are editing, not writing a new career.',
    '',
    'Respond with JSON only, no prose and no code fence, shaped as:',
    '{"suggestions":[{"before":"...","after":"...","rationale":"..."}]}',
    'Return one entry per input line, in the same order.',
    `The rationale is one short sentence in ${LANGUAGE_NAME[context.language]}.`,
  ].join('\n');
}

function userPrompt({ guidance, excerpts, context }: EnhanceRequest): string {
  const role = context.headline ? `Role on the CV: ${context.headline}.` : '';
  const level = context.seniority === 'unknown' ? '' : `Seniority claimed: ${context.seniority}.`;

  return [
    [role, level].filter(Boolean).join(' '),
    '',
    `What needs fixing: ${guidance}`,
    '',
    'Lines to rewrite:',
    ...excerpts.map((excerpt, index) => `${index + 1}. ${excerpt}`),
  ]
    .filter((part) => part !== undefined)
    .join('\n');
}

/**
 * Parse the model output.
 *
 * Tolerant of a code fence and of surrounding prose, because models add both
 * despite instructions. Strict about the shape: anything that does not validate
 * is dropped rather than rendered, and a rewrite identical to its input is
 * dropped too -- showing a user an unchanged line as a suggestion is worse than
 * showing nothing.
 */
function parseSuggestions(raw: string, excerpts: string[]): Suggestion[] {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }

  const container = parsed as { suggestions?: unknown };
  if (!Array.isArray(container.suggestions)) return [];

  return container.suggestions
    .map((entry, index) => {
      const result = suggestionSchema.safeParse(entry);
      if (!result.success) return null;

      const before = result.data.before.trim() || (excerpts[index] ?? '');
      const after = result.data.after.trim();
      if (after.length === 0 || after === before) return null;

      return { before, after, rationale: result.data.rationale.trim() };
    })
    .filter((entry): entry is Suggestion => entry !== null);
}

function problem(
  status: number,
  code: string,
  message: string,
  hint?: string,
  headers?: Record<string, string>,
) {
  return NextResponse.json(hint === undefined ? { code, message } : { code, message, hint }, {
    status,
    ...(headers ? { headers } : {}),
  });
}
