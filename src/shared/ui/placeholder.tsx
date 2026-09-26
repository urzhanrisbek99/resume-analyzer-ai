import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('surface-sunken animate-pulse rounded-md', className)} aria-hidden="true" />
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      {icon ? <div className="text-muted mb-3">{icon}</div> : null}
      <p className="text-sm font-semibold">{title}</p>
      {description ? (
        <p className="text-secondary mt-1 max-w-sm text-[0.8125rem]">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Screen-reader-only text, for labels that would be redundant visually. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
