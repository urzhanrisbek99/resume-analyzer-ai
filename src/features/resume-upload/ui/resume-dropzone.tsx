'use client';

import { FileText, Upload } from 'lucide-react';
import { useCallback, useRef, useState, type DragEvent, type ReactNode } from 'react';

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
  const inputRef = useRef<HTMLInputElement>(null);
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
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={multiple ? 'Загрузить резюме кандидатов' : 'Загрузить резюме'}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
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

        <p className="text-muted max-w-sm text-[0.75rem]">
          {hint ?? 'Файл обрабатывается прямо в браузере и никуда не отправляется.'}
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
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
      </div>

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
