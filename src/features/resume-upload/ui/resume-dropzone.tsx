'use client';

import { FileText, Upload } from 'lucide-react';
import { useCallback, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';

import { UPLOAD_LIMITS } from '@/shared/config/app';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';

export interface ResumeDropzoneProps {
  /** Always receives an array; single-file callers take the first entry. */
  onFiles: (files: File[]) => void;
  /** Omitted in batch mode, where pasting one resume makes no sense. */
  onPasteText?: () => void;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  hint?: ReactNode;
  className?: string;
}

/**
 * File drop target.
 *
 * Reachable by keyboard and by click, not only by drag: a drop-only zone locks
 * out anyone using a screen reader or a keyboard, and this is the single entry
 * point to the whole product.
 *
 * The control is the file input itself, wrapped in a `label`. The obvious
 * alternative -- a div with `role="button"` around a hidden input -- nests one
 * control inside another, which leaves a screen reader announcing two
 * overlapping buttons, and it reimplements Enter and Space by hand. Here the
 * browser provides the keyboard behaviour and the focus ring is drawn on the
 * label through `:has()`, so the visible focus follows the real focus.
 */
export function ResumeDropzone({
  onFiles,
  onPasteText,
  multiple = false,
  disabled = false,
  label,
  hint,
  className,
}: ResumeDropzoneProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const [isDragging, setDragging] = useState(false);
  // Drag events fire for every child element, so nesting is counted rather
  // than toggled -- otherwise the highlight flickers as the pointer moves.
  const dragDepth = useRef(0);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (disabled) return;

      const dropped = Array.from(event.dataTransfer.files);
      if (dropped.length > 0) onFiles(multiple ? dropped : dropped.slice(0, 1));
    },
    [disabled, multiple, onFiles],
  );

  const defaultLabel = multiple
    ? 'Перетащите резюме кандидатов или нажмите, чтобы выбрать'
    : 'Перетащите резюме или нажмите, чтобы выбрать';

  return (
    <div className={cn('w-full', className)}>
      <label
        htmlFor={inputId}
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragging(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className={cn(
          'rounded-card flex flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-12',
          'cursor-pointer text-center transition-colors duration-150',
          'has-[:focus-visible]:ring-accent-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2',
          isDragging
            ? 'border-accent-500 bg-accent-50 dark:bg-accent-700/15'
            : 'surface-raised hover:border-accent-300 border-[var(--border-strong)]',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        <div
          className={cn(
            'flex size-12 items-center justify-center rounded-full transition-colors',
            isDragging ? 'bg-accent-500 text-white' : 'surface-sunken text-secondary',
          )}
        >
          <Upload className="size-5" aria-hidden="true" />
        </div>

        <div>
          <p className="text-sm font-semibold">
            {isDragging
              ? multiple
                ? 'Отпустите файлы'
                : 'Отпустите файл'
              : (label ?? defaultLabel)}
          </p>
          <p className="text-secondary mt-1 text-[0.8125rem]">
            {UPLOAD_LIMITS.acceptedExtensions.join(', ')} · до{' '}
            {Math.round(UPLOAD_LIMITS.maxFileBytes / (1024 * 1024))} МБ
            {multiple ? ` · до ${UPLOAD_LIMITS.maxBatchFiles} файлов` : ''}
          </p>
        </div>

        <p id={hintId} className="text-muted max-w-sm text-[0.75rem]">
          {hint ?? 'Файл обрабатывается прямо в браузере и никуда не отправляется.'}
        </p>

        <input
          id={inputId}
          type="file"
          multiple={multiple}
          // The name is set here rather than taken from the label's text: the
          // visible wording is about dragging, which is not how this control is
          // used by keyboard or by screen reader.
          aria-label={multiple ? 'Загрузить резюме кандидатов' : 'Загрузить резюме'}
          aria-describedby={hintId}
          className="sr-only"
          accept={[...UPLOAD_LIMITS.acceptedExtensions, ...UPLOAD_LIMITS.acceptedMimeTypes].join(
            ',',
          )}
          disabled={disabled}
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            if (picked.length > 0) onFiles(picked);
            // Reset so selecting the same file twice fires a change event.
            event.target.value = '';
          }}
        />
      </label>

      {onPasteText ? (
        <div className="mt-3 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPasteText}
            disabled={disabled}
            iconLeft={<FileText className="size-4" aria-hidden="true" />}
          >
            Или вставить текст резюме
          </Button>
        </div>
      ) : null}
    </div>
  );
}
