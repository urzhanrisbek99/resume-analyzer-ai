import { toMonthIndex } from '@/shared/lib/dates';
import { excerpt } from '@/shared/lib/text';

import type { SectionKind } from '@/entities/resume/@x/analysis';

import { fail, pass, skip, type Rule, type RuleContext } from '@/entities/analysis/model/types';

/**
 * Structure: are the expected parts present, complete and in a usable order.
 *
 * A recruiter spends six to eight seconds on the first pass. Everything here is
 * about whether that pass finds what it is looking for where it expects it.
 */

function has(context: RuleContext, kind: SectionKind): boolean {
  return context.resume.sections.some(
    (section) => section.kind === kind && section.text.trim().length > 0,
  );
}

/** Page budget by seniority. One page is not a virtue at fifteen years. */
function expectedPages(seniority: string): { min: number; max: number } {
  switch (seniority) {
    case 'junior':
      return { min: 1, max: 1 };
    case 'middle':
      return { min: 1, max: 2 };
    default:
      return { min: 1, max: 3 };
  }
}

export const structureRules: Rule[] = [
  {
    id: 'missing-experience-section',
    dimension: 'structure',
    severity: 'critical',
    penalty: 60,
    title: 'Нет раздела с опытом работы',
    why: 'Опыт — единственный раздел, который читают всегда. Без него резюме не проходит ни автоматический отбор, ни беглый просмотр.',
    fix: 'Добавьте раздел «Опыт работы» с должностями, компаниями, периодами и результатами по каждому месту.',
    evaluate: (context) =>
      has(context, 'experience') || context.resume.experience.length > 0
        ? pass()
        : fail({ detail: 'Раздел с опытом работы не найден.' }),
  },

  {
    id: 'missing-contact-email',
    dimension: 'structure',
    severity: 'critical',
    penalty: 50,
    title: 'Не указана электронная почта',
    why: 'Почта — основной канал связи рекрутера. ATS использует её как уникальный идентификатор кандидата, и без неё анкета часто просто не создаётся.',
    fix: 'Добавьте почту в шапку резюме, видимым текстом. Адрес вида name.surname@gmail.com выглядит профессиональнее корпоративного или шуточного.',
    evaluate: ({ resume }) =>
      resume.contacts.email
        ? pass()
        : fail({ detail: 'Адрес электронной почты в документе не найден.' }),
  },

  {
    id: 'missing-candidate-name',
    dimension: 'structure',
    severity: 'major',
    penalty: 30,
    title: 'Не удалось определить имя кандидата',
    why: 'Имя должно быть самой заметной строкой документа. Если его не находит парсер, анкета в ATS создаётся безымянной, а рекрутер не запомнит, чьё это резюме.',
    fix: 'Поставьте имя и фамилию отдельной строкой в самом верху, крупнее остального текста.',
    evaluate: ({ resume }) =>
      resume.contacts.fullName
        ? pass()
        : fail({ detail: 'В шапке документа не найдено имя, похожее на имя человека.' }),
  },

  {
    id: 'missing-phone',
    dimension: 'structure',
    severity: 'minor',
    penalty: 12,
    title: 'Не указан телефон',
    why: 'Для части вакансий первый контакт — звонок. Отсутствие телефона сужает способы с вами связаться.',
    fix: 'Добавьте номер в международном формате: +7 700 000 00 00.',
    evaluate: ({ resume }) =>
      resume.contacts.phone ? pass() : fail({ detail: 'Номер телефона не найден.' }),
  },

  {
    id: 'missing-professional-links',
    dimension: 'structure',
    severity: 'major',
    penalty: 25,
    title: 'Нет ссылок на профили',
    why: 'Для международных вакансий LinkedIn — фактический стандарт: рекрутер проверяет профиль до звонка. Для инженера GitHub заменяет абзац описаний, показывая код напрямую.',
    fix: 'Добавьте linkedin.com/in/username и github.com/username видимым текстом рядом с контактами.',
    evaluate: ({ resume }) => {
      const kinds = new Set(resume.contacts.links.map((link) => link.kind));
      const hasLinkedIn = kinds.has('linkedin');
      const hasCode = kinds.has('github') || kinds.has('gitlab') || kinds.has('portfolio');

      if (hasLinkedIn && hasCode) return pass();
      if (!hasLinkedIn && !hasCode) {
        return fail({ detail: 'Ни LinkedIn, ни GitHub, ни портфолио не указаны.' });
      }

      return fail({
        severity: 'minor',
        penaltyFactor: 0.5,
        detail: hasLinkedIn
          ? 'Указан LinkedIn, но нет ссылки на код или портфолио.'
          : 'Указан профиль с кодом, но нет LinkedIn.',
      });
    },
  },

  {
    id: 'broken-links',
    dimension: 'structure',
    severity: 'minor',
    penalty: 10,
    title: 'Ссылки нельзя открыть',
    why: 'Профиль, записанный как «@username» или «мой гитхаб», требует от рекрутера догадываться и искать вручную. Обычно он этого не делает.',
    fix: 'Пишите полный адрес: github.com/username вместо @username.',
    evaluate: ({ resume }) => {
      const broken = resume.contacts.links.filter((link) => !link.isResolvable);
      if (resume.contacts.links.length === 0) return skip('Ссылок в резюме нет.');
      return broken.length === 0
        ? pass()
        : fail({
            detail: `Нерабочих ссылок: ${broken.length} (${broken
              .map((l) => l.url)
              .slice(0, 3)
              .join(', ')}).`,
            anchors: broken.slice(0, 3).map((link) => ({ label: link.url })),
          });
    },
  },

  {
    id: 'missing-skills-section',
    dimension: 'structure',
    severity: 'major',
    penalty: 28,
    title: 'Нет раздела с навыками',
    why: 'Отдельный блок навыков — то место, где ATS ищет совпадения с требованиями вакансии. Технологии, упомянутые только внутри описаний работы, находятся хуже и не попадают в сводку по кандидату.',
    fix: 'Добавьте раздел «Навыки», сгруппированный по смыслу: языки, фреймворки, инфраструктура, инструменты.',
    evaluate: (context) =>
      has(context, 'skills')
        ? pass()
        : fail({
            detail:
              context.resume.skills.length > 0
                ? `Отдельного раздела нет, хотя технологии в тексте упоминаются (${context.resume.skills.length}).`
                : 'Раздел с навыками не найден.',
          }),
  },

  {
    id: 'missing-education-section',
    dimension: 'structure',
    severity: 'minor',
    penalty: 12,
    title: 'Нет раздела об образовании',
    why: 'Часть международных компаний и почти все визовые процедуры требуют подтверждённого образования. Пустой раздел вызывает вопрос, которого можно избежать.',
    fix: 'Укажите вуз, специальность и годы. Если образование непрофильное, достаточно одной строки.',
    evaluate: (context) =>
      has(context, 'education') || context.resume.education.length > 0
        ? pass()
        : fail({ detail: 'Раздел об образовании не найден.' }),
  },

  {
    id: 'missing-summary',
    dimension: 'structure',
    severity: 'minor',
    penalty: 10,
    title: 'Нет краткого резюме в начале',
    why: 'Два-три предложения в шапке задают рамку для всего остального: кто вы, сколько лет опыта, в чём сильны. Без них рекрутер собирает эту картину сам и может собрать неверно.',
    fix: 'Добавьте 2–3 строки: специализация, опыт в годах, ключевая экспертиза, чего ищете. Без общих слов.',
    evaluate: (context) =>
      has(context, 'summary') ? pass() : fail({ detail: 'Вводный блок отсутствует.' }),
  },

  {
    id: 'resume-length',
    dimension: 'structure',
    severity: 'minor',
    penalty: 15,
    title: 'Объём резюме не соответствует опыту',
    why: 'Слишком длинное резюме размывает сильные места, слишком короткое выглядит недоработанным. Норма — одна страница до пяти лет опыта, две-три для senior и выше.',
    fix: 'Приведите объём к ожидаемому: уберите места работы старше 10–15 лет и сократите описания ранних позиций до одной строки.',
    evaluate: ({ resume, metrics }) => {
      const pages = resume.layout.pageCount;
      if (pages === 0) return skip('Не удалось определить количество страниц.');

      const { min, max } = expectedPages(metrics.impliedSeniority);
      if (pages >= min && pages <= max) return pass();

      return fail({
        detail:
          pages > max
            ? `Страниц: ${pages}, при вашем уровне (${metrics.impliedSeniority}) ожидается не больше ${max}.`
            : `Страниц: ${pages} — для уровня ${metrics.impliedSeniority} это мало.`,
        penaltyFactor: Math.min(1, Math.abs(pages - max) / 2 || 0.5),
      });
    },
  },

  {
    id: 'reverse-chronological-order',
    dimension: 'structure',
    severity: 'major',
    penalty: 22,
    title: 'Опыт идёт не от нового к старому',
    why: 'Обратный хронологический порядок — стандарт, на который рассчитаны и ATS, и глаз рекрутера. При другом порядке последнее место работы теряется в середине, а именно оно решает.',
    fix: 'Отсортируйте места работы так, чтобы текущее или последнее было первым.',
    evaluate: ({ resume }) => {
      const dated = resume.experience
        .map((item) => item.period)
        .filter((period): period is NonNullable<typeof period> => period?.start != null);

      if (dated.length < 2) return skip('Слишком мало датированных мест работы.');

      const starts = dated.map((period) =>
        period.isCurrent ? Number.MAX_SAFE_INTEGER : toMonthIndex(period.start!),
      );

      const inversions = starts.filter((value, i) => i > 0 && value > (starts[i - 1] ?? 0)).length;
      if (inversions === 0) return pass();

      return fail({
        detail: `Нарушений порядка: ${inversions} из ${starts.length - 1} переходов.`,
        penaltyFactor: Math.min(1, inversions / (starts.length - 1)),
      });
    },
  },

  {
    id: 'experience-without-bullets',
    dimension: 'structure',
    severity: 'major',
    penalty: 25,
    title: 'Опыт описан сплошным текстом',
    why: 'Абзац без списка невозможно просмотреть по диагонали. При шестисекундном первом взгляде рекрутер не найдёт в нём достижений и перейдёт к следующему кандидату.',
    fix: 'Разбейте описание каждой должности на 3–5 пунктов, по одному результату в каждом.',
    evaluate: ({ resume }) => {
      const withExperience = resume.experience.filter((item) => item.bullets.length > 0);
      if (resume.experience.length === 0) return skip('Опыт работы не распознан.');

      const noBullets = resume.experience.length - withExperience.length;
      const markerless = resume.layout.hasTextLayer && !/^\s*[•·◦*-]\s/mu.test(resume.plainText);

      if (noBullets === 0 && !markerless) return pass();

      return fail({
        detail: markerless
          ? 'В документе не найдено ни одного маркированного списка.'
          : `Мест работы без списка достижений: ${noBullets}.`,
        anchors: resume.experience
          .filter((item) => item.bullets.length === 0)
          .slice(0, 3)
          .map((item) => ({ span: item.span, label: item.title ?? item.company ?? undefined })),
      });
    },
  },

  {
    id: 'unparsed-job-headers',
    dimension: 'structure',
    severity: 'minor',
    penalty: 18,
    title: 'Должность и компания читаются неоднозначно',
    why: 'Если разобрать строку заголовка не удаётся автоматически, то же самое произойдёт в ATS: поля «должность» и «компания» заполнятся неверно или останутся пустыми.',
    fix: 'Приведите заголовки к единому виду: «Должность — Компания — Город — Период», каждое место работы одинаково.',
    evaluate: ({ resume }) => {
      if (resume.experience.length === 0) return skip('Опыт работы не распознан.');

      const ambiguous = resume.experience.filter((item) => item.confidence < 0.6);
      if (ambiguous.length === 0) return pass();

      return fail({
        detail: `Мест работы с неоднозначным заголовком: ${ambiguous.length} из ${resume.experience.length}.`,
        anchors: ambiguous.slice(0, 3).map((item) => ({
          span: item.span,
          label: excerpt(
            [item.title, item.company].filter(Boolean).join(' / ') || 'без названия',
            60,
          ),
        })),
        penaltyFactor: ambiguous.length / resume.experience.length,
      });
    },
  },

  {
    id: 'missing-dates-in-experience',
    dimension: 'structure',
    severity: 'major',
    penalty: 30,
    title: 'У мест работы не указаны периоды',
    why: 'Без дат невозможно понять ни длительность опыта, ни его актуальность. Рекрутер трактует пропуск дат как попытку что-то скрыть.',
    fix: 'Укажите месяц и год начала и окончания для каждой позиции: «03.2021 — 08.2023» или «Март 2021 — настоящее время».',
    evaluate: ({ resume }) => {
      if (resume.experience.length === 0) return skip('Опыт работы не распознан.');

      const undated = resume.experience.filter((item) => item.period === null);
      if (undated.length === 0) return pass();

      return fail({
        detail: `Мест работы без периода: ${undated.length} из ${resume.experience.length}.`,
        anchors: undated.slice(0, 3).map((item) => ({
          span: item.span,
          label: item.company ?? item.title ?? undefined,
        })),
        penaltyFactor: undated.length / resume.experience.length,
      });
    },
  },
];
