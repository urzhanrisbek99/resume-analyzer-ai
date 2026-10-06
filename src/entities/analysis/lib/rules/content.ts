import { excerpt, normalize, wordPattern } from '@/shared/lib/text';

import { fail, pass, skip, type Rule, type RuleFinding } from '@/entities/analysis/model/types';

import { hasWeakOpening, isQuantified, startsWithActionVerb } from '../metrics';

/** Unicode boundaries: `\b` never matches next to a Cyrillic letter. */
const FIRST_PERSON_HINT = wordPattern(['я', 'мы', 'мой', 'моя', 'мои', 'i', 'my', 'we']);

/**
 * Content: does the resume show impact, or list duties.
 *
 * This is the dimension that separates a resume that gets interviews from one
 * that gets filed. Everything here is measurable -- a bullet either carries a
 * number or it does not -- and every finding points at specific text, because
 * "make it stronger" is advice nobody can act on.
 */

/** Below this share of quantified bullets a resume reads as a job description. */
const QUANTIFIED_TARGET = 0.5;
const ACTION_VERB_TARGET = 0.7;
/** Occurrences beyond this, with no supporting context, read as stuffing. */
const STUFFING_THRESHOLD = 6;
const MAX_EXAMPLES = 4;

export const contentRules: Rule[] = [
  {
    id: 'no-achievements-found',
    dimension: 'content',
    severity: 'critical',
    penalty: 100,
    title: 'Из резюме не удалось извлечь ни одного достижения',
    why: 'Содержание — то, по чему принимают решение. Если достижения не читаются автоматически, их не прочитает и система отбора: в анкете кандидата останется пустое поле, а рекрутеру будет не на что смотреть.',
    fix: 'Опишите каждое место работы списком из 3–5 пунктов: что сделали и что изменилось. Укажите периоды работы — без них разбор не находит границ между местами.',
    evaluate: ({ resume, metrics }) => {
      if (metrics.bullets.total > 0) return pass();

      /*
       * Scored, never skipped. Skipping would leave the content dimension with
       * almost no rules running and a near-perfect score -- an empty resume
       * outscoring a good one, because there was nothing in it to criticise.
       */
      return fail({
        detail:
          resume.experience.length === 0
            ? 'Места работы не распознаны, достижений нет.'
            : `Мест работы: ${resume.experience.length}, но ни одного описанного результата.`,
      });
    },
  },

  {
    id: 'bullets-not-quantified',
    dimension: 'content',
    severity: 'critical',
    penalty: 40,
    title: 'В достижениях нет цифр',
    why: 'Без числа утверждение невозможно проверить и не с чем сравнить. «Ускорил загрузку страницы» и «Ускорил загрузку с 4,2 с до 1,1 с» описывают одну работу, но второе рекрутер запомнит, а первое пролистает.',
    fix: 'Добавьте измеримый результат хотя бы в половину пунктов: проценты, деньги, время, объём, размер команды, количество пользователей. Если точных цифр нет, дайте порядок величины — «сотни тысяч запросов в сутки».',
    evaluate: ({ resume, metrics }) => {
      const { total, quantified } = metrics.bullets;
      if (total === 0) return skip('Достижения не распознаны.');

      const share = quantified / total;
      if (share >= QUANTIFIED_TARGET) return pass();

      const unquantified = resume.experience
        .flatMap((item) => item.bullets)
        .filter((bullet) => !isQuantified(bullet.text))
        .slice(0, MAX_EXAMPLES);

      return fail({
        severity: share < 0.2 ? 'critical' : 'major',
        detail: `С цифрами ${quantified} из ${total} пунктов (${Math.round(share * 100)}%). Ориентир — не меньше ${QUANTIFIED_TARGET * 100}%.`,
        anchors: unquantified.map((bullet) => ({
          span: bullet.span,
          label: excerpt(bullet.text, 70),
        })),
        example: {
          before: 'Оптимизировал производительность фронтенда',
          after: 'Сократил Largest Contentful Paint с 4,2 с до 1,1 с, конверсия выросла на 12%',
        },
        penaltyFactor: Math.min(1, (QUANTIFIED_TARGET - share) / QUANTIFIED_TARGET),
      });
    },
  },

  {
    id: 'weak-bullet-openings',
    dimension: 'content',
    severity: 'major',
    penalty: 30,
    title: 'Пункты начинаются с обязанностей, а не с результата',
    why: '«Отвечал за», «занимался», «участвовал в» описывают должностную инструкцию, а не вашу работу. Рекрутер по ним не может понять, что изменилось благодаря вам и справились ли вы.',
    fix: 'Начинайте с глагола совершённого действия: разработал, сократил, запустил, внедрил, автоматизировал. Дальше — что именно и с каким результатом.',
    evaluate: ({ resume, metrics }) => {
      const { total, weakOpening } = metrics.bullets;
      if (total === 0) return skip('Достижения не распознаны.');
      if (weakOpening === 0) return pass();

      const examples = resume.experience
        .flatMap((item) => item.bullets)
        .filter((bullet) => hasWeakOpening(bullet.text))
        .slice(0, MAX_EXAMPLES);

      return fail({
        detail: `Пунктов со слабым началом: ${weakOpening} из ${total}.`,
        anchors: examples.map((bullet) => ({
          span: bullet.span,
          label: excerpt(bullet.text, 70),
        })),
        example: {
          before: 'Отвечал за поддержку платёжного модуля',
          after: 'Снизил долю неуспешных платежей с 3,4% до 0,8%, переписав обработку ретраев',
        },
        penaltyFactor: Math.min(1, weakOpening / total / 0.4),
      });
    },
  },

  {
    id: 'missing-action-verbs',
    dimension: 'content',
    severity: 'major',
    penalty: 22,
    title: 'Мало глаголов действия в начале пунктов',
    why: 'Глагол в начале строки задаёт ритм при беглом чтении: взгляд скользит по левому краю и сразу собирает картину сделанного. Пункты, начинающиеся с существительного или предлога, этот ритм ломают.',
    fix: 'Переставьте так, чтобы каждый пункт открывался глаголом: не «Внедрение CI/CD», а «Внедрил CI/CD».',
    evaluate: ({ resume, metrics }) => {
      const { total, actionVerbLed } = metrics.bullets;
      if (total < 3) return skip('Слишком мало пунктов для оценки.');

      const share = actionVerbLed / total;
      if (share >= ACTION_VERB_TARGET) return pass();

      const examples = resume.experience
        .flatMap((item) => item.bullets)
        .filter((bullet) => !startsWithActionVerb(bullet.text) && !hasWeakOpening(bullet.text))
        .slice(0, MAX_EXAMPLES);

      return fail({
        detail: `С глагола действия начинаются ${actionVerbLed} из ${total} пунктов (${Math.round(share * 100)}%).`,
        anchors: examples.map((bullet) => ({
          span: bullet.span,
          label: excerpt(bullet.text, 70),
        })),
        penaltyFactor: Math.min(1, (ACTION_VERB_TARGET - share) / ACTION_VERB_TARGET),
      });
    },
  },

  {
    id: 'first-person-narration',
    dimension: 'content',
    severity: 'minor',
    penalty: 14,
    title: 'Повествование от первого лица',
    why: 'Резюме и так читается от вашего лица — местоимения только занимают место. «Мы» вдобавок размывает вклад: непонятно, что сделали вы, а что команда.',
    fix: 'Уберите «я», «мой», «мы». «Я разработал сервис» → «Разработал сервис».',
    evaluate: ({ resume, metrics }) => {
      const { total, firstPerson } = metrics.bullets;
      if (total === 0) return skip('Достижения не распознаны.');
      if (firstPerson === 0) return pass();

      const examples = resume.experience
        .flatMap((item) => item.bullets)
        .filter((bullet) => FIRST_PERSON_HINT.test(bullet.text))
        .slice(0, 3);

      return fail({
        detail: `Пунктов от первого лица: ${firstPerson} из ${total}.`,
        anchors: examples.map((bullet) => ({
          span: bullet.span,
          label: excerpt(bullet.text, 70),
        })),
        penaltyFactor: Math.min(1, firstPerson / total / 0.3),
      });
    },
  },

  {
    id: 'passive-voice',
    dimension: 'content',
    severity: 'minor',
    penalty: 14,
    title: 'Пассивные конструкции',
    why: 'Пассив прячет исполнителя. «Была внедрена система мониторинга» не говорит, внедрили её вы или кто-то другой, а рекрутер по умолчанию предполагает второе.',
    fix: 'Перепишите в активный залог: «Была внедрена система мониторинга» → «Внедрил систему мониторинга».',
    evaluate: ({ metrics }) => {
      const { total, passive } = metrics.bullets;
      if (total === 0) return skip('Достижения не распознаны.');
      if (passive / total < 0.2) return pass();

      return fail({
        detail: `Пунктов в пассивном залоге: ${passive} из ${total}.`,
        penaltyFactor: Math.min(1, passive / total / 0.5),
      });
    },
  },

  {
    id: 'overlong-bullets',
    dimension: 'content',
    severity: 'minor',
    penalty: 16,
    title: 'Слишком длинные пункты',
    why: 'Пункт длиннее двух строк перестаёт быть пунктом и становится абзацем — его пропускают при беглом просмотре, а именно так читают первый раз.',
    fix: 'Держите пункт в пределах 1–2 строк. Длинный разбейте на два: отдельно что сделали, отдельно какой был результат.',
    evaluate: ({ resume, metrics }) => {
      const { total, overlong } = metrics.bullets;
      if (total === 0) return skip('Достижения не распознаны.');
      if (overlong === 0) return pass();

      const examples = resume.experience
        .flatMap((item) => item.bullets)
        .filter((bullet) => bullet.text.split(/\s+/).length > 34)
        .slice(0, 3);

      return fail({
        detail: `Пунктов длиннее 34 слов: ${overlong} из ${total}. Средняя длина — ${metrics.bullets.averageWords} слов.`,
        anchors: examples.map((bullet) => ({
          span: bullet.span,
          label: excerpt(bullet.text, 80),
        })),
        penaltyFactor: Math.min(1, overlong / total / 0.3),
      });
    },
  },

  {
    id: 'stub-bullets',
    dimension: 'content',
    severity: 'minor',
    penalty: 12,
    title: 'Пункты без содержания',
    why: 'Строка из двух слов — «Работа с API», «Code review» — не сообщает ни масштаба, ни результата, но занимает место, которое могло бы работать на вас.',
    fix: 'Либо разверните до полноценного достижения с результатом, либо уберите и перенесите технологию в раздел навыков.',
    evaluate: ({ resume, metrics }) => {
      const { total, stub } = metrics.bullets;
      if (total === 0) return skip('Достижения не распознаны.');
      if (stub === 0) return pass();

      const examples = resume.experience
        .flatMap((item) => item.bullets)
        .filter((bullet) => bullet.text.split(/\s+/).length < 4)
        .slice(0, 3);

      return fail({
        detail: `Пунктов короче четырёх слов: ${stub}.`,
        anchors: examples.map((bullet) => ({ span: bullet.span, label: excerpt(bullet.text, 50) })),
        penaltyFactor: Math.min(1, stub / total / 0.25),
      });
    },
  },

  {
    id: 'cliches',
    dimension: 'content',
    severity: 'major',
    penalty: 20,
    title: 'Шаблонные формулировки',
    why: '«Ответственный», «стрессоустойчивый», «нацелен на результат» встречаются в каждом втором резюме и не несут информации: проверить их нельзя, отличить вас по ним невозможно.',
    fix: 'Замените качество фактом, который его доказывает. Вместо «умею работать в команде» — «Провёл 200+ код-ревью и ввёл в проект четырёх новых разработчиков».',
    evaluate: ({ metrics }) => {
      const hits = metrics.clicheHits;
      if (hits.length === 0) return pass();

      return fail({
        detail: `Найдено штампов: ${hits.length} — ${hits
          .slice(0, 5)
          .map((h) => `«${h.phrase}»`)
          .join(', ')}.`,
        anchors: hits.slice(0, MAX_EXAMPLES).map((hit) => ({
          span: hit.span,
          label: hit.phrase,
        })),
        example: {
          before: 'Ответственный, стрессоустойчивый, умею работать в команде',
          after: 'Вёл релизы для 12 команд; за два года ни одного отката в продакшене',
        },
        penaltyFactor: Math.min(1, hits.length / 5),
      });
    },
  },

  {
    id: 'thin-experience-descriptions',
    dimension: 'content',
    severity: 'major',
    penalty: 20,
    title: 'Опыт описан слишком скупо',
    why: 'Одна строка на место работы не даёт рекрутеру понять масштаб задач. При прочих равных выберут кандидата, у которого видно, что именно он делал.',
    fix: 'На каждое значимое место работы — 3–5 пунктов. Для позиций старше 10 лет достаточно одной строки, для последних двух мест нужно больше.',
    evaluate: ({ resume }) => {
      if (resume.experience.length === 0) return skip('Опыт работы не распознан.');

      // Only the two most recent roles carry this expectation.
      const recent = resume.experience.slice(0, 2);
      const thin = recent.filter((item) => item.bullets.length > 0 && item.bullets.length < 3);
      if (thin.length === 0) return pass();

      return fail({
        detail: `Мест работы с одним-двумя пунктами среди последних: ${thin.length}.`,
        anchors: thin.map((item) => ({
          span: item.span,
          label: item.title ?? item.company ?? undefined,
        })),
        penaltyFactor: thin.length / recent.length,
      });
    },
  },

  {
    id: 'generic-summary',
    dimension: 'content',
    severity: 'minor',
    penalty: 15,
    title: 'Вводный блок ни о чём',
    why: 'Если из summary убрать название профессии и он подойдёт любому кандидату, он не работает. Это самое дорогое место в резюме — первые прочитанные строки.',
    fix: 'Три факта: специализация и стаж, самое сильное достижение с цифрой, чего ищете. Без прилагательных.',
    evaluate: ({ resume, metrics }) => {
      const summary = resume.sections.find((section) => section.kind === 'summary');
      if (!summary || summary.text.trim().length === 0) return skip('Вводного блока нет.');

      const words = summary.text.split(/\s+/).length;
      const hasNumbers = /\d/.test(summary.text);
      const clichesInside = metrics.clicheHits.filter(
        (hit) => hit.span.start >= summary.span.start && hit.span.end <= summary.span.end,
      );

      const problems: string[] = [];
      if (!hasNumbers) problems.push('нет ни одной цифры');
      if (clichesInside.length > 0) problems.push(`штампов: ${clichesInside.length}`);
      if (words > 90) problems.push(`слишком длинный (${words} слов)`);
      if (words < 12) problems.push(`слишком короткий (${words} слов)`);

      if (problems.length === 0) return pass();

      const finding: RuleFinding = {
        detail: `Вводный блок: ${problems.join(', ')}.`,
        anchors: [{ span: summary.span, sectionId: summary.id }],
        penaltyFactor: Math.min(1, problems.length / 2),
        example: {
          before: 'Опытный и ответственный разработчик, нацеленный на результат',
          after:
            'Frontend-инженер, 7 лет. Вывел платформу с 200k MAU на Next.js, сократив time to interactive вдвое. Ищу senior-роль в продуктовой команде.',
        },
      };
      return fail(finding);
    },
  },

  {
    id: 'skills-dumped',
    dimension: 'content',
    severity: 'minor',
    penalty: 12,
    title: 'Навыки свалены в одну кучу',
    why: 'Список из шестидесяти технологий подряд не читается и вызывает недоверие: владеть всеми на рабочем уровне невозможно. Рекрутер не находит в нём то, что ищет.',
    fix: 'Сгруппируйте по категориям и оставьте то, о чём готовы говорить на интервью. 15–25 позиций достаточно.',
    evaluate: ({ resume, metrics }) => {
      const section = resume.sections.find((s) => s.kind === 'skills');
      if (!section) return skip('Раздела с навыками нет.');
      if (metrics.skillCount <= 30) return pass();

      return fail({
        detail: `Навыков перечислено: ${metrics.skillCount}.`,
        anchors: [{ span: section.span, sectionId: section.id }],
        penaltyFactor: Math.min(1, (metrics.skillCount - 30) / 30),
      });
    },
  },
  {
    id: 'keyword-stuffing',
    dimension: 'content',
    severity: 'major',
    penalty: 25,
    title: 'Ключевые слова повторяются неестественно часто',
    why: 'Современные ATS помечают аномальную плотность ключевых слов, а рекрутер видит её сразу. Попытка обмануть фильтр обходится дороже, чем пропущенный навык.',
    fix: 'Упомяните технологию один раз в навыках и по одному разу там, где действительно её применяли.',
    evaluate: ({ resume }) => {
      const text = normalize(resume.plainText);
      const stuffed: Array<{ skill: string; count: number }> = [];

      for (const skill of resume.skills) {
        const key = normalize(skill.canonical);
        if (key.length < 3) continue;

        const matches = text.split(key).length - 1;
        if (matches > STUFFING_THRESHOLD) stuffed.push({ skill: skill.canonical, count: matches });
      }

      if (stuffed.length === 0) return pass();

      stuffed.sort((a, b) => b.count - a.count);
      return fail({
        detail: `Повторяются подозрительно часто: ${stuffed
          .slice(0, 4)
          .map((entry) => `${entry.skill} — ${entry.count} раз`)
          .join(', ')}.`,
        anchors: stuffed.slice(0, 4).map((entry) => ({ label: entry.skill })),
        penaltyFactor: Math.min(1, stuffed.length / 3),
      });
    },
  },
];
