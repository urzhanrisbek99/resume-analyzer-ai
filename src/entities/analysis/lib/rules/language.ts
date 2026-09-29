import { excerpt } from '@/shared/lib/text';

import { fail, pass, skip, type Rule } from '@/entities/analysis/model/types';

/**
 * Language and mechanics.
 *
 * Small things, individually. Together they are what makes a resume read as
 * careful or as rushed, and a recruiter forms that impression in the first few
 * seconds -- before reading a single achievement.
 */

const MAX_AVERAGE_SENTENCE_WORDS = 24;

const DATE_FORMAT_LABELS: Record<string, string> = {
  'month-name-year': 'Март 2021',
  'numeric-month-year': '03/2021',
  'year-only': '2021',
  iso: '2021-03',
};

export const languageRules: Rule[] = [
  {
    id: 'inconsistent-date-formats',
    dimension: 'language',
    severity: 'minor',
    penalty: 16,
    title: 'Даты записаны по-разному',
    why: 'Разнобой в форматах дат сбивает и парсер, и читателя: часть периодов ATS распознает, часть потеряет. Для рекрутера это первый признак, что резюме собирали наспех.',
    fix: 'Выберите один формат и примените ко всем датам — и в опыте, и в образовании.',
    evaluate: ({ metrics }) => {
      const formats = metrics.consistency.dateFormats;
      if (formats.length <= 1) return pass();

      const examples = formats.map((format) => DATE_FORMAT_LABELS[format] ?? format).join(', ');
      return fail({
        detail: `Использовано форматов: ${formats.length} (${examples}).`,
        penaltyFactor: Math.min(1, (formats.length - 1) / 2),
      });
    },
  },

  {
    id: 'inconsistent-bullet-markers',
    dimension: 'language',
    severity: 'minor',
    penalty: 10,
    title: 'Разные маркеры списков',
    why: 'Смесь точек, дефисов и звёздочек выглядит как результат копирования из разных источников. При конвертации в другой формат такие списки часто ломаются.',
    fix: 'Оставьте один маркер во всём документе.',
    evaluate: ({ metrics }) => {
      const markers = metrics.consistency.bulletMarkers;
      if (markers.length <= 1) return pass();
      return fail({ detail: `Разных маркеров списка: ${markers.length} (${markers.join(' ')}).` });
    },
  },

  {
    id: 'inconsistent-bullet-punctuation',
    dimension: 'language',
    severity: 'minor',
    penalty: 8,
    title: 'Точки в конце пунктов то есть, то нет',
    why: 'Мелочь, но заметная: взгляд цепляется за несогласованность раньше, чем за содержание.',
    fix: 'Либо точка в конце каждого пункта, либо ни в одном. Второй вариант в резюме встречается чаще.',
    evaluate: ({ metrics }) =>
      metrics.consistency.mixedBulletPunctuation
        ? fail({ detail: 'В части пунктов есть завершающая точка, в части — нет.' })
        : pass(),
  },

  {
    id: 'inconsistent-tense',
    dimension: 'language',
    severity: 'minor',
    penalty: 12,
    title: 'Смешение времён внутри одной должности',
    why: 'Для завершённой работы используется прошедшее время, для текущей — настоящее. Смесь внутри одной позиции читается как небрежность.',
    fix: 'Прошлые места — только прошедшее время. Текущее — настоящее, последовательно во всех пунктах.',
    evaluate: ({ metrics }) =>
      metrics.consistency.mixedTense
        ? fail({ detail: 'В завершённой должности пункты написаны в разных временах.' })
        : pass(),
  },

  {
    id: 'long-sentences',
    dimension: 'language',
    severity: 'minor',
    penalty: 12,
    title: 'Слишком длинные предложения',
    why: 'Резюме просматривают, а не читают. Предложение на три строки при беглом взгляде не усваивается вообще.',
    fix: 'Разбейте длинные предложения. Ориентир — до 20–25 слов.',
    evaluate: ({ metrics }) => {
      if (metrics.averageSentenceWords === 0) return skip('Текст не распознан.');
      if (
        metrics.averageSentenceWords <= MAX_AVERAGE_SENTENCE_WORDS &&
        metrics.longSentences <= 2
      ) {
        return pass();
      }

      return fail({
        detail: `Средняя длина предложения — ${metrics.averageSentenceWords} слов, длинных предложений: ${metrics.longSentences}.`,
        penaltyFactor: Math.min(1, metrics.longSentences / 6),
      });
    },
  },

  {
    id: 'mixed-languages',
    dimension: 'language',
    severity: 'major',
    penalty: 20,
    title: 'Резюме написано на двух языках сразу',
    why: 'Смешение кириллицы и латиницы в описаниях заставляет читателя переключаться и выглядит как незаконченная правка. Названия технологий — исключение, они остаются латиницей всегда.',
    fix: 'Выберите один язык для всего связного текста. Для международных вакансий — английский, отдельным файлом.',
    evaluate: ({ resume }) => {
      if (!resume.language.isMixed) return pass();

      // Tech names are Latin by nature: a Russian resume is expected to sit
      // around 20-35% Latin characters without being genuinely bilingual.
      const ratio = resume.language.latinRatio;
      if (ratio > 0.15 && ratio < 0.45) return pass();

      return fail({
        detail: `Доля латиницы — ${Math.round(ratio * 100)}%, кириллицы — ${Math.round((1 - ratio) * 100)}%.`,
        penaltyFactor: 0.8,
      });
    },
  },

  {
    id: 'repeated-phrases',
    dimension: 'language',
    severity: 'minor',
    penalty: 12,
    title: 'Повторяющиеся формулировки',
    why: 'Если четыре пункта подряд начинаются одинаково, глаз перестаёт их различать и читает как один. Разнообразие глаголов — не украшение, а способ удержать внимание.',
    fix: 'Замените повторы синонимами: разработал / спроектировал / реализовал / выстроил.',
    evaluate: ({ resume }) => {
      const bullets = resume.experience.flatMap((item) => item.bullets);
      if (bullets.length < 4) return skip('Слишком мало пунктов для оценки.');

      const openings = new Map<string, number>();
      for (const bullet of bullets) {
        const first = bullet.text.split(/\s+/)[0]?.toLowerCase();
        if (!first || first.length < 3) continue;
        openings.set(first, (openings.get(first) ?? 0) + 1);
      }

      const repeated = [...openings.entries()]
        .filter(([, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1]);

      if (repeated.length === 0) return pass();

      return fail({
        detail: `Повторяющиеся начала пунктов: ${repeated
          .slice(0, 3)
          .map(([word, count]) => `«${word}» — ${count} раз`)
          .join(', ')}.`,
        penaltyFactor: Math.min(1, (repeated[0]?.[1] ?? 0) / 6),
      });
    },
  },

  {
    id: 'unparsed-sections',
    dimension: 'language',
    severity: 'minor',
    penalty: 14,
    title: 'Часть документа не удалось отнести ни к одному разделу',
    why: 'Если структуру не распознаёт этот разбор, её не распознает и ATS: такой текст попадёт в анкету как неразобранный остаток или потеряется.',
    fix: 'Добавьте явные заголовки разделов: «Опыт работы», «Навыки», «Образование». Одно слово в строке, выделенное жирным.',
    evaluate: ({ resume }) => {
      const unknown = resume.sections.filter((section) => section.kind === 'unknown');
      if (unknown.length === 0) return pass();

      const unknownChars = unknown.reduce(
        (sum, section) => sum + (section.span.end - section.span.start),
        0,
      );
      const share = unknownChars / Math.max(1, resume.plainText.length);
      if (share < 0.1) return pass();

      return fail({
        detail: `Не отнесено к разделам ${Math.round(share * 100)}% текста.`,
        anchors: unknown.slice(0, 3).map((section) => ({
          span: section.span,
          sectionId: section.id,
          label: excerpt(section.text, 60),
        })),
        penaltyFactor: Math.min(1, share / 0.4),
      });
    },
  },
];
