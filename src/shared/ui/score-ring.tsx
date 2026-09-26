import { cn } from '@/shared/lib/cn';
import type { Tone } from '@/shared/ui/badge';

const TRACK_COLOR: Record<Tone, string> = {
  critical: 'var(--color-critical-500)',
  major: 'var(--color-major-500)',
  minor: 'var(--color-minor-500)',
  good: 'var(--color-good-500)',
  neutral: 'var(--color-ink-400)',
  accent: 'var(--color-accent-500)',
};

export interface ScoreRingProps {
  /** 0-100. Values outside the range are clamped rather than rejected. */
  value: number;
  tone?: Tone;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}

/**
 * Circular score gauge. The numeric value is rendered as text inside the ring,
 * so the meaning does not depend on colour alone.
 */
export function ScoreRing({
  value,
  tone = 'accent',
  size = 120,
  strokeWidth = 10,
  label,
  className,
}: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;

  return (
    <div
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Оценка'}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true" focusable="false">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-sunken)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={TRACK_COLOR[tone]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-semibold tabular-nums"
          style={{ fontSize: size * 0.28, lineHeight: 1 }}
        >
          {clamped}
        </span>
        {label ? (
          <span className="text-muted mt-0.5 text-[0.625rem] tracking-wide uppercase">{label}</span>
        ) : null}
      </div>
    </div>
  );
}
