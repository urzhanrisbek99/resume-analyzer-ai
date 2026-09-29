import { formatMonths, nowYearMonth, toMonthIndex } from '@/shared/lib/dates';

import { fail, pass, skip, type Rule } from '@/entities/analysis/model/types';

import { SHORT_STINT_MONTHS } from '../metrics';

/**
 * Narrative: does the career story hold together.
 *
 * These rules are advisory by design. A gap can be parental leave, illness or a
 * deliberate sabbatical, and none of that is a defect -- but an *unexplained*
 * gap is a question the recruiter answers themselves, usually unkindly. The
 * findings say so plainly instead of implying the candidate did something wrong.
 */

/** Gaps shorter than this are normal between jobs and are not reported. */
const REPORTABLE_GAP_MONTHS = 6;
const STALE_RESUME_MONTHS = 8;

export const narrativeRules: Rule[] = [
  {
    id: 'unexplained-employment-gaps',
    dimension: 'narrative',
    severity: 'major',
    penalty: 22,
    title: 'Необъяснённые перерывы в опыте',
    why: 'Рекрутер всё равно заметит разрыв в датах и достроит объяснение сам. Одна строка снимает вопрос до того, как он возник; молчание оставляет его открытым.',
    fix: 'Добавьте строку о перерыве: обучение, декрет, переезд, собственный проект, уход за близким. Формулировка «2023–2024 — учебный перерыв, курс по системному дизайну» закрывает тему.',
    evaluate: ({ metrics }) => {
      const gaps = metrics.tenure.gaps.filter((gap) => gap.months >= REPORTABLE_GAP_MONTHS);
      if (metrics.tenure.jobCount < 2) return skip('Недостаточно мест работы для оценки.');
      if (gaps.length === 0) return pass();

      const longest = Math.max(...gaps.map((gap) => gap.months));

      return fail({
        severity: longest >= 18 ? 'major' : 'minor',
        detail: `Перерывов длиннее ${REPORTABLE_GAP_MONTHS} месяцев: ${gaps.length}. Самый длинный — ${formatMonths(longest)}.`,
        penaltyFactor: Math.min(1, longest / 24),
      });
    },
  },

  {
    id: 'frequent-job-changes',
    dimension: 'narrative',
    severity: 'minor',
    penalty: 18,
    title: 'Частая смена работы',
    why: 'Несколько мест короче года подряд заставляют нанимающего менеджера считать стоимость вашего найма против вероятного срока работы. Для senior-позиций это учитывается особенно внимательно.',
    fix: 'Если короткие периоды объяснимы — контракт, закрытие компании, проектная работа — напишите это прямо в строке места работы.',
    evaluate: ({ metrics }) => {
      const { jobCount, shortStints } = metrics.tenure;
      if (jobCount < 3) return skip('Недостаточно мест работы для оценки.');
      if (shortStints < 2) return pass();

      return fail({
        detail: `Мест работы короче ${SHORT_STINT_MONTHS} месяцев: ${shortStints} из ${jobCount}. Средний срок — ${formatMonths(metrics.tenure.averageMonths)}.`,
        penaltyFactor: Math.min(1, shortStints / jobCount / 0.5),
      });
    },
  },

  {
    id: 'seniority-mismatch',
    dimension: 'narrative',
    severity: 'minor',
    penalty: 16,
    title: 'Должность не соответствует стажу',
    why: 'Заявленный senior при двух годах опыта вызывает у рекрутера сомнение в остальном резюме. Обратная ситуация — десять лет опыта без роста в должности — тоже требует объяснения.',
    fix: 'Если рост был внутри одной компании без смены тайтла, опишите расширение зоны ответственности отдельными пунктами.',
    evaluate: ({ metrics }) => {
      const years = metrics.tenure.totalMonths / 12;
      if (years === 0) return skip('Периоды работы не распознаны.');

      const claimed = metrics.impliedSeniority;
      if (claimed === 'unknown') return skip('Уровень по должностям не определяется.');

      if ((claimed === 'senior' || claimed === 'lead') && years < 4) {
        return fail({
          detail: `Уровень в должностях — ${claimed}, при этом суммарный стаж ${formatMonths(metrics.tenure.totalMonths)}.`,
        });
      }

      if (claimed === 'junior' && years > 5) {
        return fail({
          severity: 'info',
          penaltyFactor: 0.5,
          detail: `Стаж ${formatMonths(metrics.tenure.totalMonths)}, но должности остаются на junior-уровне.`,
        });
      }

      return pass();
    },
  },

  {
    id: 'no-career-progression',
    dimension: 'narrative',
    severity: 'info',
    penalty: 10,
    title: 'Не видно карьерного роста',
    why: 'Рост в должностях — самый быстрый способ показать, что вам доверяли больше со временем. Его отсутствие не ошибка, но и не работает на вас.',
    fix: 'Отразите расширение ответственности: количество людей в подчинении, масштаб систем, переход от задач к их постановке.',
    evaluate: ({ metrics }) => {
      const { progression, jobCount } = metrics.tenure;
      if (jobCount < 3) return skip('Недостаточно мест работы для оценки.');
      if (progression === 'up' || progression === 'unclear') return pass();

      return fail({
        detail:
          progression === 'down'
            ? 'Должности со временем понижаются — это стоит объяснить.'
            : 'Должности не меняются на протяжении всей карьеры.',
        severity: progression === 'down' ? 'minor' : 'info',
      });
    },
  },

  {
    id: 'stale-resume',
    dimension: 'narrative',
    severity: 'minor',
    penalty: 15,
    title: 'Резюме давно не обновлялось',
    why: 'Последнее место работы, закончившееся год назад и без пометки о текущей занятости, читается как длительный перерыв.',
    fix: 'Отметьте текущую работу как «настоящее время» или добавьте строку о том, чем заняты сейчас.',
    evaluate: ({ resume }) => {
      const periods = resume.experience
        .map((item) => item.period)
        .filter((period): period is NonNullable<typeof period> => period !== null);

      if (periods.length === 0) return skip('Периоды работы не распознаны.');
      if (periods.some((period) => period.isCurrent)) return pass();

      const latest = periods
        .map((period) => (period.end ? toMonthIndex(period.end) : null))
        .filter((value): value is number => value !== null)
        .sort((a, b) => b - a)[0];

      if (latest === undefined) return skip('Даты окончания не распознаны.');

      const monthsSince = toMonthIndex(nowYearMonth()) - latest;
      if (monthsSince < STALE_RESUME_MONTHS) return pass();

      return fail({
        detail: `С последнего указанного места работы прошло ${formatMonths(monthsSince)}, текущая занятость не отмечена.`,
        penaltyFactor: Math.min(1, monthsSince / 24),
      });
    },
  },

  {
    id: 'no-recent-achievements',
    dimension: 'narrative',
    severity: 'minor',
    penalty: 14,
    title: 'Самое свежее место работы описано слабее прежних',
    why: 'Рекрутер читает первую позицию внимательнее всех остальных вместе взятых. Если там меньше конкретики, чем в работе пятилетней давности, впечатление складывается не в вашу пользу.',
    fix: 'Перенесите фокус на последнее место: больше пунктов, больше цифр. Старые позиции можно сократить.',
    evaluate: ({ resume }) => {
      if (resume.experience.length < 2) return skip('Недостаточно мест работы для сравнения.');

      const [newest, ...rest] = resume.experience;
      if (!newest || newest.bullets.length === 0) return skip('Последнее место без описания.');

      const olderAverage =
        rest.reduce((sum, item) => sum + item.bullets.length, 0) / Math.max(1, rest.length);

      if (newest.bullets.length >= olderAverage) return pass();

      return fail({
        detail: `В последнем месте работы ${newest.bullets.length} пунктов, в более ранних в среднем ${olderAverage.toFixed(1)}.`,
        anchors: [{ span: newest.span, label: newest.title ?? newest.company ?? undefined }],
        penaltyFactor: Math.min(1, 1 - newest.bullets.length / Math.max(1, olderAverage)),
      });
    },
  },
];
