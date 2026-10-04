'use client';

import { ArrowRight, Check, Copy, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { Suggestion } from '@/shared/api/enhance-contract';
import { cn } from '@/shared/lib/cn';
import type { AppError } from '@/shared/lib/result';
import { Button } from '@/shared/ui/button';
import { Callout } from '@/shared/ui/callout';

import type { Finding } from '@/entities/analysis';
import type { ResumeDocument } from '@/entities/resume';

import { canEnhance, requestSuggestions } from '../api/enhance';

/**
 * AI rewrites for one finding.
 *
 * Opt-in per finding rather than automatic. The deterministic report is
 * complete on its own, and sending text to a model -- even redacted -- is a
 * decision the user makes deliberately, not a side effect of opening a card.
 *
 * Nothing is applied automatically either. Suggestions are shown next to the
 * original and copied by hand, because a rewrite the user has not read is a
 * rewrite they cannot defend in an interview.
 */

export interface SuggestionPanelProps {
  finding: Finding;
  document: ResumeDocument;
  seniority: 'junior' | 'middle' | 'senior' | 'lead' | 'unknown';
  /** False when the server has no model configured; the action is hidden. */
  available: boolean;
}

type PanelState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; suggestions: Suggestion[]; model: string }
  | { kind: 'error'; error: AppError };

export function SuggestionPanel({ finding, document, seniority, available }: SuggestionPanelProps) {
  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  // A card can be collapsed mid-request; the response must not be applied to a
  // panel the user has already navigated away from.
  useEffect(() => () => abortRef.current?.abort(), []);

  if (!available || !canEnhance(finding, document)) return null;

  const run = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ kind: 'loading' });

    const result = await requestSuggestions({
      finding,
      document,
      seniority,
      signal: controller.signal,
    });

    if (controller.signal.aborted) return;

    setState(
      result.ok
        ? { kind: 'ready', suggestions: result.value.suggestions, model: result.value.model }
        : { kind: 'error', error: result.error },
    );
  };

  return (
    <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
      {state.kind === 'idle' || state.kind === 'error' ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void run()}
            iconLeft={<Sparkles className="size-3.5" aria-hidden="true" />}
          >
            {state.kind === 'error' ? 'Попробовать снова' : 'Переписать с помощью модели'}
          </Button>
          <span className="text-muted text-[0.6875rem]">
            Уходит только текст этих строк, с вырезанными персональными данными
          </span>
        </div>
      ) : null}

      {state.kind === 'loading' ? (
        <Button size="sm" variant="secondary" loading disabled>
          Переписываю…
        </Button>
      ) : null}

      {state.kind === 'error' ? (
        <Callout tone="major" className="mt-3">
          {state.error.message}
          {state.error.hint ? <span className="text-muted"> {state.error.hint}</span> : null}
        </Callout>
      ) : null}

      {state.kind === 'ready' ? (
        <div className="animate-enter flex flex-col gap-3">
          {state.suggestions.map((suggestion, index) => (
            <SuggestionCard key={`${index}-${suggestion.after}`} suggestion={suggestion} />
          ))}
          <p className="text-muted text-[0.6875rem]">
            Предложено моделью {state.model}. Проверьте цифры и факты перед использованием — модель
            не знает вашего проекта.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(suggestion.after);
      setCopied(true);
    } catch {
      // Clipboard access can be denied; the text is selectable either way.
    }
  };

  return (
    <div className="surface-sunken rounded-lg p-3">
      <p className="text-secondary decoration-critical-500/60 text-[0.8125rem] line-through">
        {suggestion.before}
      </p>

      <div className="mt-1.5 flex items-start gap-2">
        <ArrowRight className="text-good-500 mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <p className="flex-1 text-[0.8125rem] font-medium">{suggestion.after}</p>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => void copy()}
          aria-label="Скопировать переписанный вариант"
          className={cn('shrink-0', copied && 'text-good-500')}
        >
          {copied ? (
            <Check className="size-3.5" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )}
        </Button>
      </div>

      {suggestion.rationale ? (
        <p className="text-muted mt-1.5 text-[0.6875rem]">{suggestion.rationale}</p>
      ) : null}
    </div>
  );
}
