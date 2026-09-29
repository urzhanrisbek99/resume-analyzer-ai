'use client';

import { Briefcase, ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';

/** Below this the text cannot carry usable requirements. */
const MIN_CHARS = 40;

export interface JobInputProps {
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
  /** True once the current text has been scored against. */
  applied: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Job advert input.
 *
 * Collapsed by default: the analysis is worth something without an advert, and
 * putting a large empty textarea above the score would suggest otherwise. Open
 * it and the keyword dimension switches on.
 */
export function JobInput({
  value,
  onChange,
  onApply,
  applied,
  disabled = false,
  className,
}: JobInputProps) {
  const [open, setOpen] = useState(value.length > 0);
  const fieldId = useId();
  const panelId = `${fieldId}-panel`;
  const ready = value.trim().length >= MIN_CHARS;

  return (
    <Card className={cn('p-0', className)} padded={false}>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <Briefcase className="text-muted size-4 shrink-0" aria-hidden="true" />

        <span className="min-w-0 flex-1">
          <span className="block text-[0.875rem] font-semibold">Сравнить с вакансией</span>
          <span className="text-secondary mt-0.5 block text-[0.8125rem]">
            {applied
              ? 'Резюме оценено с учётом требований вакансии'
              : 'Вставьте описание вакансии, чтобы проверить совпадение по требованиям'}
          </span>
        </span>

        {applied ? <Badge tone="accent">включено</Badge> : null}

        <ChevronDown
          className={cn(
            'text-muted size-4 shrink-0 transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      <div id={panelId} hidden={!open}>
        {open ? (
          <div className="animate-enter border-t border-[var(--border-subtle)] px-5 py-4">
            <label htmlFor={fieldId} className="sr-only">
              Текст вакансии
            </label>
            <textarea
              id={fieldId}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              disabled={disabled}
              rows={8}
              spellCheck={false}
              placeholder={'Вставьте описание вакансии целиком, вместе с требованиями…'}
              className="surface-sunken w-full resize-y rounded-xl border border-[var(--border-subtle)] p-3 text-[0.8125rem] leading-relaxed"
            />

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={onApply} disabled={disabled || !ready}>
                {applied ? 'Пересчитать' : 'Сравнить'}
              </Button>

              {value.trim().length > 0 && !ready ? (
                <span className="text-muted text-[0.75rem]">
                  Нужно хотя бы {MIN_CHARS} символов
                </span>
              ) : (
                <span className="text-muted text-[0.75rem]">
                  Блоки «Требования» и «Будет плюсом» распознаются отдельно
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
