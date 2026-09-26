import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import type { Tone } from '@/shared/ui/badge';

const SHELL: Record<Tone, string> = {
  critical: 'border-critical-500/35 bg-critical-100/60 dark:bg-critical-700/15',
  major: 'border-major-500/35 bg-major-100/60 dark:bg-major-700/15',
  minor: 'border-minor-500/35 bg-minor-100/60 dark:bg-minor-700/15',
  good: 'border-good-500/35 bg-good-100/60 dark:bg-good-700/15',
  neutral: 'border-[var(--border-subtle)] surface-sunken',
  accent: 'border-accent-500/35 bg-accent-50 dark:bg-accent-700/15',
};

export interface CalloutProps {
  tone?: Tone;
  title?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Callout({ tone = 'neutral', title, icon, children, className }: CalloutProps) {
  return (
    <div className={cn('rounded-xl border px-4 py-3 text-[0.8125rem]', SHELL[tone], className)}>
      <div className="flex gap-2.5">
        {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
        <div className="min-w-0">
          {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
          {children ? <div className="text-secondary">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}
