import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * Tones are visual, not semantic: domain layers map their own vocabulary
 * (severity, score band) onto a tone so `shared` stays domain-agnostic.
 */
export type Tone = 'critical' | 'major' | 'minor' | 'good' | 'neutral' | 'accent';

const TONES: Record<Tone, string> = {
  critical: 'bg-critical-100 text-critical-700 dark:bg-critical-700/25 dark:text-critical-100',
  major: 'bg-major-100 text-major-700 dark:bg-major-700/25 dark:text-major-100',
  minor: 'bg-minor-100 text-minor-700 dark:bg-minor-700/25 dark:text-minor-100',
  good: 'bg-good-100 text-good-700 dark:bg-good-700/25 dark:text-good-100',
  neutral: 'surface-sunken text-secondary',
  accent: 'bg-accent-100 text-accent-700 dark:bg-accent-700/25 dark:text-accent-100',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  icon?: ReactNode;
}

export function Badge({ tone = 'neutral', icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
        'text-[0.6875rem] font-semibold tracking-wide uppercase',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}

/** A small count pill, e.g. the number of findings inside a dimension. */
export function CountPill({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-full px-1.5',
        'font-mono text-[0.6875rem] font-semibold tabular-nums',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
