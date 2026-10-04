'use client';

import { ArrowRight, ChevronDown, Lightbulb } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { Badge, type Tone } from '@/shared/ui/badge';

import {
  DIMENSION_LABELS,
  SEVERITY_LABELS,
  type Finding,
  type Severity,
} from '@/entities/analysis';
import type { ResumeDocument } from '@/entities/resume';
import { SuggestionPanel } from '@/features/llm-suggestions';

const SEVERITY_TONE: Record<Severity, Tone> = {
  critical: 'critical',
  major: 'major',
  minor: 'minor',
  info: 'neutral',
};

export interface FindingCardProps {
  finding: Finding;
  expanded: boolean;
  onToggle: () => void;
  /** Needed to pull the exact lines a rewrite should work on. */
  document: ResumeDocument;
  seniority: 'junior' | 'middle' | 'senior' | 'lead' | 'unknown';
  enhancementAvailable: boolean;
}

/**
 * One finding.
 *
 * Collapsed it shows the claim; expanded it shows why it matters, what to do,
 * and a rewrite of a real line where the rule could produce one. The "why" is
 * not decoration: a candidate who understands the reason will fix the whole
 * resume, while one who is only told "add numbers" will patch one bullet.
 */
export function FindingCard({
  finding,
  expanded,
  onToggle,
  document,
  seniority,
  enhancementAvailable,
}: FindingCardProps) {
  const tone = SEVERITY_TONE[finding.severity];
  const contentId = `finding-body-${finding.id}`;

  return (
    <article
      className={cn(
        'surface-raised overflow-hidden rounded-xl border transition-colors',
        expanded ? 'border-[var(--border-strong)]' : 'border-[var(--border-subtle)]',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <span className="mt-0.5 shrink-0">
          <Badge tone={tone}>{SEVERITY_LABELS[finding.severity]}</Badge>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[0.875rem] font-semibold">{finding.title}</span>
          <span className="text-secondary mt-0.5 block text-[0.8125rem]">{finding.detail}</span>
        </span>

        <ChevronDown
          className={cn(
            'text-muted mt-1 size-4 shrink-0 transition-transform duration-200',
            expanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      <div id={contentId} hidden={!expanded}>
        {expanded ? (
          <div className="animate-enter border-t border-[var(--border-subtle)] px-4 py-3">
            <Section title="Почему это важно">{finding.why}</Section>
            <Section title="Что сделать" className="mt-3">
              {finding.fix}
            </Section>

            {finding.example ? (
              <div className="surface-sunken mt-3 rounded-lg p-3">
                <p className="text-muted mb-2 flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide uppercase">
                  <Lightbulb className="size-3.5" aria-hidden="true" />
                  Пример
                </p>
                <p className="text-secondary text-[0.8125rem] line-through decoration-critical-500/60">
                  {finding.example.before}
                </p>
                <p className="mt-1.5 flex items-start gap-1.5 text-[0.8125rem] font-medium">
                  <ArrowRight
                    className="text-good-500 mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  {finding.example.after}
                </p>
              </div>
            ) : null}

            <SuggestionPanel
              finding={finding}
              document={document}
              seniority={seniority}
              available={enhancementAvailable}
            />

            <div className="text-muted mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem]">
              <span>{DIMENSION_LABELS[finding.dimension]}</span>
              <span aria-hidden="true">·</span>
              <span>&minus;{finding.penalty} баллов</span>
              <span aria-hidden="true">·</span>
              <code className="font-mono">{finding.ruleId}</code>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-muted mb-1 text-[0.6875rem] font-semibold tracking-wide uppercase">
        {title}
      </p>
      <p className="text-[0.8125rem] leading-relaxed">{children}</p>
    </div>
  );
}
