import { cn } from '@/shared/lib/cn';
import type { Tone } from '@/shared/ui/badge';

const FILL: Record<Tone, string> = {
  critical: 'bg-critical-500',
  major: 'bg-major-500',
  minor: 'bg-minor-500',
  good: 'bg-good-500',
  neutral: 'bg-ink-400',
  accent: 'bg-accent-500',
};

export interface MeterProps {
  value: number;
  max?: number;
  tone?: Tone;
  label?: string;
  /** Rendered at the right edge of the label row. */
  valueLabel?: string;
  className?: string;
}

/** Horizontal bar with an accessible label and a text-rendered value. */
export function Meter({
  value,
  max = 100,
  tone = 'accent',
  label,
  valueLabel,
  className,
}: MeterProps) {
  const ratio = max === 0 ? 0 : Math.max(0, Math.min(1, value / max));

  return (
    <div className={cn('w-full', className)}>
      {label || valueLabel ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[0.8125rem]">
          {label ? <span className="text-secondary truncate">{label}</span> : <span />}
          {valueLabel ? (
            <span className="shrink-0 font-semibold tabular-nums">{valueLabel}</span>
          ) : null}
        </div>
      ) : null}
      <div
        className="surface-sunken h-2 w-full overflow-hidden rounded-full"
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label ?? 'Значение'}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-out', FILL[tone])}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
