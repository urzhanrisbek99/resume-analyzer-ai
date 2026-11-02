'use client';

import {
  enhanceAvailabilitySchema,
  enhanceErrorSchema,
  enhanceResponseSchema,
  MAX_EXCERPTS,
  MAX_EXCERPT_CHARS,
  type EnhanceRequest,
  type Suggestion,
} from '@/shared/api/enhance-contract';
import { appError, err, ok, toErrorMessage, type Result } from '@/shared/lib/result';

import type { Finding } from '@/entities/analysis';
import { assertRedacted, redactForLlm, restore, type ResumeDocument } from '@/entities/resume';

/**
 * Client side of the suggestion layer. Redaction happens here because only
 * the client holds the document; `assertRedacted` throws before any request
 * that would leak.
 */

export interface EnhanceOutcome {
  suggestions: Suggestion[];
  model: string;
}

const ENDPOINT = '/api/enhance';

export async function isEnhancementAvailable(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(ENDPOINT, { method: 'GET', ...(signal ? { signal } : {}) });
    if (!response.ok) return false;
    return enhanceAvailabilitySchema.parse(await response.json()).enabled;
  } catch {
    return false;
  }
}

export interface RequestSuggestionsInput {
  finding: Finding;
  document: ResumeDocument;
  /** From the analysis, so the rewrite matches the level being claimed. */
  seniority: EnhanceRequest['context']['seniority'];
  signal?: AbortSignal;
}

export async function requestSuggestions({
  finding,
  document,
  seniority,
  signal,
}: RequestSuggestionsInput): Promise<Result<EnhanceOutcome>> {
  const excerpts = excerptsFor(finding, document);
  if (excerpts.length === 0) {
    return err(
      appError(
        'invalid-input',
        'Это замечание не указывает на конкретные строки.',
        'Переписывание доступно там, где движок нашёл конкретный текст.',
      ),
    );
  }

  // Merge every redaction map before restoring: catch-all placeholders are
  // numbered per call, so the document map alone would leave some behind.
  const entries: Record<string, string> = {};
  const redact = (text?: string) => {
    const result = text === undefined ? redactForLlm(document) : redactForLlm(document, text);
    Object.assign(entries, result.map.entries);
    return result.text;
  };

  redact();
  const redactedExcerpts = excerpts
    .slice(0, MAX_EXCERPTS)
    .map((excerpt) => redact(excerpt).slice(0, MAX_EXCERPT_CHARS));

  for (const excerpt of redactedExcerpts) assertRedacted(excerpt, document);

  const payload: EnhanceRequest = {
    ruleId: finding.ruleId,
    guidance: finding.fix.slice(0, 600),
    excerpts: redactedExcerpts,
    context: {
      headline: document.contacts.headline
        ? redact(document.contacts.headline).slice(0, 120)
        : null,
      seniority,
      language: rewriteLanguage(document),
    },
  };

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    });

    if (!response.ok) {
      const problem = enhanceErrorSchema.safeParse(await response.json().catch(() => null));
      if (problem.success) {
        const { code, message, hint } = problem.data;
        return err(
          appError(
            code === 'rate-limited'
              ? 'rate-limited'
              : code === 'llm-unavailable'
                ? 'llm-unavailable'
                : 'llm-failed',
            message,
            hint,
          ),
        );
      }
      return err(appError('llm-failed', `Сервис вернул ошибку ${response.status}.`));
    }

    const parsed = enhanceResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return err(appError('llm-failed', 'Ответ сервиса не соответствует ожидаемому формату.'));
    }

    const map = { entries };
    return ok({
      model: parsed.data.model,
      suggestions: parsed.data.suggestions.map((suggestion) => ({
        before: restore(suggestion.before, map),
        after: restore(suggestion.after, map),
        rationale: suggestion.rationale,
      })),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      return err(appError('llm-failed', 'Запрос отменён.'));
    }
    return err(appError('llm-failed', `Не удалось обратиться к сервису: ${toErrorMessage(cause)}`));
  }
}

/**
 * Language of the rewrite. A Russian IT resume is "mixed" because tech names
 * are Latin, so the script of the remaining prose decides.
 */
function rewriteLanguage({ language }: ResumeDocument): EnhanceRequest['context']['language'] {
  if (language.primary === 'ru') return 'ru';
  if (language.primary === 'mixed' && language.latinRatio < 0.5) return 'ru';
  return 'en';
}

export function excerptsFor(finding: Finding, document: ResumeDocument): string[] {
  const seen = new Set<string>();

  for (const anchor of finding.anchors) {
    if (!anchor.span) continue;
    const text = document.plainText.slice(anchor.span.start, anchor.span.end).trim();
    if (text.length >= 10) seen.add(text);
  }

  return [...seen].slice(0, MAX_EXCERPTS);
}

export function canEnhance(finding: Finding, document: ResumeDocument): boolean {
  return excerptsFor(finding, document).length > 0;
}
