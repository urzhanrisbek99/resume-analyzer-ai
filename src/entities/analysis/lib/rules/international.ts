import { wordPattern } from '@/shared/lib/text';

import type { SensitiveField } from '@/entities/resume/@x/analysis';

import { fail, pass, skip, type Rule } from '@/entities/analysis/model/types';

/**
 * Readiness for a foreign employer.
 *
 * Everything in this dimension is a difference in local convention, not a
 * mistake. A photo and a date of birth are standard on a CV here and a reason
 * for rejection in the US, UK, Canada and much of the EU, where recruiters are
 * instructed to discard resumes carrying protected characteristics to avoid
 * discrimination claims. The findings explain that difference rather than
 * implying the candidate did something wrong.
 */

const SENSITIVE_LABELS: Record<SensitiveField, string> = {
  photo: 'фотография',
  birthDate: 'дата рождения',
  age: 'возраст',
  maritalStatus: 'семейное положение',
  gender: 'пол',
  nationality: 'гражданство или национальность',
  religion: 'вероисповедание',
  idNumber: 'номер документа (ИИН, паспорт)',
  fullHomeAddress: 'полный домашний адрес',
  salaryExpectation: 'зарплатные ожидания',
};

const WORK_AUTHORIZATION_RE = wordPattern([
  'relocation',
  'relocate',
  'remote',
  'visa',
  'work permit',
  'sponsorship',
  'eligible to work',
  'релокация',
  'релокации',
  'переезд',
  'удаленно',
  'удалённо',
  'виза',
]);

const LOCAL_LEGAL_FORM_RE = wordPattern(['тоо', 'ооо', 'ао', 'зао', 'ип', 'ргп', 'гу']);

const INDUSTRY_RE = wordPattern([
  'bank',
  'fintech',
  'retail',
  'telecom',
  'marketplace',
  'logistics',
  'банк',
  'финтех',
  'ритейл',
  'телеком',
  'маркетплейс',
  'логистик',
]);

/** Fields that most often cause an automatic discard abroad. */
const HIGH_RISK: SensitiveField[] = [
  'photo',
  'birthDate',
  'age',
  'maritalStatus',
  'gender',
  'religion',
];

