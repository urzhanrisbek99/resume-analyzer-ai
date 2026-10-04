import { Badge, type Tone } from '@/shared/ui/badge';

import type { CandidateFlag } from '@/entities/candidate';

/**
 * Flag labels, worded as questions rather than verdicts.
 *
 * A gap is something to ask about, not a reason to discard someone. A tool used
 * on forty resumes at a time nudges behaviour at scale, so the wording matters
 * more here than it would in a single-candidate view.
 */
const FLAG_META: Record<CandidateFlag, { label: string; tone: Tone; title: string }> = {
  'ats-unreadable': {
    label: 'плохо читается',
    tone: 'critical',
    title:
      'Документ плохо разбирается автоматически — часть данных может быть потеряна и здесь, и в вашей ATS',
  },
  'missing-contacts': {
    label: 'нет почты',
    tone: 'critical',
    title: 'В резюме не найден адрес электронной почты',
  },
  'employment-gap': {
    label: 'перерыв',
    tone: 'minor',
    title: 'Перерыв в опыте от шести месяцев — стоит уточнить на скрининге',
  },
  'short-tenures': {
    label: 'короткие сроки',
    tone: 'minor',
    title: 'Два и более места работы короче года — возможно, это контракты или проектная занятость',
  },
  'undated-experience': {
    label: 'без дат',
    tone: 'major',
    title: 'У мест работы не указаны периоды, стаж посчитать нельзя',
  },
};

export function CandidateFlags({ flags }: { flags: readonly CandidateFlag[] }) {
  if (flags.length === 0) {
    return <span className="text-muted text-[0.75rem]">—</span>;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => {
        const meta = FLAG_META[flag];
        return (
          <Badge key={flag} tone={meta.tone} title={meta.title}>
            {meta.label}
          </Badge>
        );
      })}
    </span>
  );
}

export function flagTitle(flag: CandidateFlag): string {
  return FLAG_META[flag].title;
}
