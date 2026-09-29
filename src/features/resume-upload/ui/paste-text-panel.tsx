'use client';

import { useId, useState } from 'react';

import { Button } from '@/shared/ui/button';
import { Callout } from '@/shared/ui/callout';

export interface PasteTextPanelProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}

/** Below this the text cannot carry an experience section worth scoring. */
const MIN_CHARS = 120;

/**
 * Paste-the-text fallback.
 *
 * The escape hatch for a PDF that is a scan, and the fastest path for anyone
 * who keeps their resume in a document editor. The structure and content
 * dimensions score identically from pasted text; only the layout checks, which
 * need a real file, are unavailable.
 */
export function PasteTextPanel({ onSubmit, onCancel, disabled = false }: PasteTextPanelProps) {
  const [text, setText] = useState('');
  const fieldId = useId();
  const tooShort = text.trim().length > 0 && text.trim().length < MIN_CHARS;

  return (
    <div className="w-full">
      <label htmlFor={fieldId} className="mb-2 block text-sm font-medium">
        Текст резюме
      </label>

      <textarea
        id={fieldId}
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={disabled}
        rows={14}
        spellCheck={false}
        placeholder={'Вставьте сюда текст резюме целиком…'}
        aria-describedby={`${fieldId}-hint`}
        className="surface-raised w-full resize-y rounded-xl border border-[var(--border-strong)] p-3 font-mono text-[0.8125rem] leading-relaxed"
      />

      <p id={`${fieldId}-hint`} className="text-muted mt-2 text-[0.75rem]">
        Проверки вёрстки (колонки, таблицы, шрифты) доступны только при загрузке файла — им нужен
        сам документ.
      </p>

      {tooShort ? (
        <Callout tone="minor" className="mt-3">
          Слишком мало текста: нужно хотя бы {MIN_CHARS} символов, чтобы было что анализировать.
        </Callout>
      ) : null}

      <div className="mt-4 flex gap-2">
        <Button
          onClick={() => onSubmit(text.trim())}
          disabled={disabled || text.trim().length < MIN_CHARS}
        >
          Проанализировать
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={disabled}>
          Отмена
        </Button>
      </div>
    </div>
  );
}
