import { normalize } from '@/shared/lib/text';

import { fail, pass, skip, type Rule } from '@/entities/analysis/model/types';

/**
 * Keyword and job-description alignment.
 *
 * Every rule here skips when no job advert was supplied: scoring a resume
 * against requirements nobody stated would be inventing a standard. With an ad
 * present, this becomes the dimension a recruiter cares about most, because it
 * answers the only question they have -- does this person match the role.
 */

export const keywordRules: Rule[] = [
  {
    id: 'missing-required-skills',
    dimension: 'keywords',
    severity: 'critical',
    penalty: 45,
    title: 'В резюме нет обязательных навыков из вакансии',
    why: 'Совпадение по обязательным требованиям — первое, что считает ATS, и первое, что проверяет рекрутер. Навык, которым вы владеете, но не назвали, для системы не существует.',
    fix: 'Впишите недостающие технологии теми же словами, что и в вакансии, и подкрепите их пунктом в опыте: где применяли и с каким результатом.',
    evaluate: ({ resume, job }) => {
      if (!job) return skip('Вакансия не указана.');
      if (job.requiredSkills.length === 0)
        return skip('В вакансии не выделены обязательные навыки.');

      const present = new Set(resume.skills.map((skill) => normalize(skill.canonical)));
      const text = normalize(resume.plainText);

      const missing = job.requiredSkills.filter((skill) => {
        const key = normalize(skill);
        return !present.has(key) && !text.includes(key);
      });

      if (missing.length === 0) return pass();

      const share = missing.length / job.requiredSkills.length;
      return fail({
        severity: share > 0.4 ? 'critical' : 'major',
        detail: `Не найдено ${missing.length} из ${job.requiredSkills.length} обязательных: ${missing.slice(0, 8).join(', ')}.`,
        anchors: missing.slice(0, 8).map((skill) => ({ label: skill })),
        penaltyFactor: share,
      });
    },
  },

  {
    id: 'missing-nice-to-have-skills',
    dimension: 'keywords',
    severity: 'info',
    penalty: 10,
    title: 'Не хватает желательных навыков',
    why: 'Отсутствие желательного навыка не отсеивает, но при равных кандидатах решает в пользу того, у кого он есть.',
    fix: 'Если навык у вас есть хотя бы на базовом уровне, укажите его честно, с пометкой об уровне.',
    evaluate: ({ resume, job }) => {
      if (!job) return skip('Вакансия не указана.');
      if (job.niceToHaveSkills.length === 0) return skip('В вакансии нет желательных навыков.');

      const text = normalize(resume.plainText);
      const missing = job.niceToHaveSkills.filter((skill) => !text.includes(normalize(skill)));
      if (missing.length === 0) return pass();

      return fail({
        detail: `Не найдено ${missing.length} из ${job.niceToHaveSkills.length} желательных: ${missing.slice(0, 6).join(', ')}.`,
        penaltyFactor: missing.length / job.niceToHaveSkills.length,
      });
    },
  },

  {
    id: 'title-mismatch',
    dimension: 'keywords',
    severity: 'major',
    penalty: 22,
    title: 'Должность в резюме не перекликается с вакансией',
    why: 'Рекрутер ищет знакомую формулировку. Если вакансия называется Frontend Engineer, а в резюме везде «веб-программист», совпадение приходится домысливать — а на потоке резюме этого не делают.',
    fix: 'Приведите заголовок и последнюю должность к формулировке вакансии, если это правда отражает вашу работу.',
    evaluate: ({ resume, job }) => {
      if (!job?.title) return skip('Вакансия без названия должности.');

      const jobWords = new Set(
        normalize(job.title)
          .split(/\s+/)
          .filter((word) => word.length > 3 && !/^(the|and|for|with|разработчик)$/.test(word)),
      );
      if (jobWords.size === 0) return skip('Название вакансии слишком общее.');

      const candidateText = normalize(
        [
          resume.contacts.headline ?? '',
          ...resume.experience.slice(0, 2).map((item) => item.title ?? ''),
        ].join(' '),
      );

      const overlap = [...jobWords].filter((word) => candidateText.includes(word)).length;
      const ratio = overlap / jobWords.size;
      if (ratio >= 0.5) return pass();

      return fail({
        severity: ratio === 0 ? 'major' : 'minor',
        detail: `Вакансия: «${job.title}». В резюме: «${resume.contacts.headline ?? resume.experience[0]?.title ?? 'не указано'}».`,
        penaltyFactor: 1 - ratio,
      });
    },
  },

  {
    id: 'acronyms-without-expansion',
    dimension: 'keywords',
    severity: 'minor',
    penalty: 10,
    title: 'Аббревиатуры без расшифровки',
    why: 'Поиск в ATS ведётся по точному вхождению. Вакансия может требовать «Continuous Integration», а в резюме стоит только «CI» — совпадения не будет ни в одну сторону.',
    fix: 'Дайте обе формы при первом упоминании: «CI/CD (Continuous Integration и Continuous Delivery)».',
    evaluate: ({ resume, job }) => {
      if (!job) return skip('Вакансия не указана.');

      const resumeText = normalize(resume.plainText);
      const pairs: Array<[string, string]> = [
        ['ci/cd', 'continuous integration'],
        ['tdd', 'test driven development'],
        ['bdd', 'behaviour driven development'],
        ['a11y', 'accessibility'],
        ['k8s', 'kubernetes'],
        ['ml', 'machine learning'],
        ['ux', 'user experience'],
        ['qa', 'quality assurance'],
      ];

      const jobText = normalize(job.plainText);
      const gaps = pairs.filter(([short, long]) => {
        const jobWantsLong = jobText.includes(long);
        const resumeHasShortOnly = resumeText.includes(short) && !resumeText.includes(long);
        return jobWantsLong && resumeHasShortOnly;
      });

      if (gaps.length === 0) return pass();

      return fail({
        detail: `Вакансия использует полные формы, резюме — сокращения: ${gaps.map(([s, l]) => `${s} / ${l}`).join('; ')}.`,
        penaltyFactor: Math.min(1, gaps.length / 3),
      });
    },
  },

  {
    id: 'seniority-below-vacancy',
    dimension: 'keywords',
    severity: 'minor',
    penalty: 15,
    title: 'Уровень в резюме ниже уровня вакансии',
    why: 'Если вакансия на senior, а резюме читается как middle, рекрутер отложит его даже при подходящих навыках. Часто дело не в опыте, а в том, что масштаб работы не показан.',
    fix: 'Покажите senior-признаки: влияние на архитектуру, наставничество, ответственность за решения, работу со смежными командами.',
    evaluate: ({ metrics, job }) => {
      if (!job || job.seniority === 'unknown') return skip('Уровень вакансии не определён.');
      if (metrics.impliedSeniority === 'unknown') return skip('Уровень резюме не определён.');

      const rank: Record<string, number> = { junior: 1, middle: 2, senior: 3, lead: 4 };
      const candidate = rank[metrics.impliedSeniority] ?? 0;
      const required = rank[job.seniority] ?? 0;

      if (candidate >= required) return pass();

      return fail({
        detail: `Вакансия уровня ${job.seniority}, резюме читается как ${metrics.impliedSeniority}.`,
        penaltyFactor: Math.min(1, (required - candidate) / 2),
      });
    },
  },
];
