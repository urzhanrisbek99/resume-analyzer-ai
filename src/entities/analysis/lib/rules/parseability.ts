import { excerpt } from '@/shared/lib/text';

import { fail, pass, skip, type Rule } from '@/entities/analysis/model/types';

/**
 * Parseability: can an applicant tracking system read the file at all.
 *
 * This dimension is weighted hardest because its failures are absolute. A
 * beautifully written resume in a two-column template reaches the recruiter as
 * interleaved nonsense, and no amount of good content compensates. Every rule
 * here reads layout evidence gathered during extraction -- facts about the
 * document, not guesses about the template.
 */

export const parseabilityRules: Rule[] = [
  {
    id: 'no-text-layer',
    dimension: 'parseability',
    severity: 'critical',
    penalty: 100,
    title: 'В файле нет текстового слоя',
    why: 'ATS не распознаёт картинки. Резюме-скан для системы пустое, и заявка отсеивается автоматически, до того как её увидит человек.',
    fix: 'Экспортируйте резюме в PDF из Word, Google Docs или Figma. Не сканируйте распечатку и не вставляйте текст картинкой.',
    evaluate: ({ resume }) =>
      resume.layout.hasTextLayer
        ? pass()
        : fail({ detail: 'Текст не извлекается — документ состоит из изображений.' }),
  },

  {
    id: 'multi-column-layout',
    dimension: 'parseability',
    severity: 'critical',
    penalty: 45,
    title: 'Многоколоночная вёрстка',
    why: 'ATS читает PDF одним потоком в порядке отрисовки. Две колонки склеиваются построчно: строка из левой, строка из правой. На выходе получается текст, в котором название компании стоит посреди списка навыков.',
    fix: 'Переведите резюме в одну колонку. Боковая панель с навыками и контактами выглядит современно, но именно она чаще всего ломает разбор.',
    evaluate: ({ resume }) => {
      const { maxColumnsPerPage, multiColumnPages } = resume.layout;
      if (maxColumnsPerPage <= 1) return pass();

      const pages = multiColumnPages.join(', ');
      return fail({
        detail:
          multiColumnPages.length > 0
            ? `Обнаружено колонок: ${maxColumnsPerPage}. Затронуты страницы: ${pages}.`
            : `Обнаружено колонок: ${maxColumnsPerPage}.`,
        anchors: [{ label: pages ? `Страницы ${pages}` : 'Весь документ' }],
      });
    },
  },

  {
    id: 'content-in-tables',
    dimension: 'parseability',
    severity: 'major',
    penalty: 30,
    title: 'Содержимое свёрстано таблицей',
    why: 'Многие парсеры читают таблицу по столбцам, а не по строкам, и «2021–2023 | Senior Engineer» превращается в две несвязанные строки. Таблицы без видимых границ ломают разбор так же, как и с ними.',
    fix: 'Замените таблицы обычными абзацами и списками. Для выравнивания дат справа используйте табуляцию или отступ, а не ячейки.',
    evaluate: ({ resume }) => {
      const { tableCount } = resume.layout;
      if (tableCount === 0) return pass();

      // A couple of tabular rows is a date column; a dozen is the whole layout.
      const severity = tableCount >= 8 ? 'major' : 'minor';
      return fail({
        severity,
        detail: `Строк с табличной разметкой: ${tableCount}.`,
        penaltyFactor: tableCount >= 8 ? 1 : 0.5,
      });
    },
  },

  {
    id: 'content-in-header-footer',
    dimension: 'parseability',
    severity: 'major',
    penalty: 35,
    title: 'Данные в колонтитулах',
    why: 'Часть ATS игнорирует верхние и нижние колонтитулы целиком. Если там лежат телефон и почта, рекрутер получит резюме без единого способа с вами связаться.',
    fix: 'Перенесите контакты в основной текст, в самый верх первой страницы. В колонтитуле можно оставить только номер страницы.',
    evaluate: ({ resume }) => {
      if (!resume.layout.hasHeaderFooterContent) return pass();

      const samples = resume.layout.headerFooterSamples;
      const hasContacts = samples.some((sample) => /@|\+?\d[\d\s()-]{7,}/.test(sample));

      return fail({
        severity: hasContacts ? 'critical' : 'minor',
        penaltyFactor: hasContacts ? 1 : 0.4,
        detail: hasContacts
          ? `В колонтитуле находятся контактные данные: ${excerpt(samples.join(' / '), 90)}`
          : `Повторяющийся текст в колонтитуле: ${excerpt(samples.join(' / '), 90)}`,
        anchors: samples.slice(0, 3).map((sample) => ({ label: excerpt(sample, 60) })),
      });
    },
  },

  {
    id: 'text-boxes',
    dimension: 'parseability',
    severity: 'major',
    penalty: 30,
    title: 'Текст в надписях и фигурах',
    why: 'Надписи (text box) в Word лежат вне основного потока документа. Большинство парсеров до них просто не доходит, и всё их содержимое теряется.',
    fix: 'Перенесите текст из надписей в обычные абзацы.',
    evaluate: ({ resume }) =>
      resume.layout.textBoxCount === 0
        ? pass()
        : fail({ detail: `Надписей в документе: ${resume.layout.textBoxCount}.` }),
  },

  {
    id: 'problematic-glyphs',
    dimension: 'parseability',
    severity: 'major',
    penalty: 25,
    title: 'Символы, которые ломаются при копировании',
    why: 'Лигатуры и символы из частной области Unicode отображаются правильно, но при извлечении текста превращаются в мусор: «workflow» приходит как «work» плюс неизвестный символ. Поиск по ключевому слову такое слово не найдёт.',
    fix: 'Пересохраните PDF с отключёнными лигатурами или смените шрифт на системный — Arial, Calibri, Georgia.',
    evaluate: ({ resume }) => {
      if (!resume.layout.hasProblematicGlyphs) return pass();
      const samples = resume.layout.problematicGlyphSamples;
      return fail({
        detail: `Найдены проблемные символы: ${samples.join(' ')} (${samples.length} шт.).`,
      });
    },
  },

  {
    id: 'non-standard-fonts',
    dimension: 'parseability',
    severity: 'minor',
    penalty: 12,
    title: 'Нестандартные шрифты',
    why: 'Шрифты вне базового набора чаще встраиваются в PDF с нестандартной картой символов. Текст выглядит нормально, но извлекается с искажениями.',
    fix: 'Используйте Arial, Calibri, Helvetica, Georgia, Times New Roman, Lato, Inter или Roboto.',
    evaluate: ({ resume }) => {
      const { nonStandardFonts, fontFamilies } = resume.layout;
      if (fontFamilies.length === 0) return skip('Формат файла не содержит информации о шрифтах.');
      if (nonStandardFonts.length === 0) return pass();

      return fail({
        detail: `Нестандартные шрифты: ${nonStandardFonts.slice(0, 5).join(', ')}.`,
        anchors: nonStandardFonts.slice(0, 5).map((font) => ({ label: font })),
        penaltyFactor: Math.min(1, nonStandardFonts.length / 3),
      });
    },
  },

  {
    id: 'links-only-embedded',
    dimension: 'parseability',
    severity: 'minor',
    penalty: 15,
    title: 'Ссылки существуют только как гиперссылки',
    why: 'При извлечении текста адрес гиперссылки часто теряется, остаётся только подпись вроде «LinkedIn». В распечатанном резюме такая ссылка тоже бесполезна.',
    fix: 'Пишите адрес видимым текстом: linkedin.com/in/username, github.com/username.',
    evaluate: ({ resume }) => {
      const embedded = resume.layout.embeddedLinks;
      if (embedded.length === 0) return skip('В документе нет встроенных гиперссылок.');

      const hidden = embedded.filter((url) => {
        const bare = url
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/\/$/, '');
        return bare.length > 8 && !resume.plainText.includes(bare);
      });

      return hidden.length === 0
        ? pass()
        : fail({
            detail: `Ссылок, отсутствующих в видимом тексте: ${hidden.length} (${excerpt(hidden.slice(0, 2).join(', '), 70)}).`,
            anchors: hidden.slice(0, 3).map((url) => ({ label: url })),
          });
    },
  },

  {
    id: 'heavy-graphics',
    dimension: 'parseability',
    severity: 'minor',
    penalty: 10,
    title: 'Много графики',
    why: 'Иконки, диаграммы навыков и логотипы не несут для ATS никакой информации: шкала «React ▓▓▓▓░» читается как пустота. Рекрутер тоже не может её сравнить с чужой шкалой.',
    fix: 'Замените графические индикаторы словами: «React — 5 лет в продакшене» вместо полоски.',
    evaluate: ({ resume }) => {
      const { imageCount } = resume.layout;
      if (imageCount <= 2) return pass();
      return fail({
        detail: `Изображений в документе: ${imageCount}.`,
        penaltyFactor: Math.min(1, imageCount / 8),
      });
    },
  },
];
