'use client';

import { CheckCircle2 } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { plural } from '@/shared/lib/plural';
import { Card, CardHeader } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/placeholder';

import { DIMENSION_LABELS, type DimensionId, type Finding } from '@/entities/analysis';
import type { ResumeDocument } from '@/entities/resume';

import { FindingCard } from './finding-card';

export interface FindingsPanelProps {
  findings: readonly Finding[];
  /** Null when nothing is expanded. */
  selectedFindingId: string | null;
  onSelect: (findingId: string | null) => void;
  dimensionFilter: DimensionId | 'all';
  totalFindings: number;
  document: ResumeDocument;
  seniority: 'junior' | 'middle' | 'senior' | 'lead' | 'unknown';
  enhancementAvailable: boolean;
  className?: string;
}

/**
 * The findings list, in engine order: most severe first, then by cost.
 *
 * Ordering is the advice. A candidate with fifteen minutes will fix the first
 * three items and nothing else, so the first three have to be the three that
 * matter most.
 */
export function FindingsPanel({
  findings,
  selectedFindingId,
  onSelect,
  dimensionFilter,
  totalFindings,
  document,
  seniority,
  enhancementAvailable,
  className,
}: FindingsPanelProps) {
  const scopeLabel =
    dimensionFilter === 'all' ? 'Все замечания' : DIMENSION_LABELS[dimensionFilter];

  return (
    <Card className={cn('flex flex-col', className)} padded={false}>
      <div className="px-5 pt-5">
        <CardHeader
          as="h2"
          title={scopeLabel}
          description={
            findings.length === totalFindings
              ? `${findings.length} ${plural(findings.length, 'замечание', 'замечания', 'замечаний')}`
              : `${findings.length} из ${totalFindings}`
          }
        />
      </div>

      {findings.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="text-good-500 size-8" aria-hidden="true" />}
          title={
            dimensionFilter === 'all' ? 'Замечаний нет' : `В разделе «${scopeLabel}» всё в порядке`
          }
          description={
            dimensionFilter === 'all'
              ? 'Резюме прошло все проверки движка.'
              : 'Выберите другое измерение, чтобы посмотреть остальные замечания.'
          }
        />
      ) : (
        <ol className="flex flex-col gap-2 p-5 pt-4">
          {findings.map((finding) => (
            <li key={finding.id}>
              <FindingCard
                finding={finding}
                expanded={selectedFindingId === finding.id}
                onToggle={() => onSelect(selectedFindingId === finding.id ? null : finding.id)}
                document={document}
                seniority={seniority}
                enhancementAvailable={enhancementAvailable}
              />
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