export const internationalRules: Rule[] = [
  {
    id: 'protected-personal-data',
    dimension: 'international',
    severity: 'major',
    penalty: 35,
    title: 'Персональные данные, которые за рубежом лучше убрать',
    why: 'В США, Великобритании, Канаде и большинстве стран ЕС рекрутеру предписано не рассматривать резюме с фотографией, возрастом, полом или семейным положением: это защищённые признаки, и их наличие создаёт для компании риск иска о дискриминации. Резюме отклоняют, не читая.',
    fix: 'Уберите фото, дату рождения, возраст, пол, семейное положение и номера документов. Оставьте имя, город, почту, телефон и ссылки.',
    evaluate: ({ resume }) => {
      const fields = resume.contacts.sensitiveFields;
      if (fields.length === 0) return pass();

      const highRisk = fields.filter((field) => HIGH_RISK.includes(field));
      const labels = fields.map((field) => SENSITIVE_LABELS[field]).join(', ');

      return fail({
        severity: highRisk.length > 0 ? 'major' : 'minor',
        detail: `Найдено: ${labels}.`,
        penaltyFactor: Math.min(1, (highRisk.length * 2 + fields.length) / 6),
      });
    },
  },

  {
    id: 'salary-expectations-stated',
    dimension: 'international',
    severity: 'minor',
    penalty: 15,
    title: 'В резюме указаны зарплатные ожидания',
    why: 'Названная цифра работает против вас с обеих сторон: занизили — столько и предложат, завысили — отсеют до разговора. На международном рынке вопрос компенсации поднимают после того, как интерес взаимный.',
    fix: 'Уберите сумму из резюме. Обсуждайте её на скрининге, когда уже известен грейд и объём задач.',
    evaluate: ({ resume }) =>
      resume.contacts.sensitiveFields.includes('salaryExpectation')
        ? fail({ detail: 'В тексте найдено упоминание желаемой зарплаты.' })
        : pass(),
  },

  {
    id: 'english-level-not-stated',
    dimension: 'international',
    severity: 'major',
    penalty: 25,
    title: 'Не указан уровень английского',
    why: 'Для международной вакансии английский — первый отсекающий фильтр. Если уровень не назван, рекрутер предполагает низкий: проверять он не будет, кандидатов много.',
    fix: 'Добавьте раздел «Языки» с уровнем по шкале CEFR: English — C1, Russian — native. Если есть сертификат IELTS или TOEFL, укажите балл.',
    evaluate: ({ resume }) => {
      const english = resume.languages.find((entry) => entry.language === 'English');
      if (english?.level) return pass();

      // A resume written entirely in English demonstrates the level itself.
      if (resume.language.primary === 'en') {
        return english
          ? fail({
              severity: 'minor',
              penaltyFactor: 0.4,
              detail: 'Английский упомянут, но без уровня.',
            })
          : skip('Резюме написано на английском — уровень виден из самого текста.');
      }

      return fail({
        detail: english
          ? 'Английский упомянут, но уровень не указан.'
          : 'Уровень английского в резюме не найден.',
      });
    },
  },

  {
    id: 'no-work-authorization-note',
    dimension: 'international',
    severity: 'minor',
    penalty: 12,
    title: 'Не указана готовность к переезду или удалённой работе',
    why: 'Рекрутер за рубежом обязан понимать, нужна ли вам виза и спонсорство. Без этой строки часть компаний не станет тратить время на выяснение и перейдёт к следующему кандидату.',
    fix: 'Одна строка рядом с контактами: «Open to relocation» или «Remote (UTC+5), открыт к релокации при спонсорстве визы».',
    evaluate: ({ resume }) => {
      const hasNote = WORK_AUTHORIZATION_RE.test(resume.plainText);
      return hasNote
        ? pass()
        : fail({ detail: 'Упоминаний релокации, визы или удалённой работы нет.' });
    },
  },

  {
    id: 'local-only-context',
    dimension: 'international',
    severity: 'minor',
    penalty: 12,
    title: 'Контекст понятен только местному читателю',
    why: 'Названия локальных компаний, вузов и систем зарубежному рекрутеру ничего не говорят. «Крупнейший банк Казахстана» и «ТОО Альфа» — разные по информативности строки.',
    fix: 'Добавляйте одну поясняющую фразу: отрасль, масштаб, известный аналог. «Kaspi.kz — финтех-платформа, 14 млн пользователей».',
    evaluate: ({ resume }) => {
      if (resume.experience.length === 0) return skip('Опыт работы не распознан.');

      const localMarkers = LOCAL_LEGAL_FORM_RE;
      const unexplained = resume.experience.filter((item) => {
        if (!item.company) return false;
        if (!localMarkers.test(item.company)) return false;
        // A description that mentions scale or industry counts as explained.
        return !item.bullets.some(
          (bullet) => /\d/u.test(bullet.text) || INDUSTRY_RE.test(bullet.text),
        );
      });

      if (unexplained.length === 0) return pass();

      return fail({
        detail: `Мест работы без пояснения масштаба или отрасли: ${unexplained.length}.`,
        anchors: unexplained.slice(0, 3).map((item) => ({
          span: item.span,
          label: item.company ?? undefined,
        })),
        penaltyFactor: unexplained.length / resume.experience.length,
      });
    },
  },

  {
    id: 'non-latin-name-only',
    dimension: 'international',
    severity: 'info',
    penalty: 8,
    title: 'Имя написано только кириллицей',
    why: 'Рекрутер за рубежом не прочитает кириллицу и не сможет найти вас в LinkedIn или упомянуть в переписке с нанимающим менеджером.',
    fix: 'В англоязычной версии резюме пишите имя латиницей — так же, как в загранпаспорте.',
    evaluate: ({ resume }) => {
      const name = resume.contacts.fullName;
      if (!name) return skip('Имя не распознано.');
      if (resume.language.primary === 'ru') return skip('Резюме на русском языке.');

      return /\p{Script=Cyrillic}/u.test(name)
        ? fail({ detail: `Имя в англоязычном резюме записано кириллицей: «${name}».` })
        : pass();
    },
  },
];
