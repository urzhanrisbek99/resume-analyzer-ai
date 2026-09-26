'use client';

import { useId, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export interface TabItem<TId extends string = string> {
  id: TId;
  label: ReactNode;
  /** Optional trailing element, typically a count pill. */
  trailing?: ReactNode;
}

export interface TabsProps<TId extends string = string> {
  items: ReadonlyArray<TabItem<TId>>;
  activeId: TId;
  onChange: (id: TId) => void;
  label: string;
  className?: string;
}

/**
 * Roving-tabindex tab list with arrow-key navigation, per WAI-ARIA. Panels are
 * rendered by the caller so a tab can own an arbitrarily complex subtree.
 */
export function Tabs<TId extends string = string>({
  items,
  activeId,
  onChange,
  label,
  className,
}: TabsProps<TId>) {
  const baseId = useId();
  const activeIndex = items.findIndex((item) => item.id === activeId);

  const move = (delta: number) => {
    if (items.length === 0) return;
    const next = (activeIndex + delta + items.length) % items.length;
    const target = items[next];
    if (target) onChange(target.id);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'surface-sunken inline-flex items-center gap-1 rounded-xl p-1',
        'overflow-x-auto',
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          move(1);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          move(-1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          const first = items[0];
          if (first) onChange(first.id);
        } else if (event.key === 'End') {
          event.preventDefault();
          const last = items[items.length - 1];
          if (last) onChange(last.id);
        }
      }}
    >
      {items.map((item) => {
        const selected = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${baseId}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5',
              'text-[0.8125rem] font-medium transition-colors',
              selected
                ? 'surface-raised text-[var(--text-primary)] shadow-sm'
                : 'text-secondary hover:text-[var(--text-primary)]',
            )}
          >
            {item.label}
            {item.trailing}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  id: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ id, active, children, className }: TabPanelProps) {
  return (
    <div role="tabpanel" id={id} hidden={!active} tabIndex={0} className={className}>
      {active ? children : null}
    </div>
  );
}
