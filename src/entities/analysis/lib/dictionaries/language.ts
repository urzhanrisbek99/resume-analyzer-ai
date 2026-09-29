/**
 * Writing vocabulary used by the content and language rules.
 *
 * Bilingual throughout. A resume written in Russian for an international
 * employer gets judged by the same standards, so every list has both sides --
 * otherwise the tool would quietly grade Russian resumes as flawless.
 */

/**
 * Strong openers. A bullet starting with one of these states what the candidate
 * did; a bullet starting with anything else usually states what they were near.
 */
export const ACTION_VERBS: readonly string[] = [
  // impact
  'achieved',
  'accelerated',
  'boosted',
  'cut',
  'delivered',
  'doubled',
  'drove',
  'eliminated',
  'exceeded',
  'generated',
  'grew',
  'improved',
  'increased',
  'maximized',
  'minimized',
  'optimized',
  'reduced',
  'saved',
  'scaled',
  'streamlined',
  'tripled',
  // building
  'architected',
  'authored',
  'built',
  'created',
  'designed',
  'developed',
  'engineered',
  'established',
  'founded',
  'implemented',
  'introduced',
  'launched',
  'migrated',
  'modernized',
  'prototyped',
  'rebuilt',
  'refactored',
  'shipped',
  // leading
  'coached',
  'coordinated',
  'directed',
  'facilitated',
  'guided',
  'hired',
  'led',
  'managed',
  'mentored',
  'onboarded',
  'orchestrated',
  'owned',
  'spearheaded',
  'supervised',
  // analysis
  'analyzed',
  'audited',
  'benchmarked',
  'diagnosed',
  'evaluated',
  'forecast',
  'identified',
  'investigated',
  'measured',
  'researched',
  'resolved',
  'troubleshot',
  'validated',
  // collaboration
  'aligned',
  'collaborated',
  'consolidated',
  'negotiated',
  'partnered',
  'presented',
  'published',
  'standardized',
  // Russian, perfective past -- the form that reads as a completed result
  'автоматизировал',
  'внедрил',
  'вывел',
  'выстроил',
  'добился',
  'запустил',
  'значительно',
  'изменил',
  'консолидировал',
  'масштабировал',
  'мигрировал',
  'модернизировал',
  'настроил',
  'оптимизировал',
  'организовал',
  'основал',
  'перевёл',
  'перевел',
  'переписал',
  'повысил',
  'подготовил',
  'построил',
  'провёл',
  'провел',
  'разработал',
  'реализовал',
  'сократил',
  'создал',
  'снизил',
  'спроектировал',
  'ускорил',
  'устранил',
  'увеличил',
  'улучшил',
  'внедрила',
  'запустила',
  'разработала',
  'создала',
  'сократила',
  'улучшила',
];

/**
 * Weak openings. These describe a job description rather than an achievement,
 * and they are the single most common defect in a mid-level resume.
 */
export const WEAK_OPENINGS: readonly string[] = [
  'responsible for',
  'responsibilities included',
  'duties included',
  'worked on',
  'worked with',
  'worked as',
  'helped with',
  'helped to',
  'assisted with',
  'assisted in',
  'participated in',
  'involved in',
  'took part in',
  'tasked with',
  'in charge of',
  'was part of',
  'my role was',
  'my responsibilities',
  'занимался',
  'занималась',
  'отвечал за',
  'отвечала за',
  'участвовал в',
  'участвовала в',
  'помогал',
  'помогала',
  'принимал участие',
  'принимала участие',
  'выполнял обязанности',
  'в мои обязанности входило',
  'обязанности:',
  'работал над',
  'работала над',
  'работал с',
  'работала с',
];

/** Empty praise. Says nothing a recruiter can verify, and costs space. */
export const CLICHES: readonly string[] = [
  'hard worker',
  'hard-working',
  'team player',
  'self-starter',
  'go-getter',
  'think outside the box',
  'detail-oriented',
  'detail oriented',
  'results-oriented',
  'results-driven',
  'goal-oriented',
  'proven track record',
  'dynamic professional',
  'synergy',
  'best of breed',
  'value add',
  'passionate about',
  'guru',
  'ninja',
  'rockstar',
  'wizard',
  'excellent communication skills',
  'strong work ethic',
  'fast learner',
  'quick learner',
  'ответственный',
  'коммуникабельный',
  'стрессоустойчивый',
  'стрессоустойчивость',
  'целеустремлённый',
  'целеустремленный',
  'обучаемость',
  'быстро обучаюсь',
  'легко обучаем',
  'пунктуальный',
  'исполнительный',
  'умение работать в команде',
  'без вредных привычек',
  'активная жизненная позиция',
  'желание развиваться',
  'нацеленность на результат',
];

/**
 * Word boundaries throughout this file are written as Unicode lookarounds.
 *
 * `\b` is defined over ASCII word characters, so `/\bбыл\b/` matches nothing at
 * all -- silently, and only for the Russian half of every vocabulary. `\w` has
 * the same defect and is replaced by an explicit letter class.
 */
const L = '[\\p{L}\\p{N}]';
const START = `(?<!${L})`;
const END = `(?!${L})`;
const WORD = `\\p{L}+`;

/** First-person markers. A resume is written in implied first person already. */
export const FIRST_PERSON: readonly RegExp[] = [
  new RegExp(
    `${START}I\\s+(?:was|am|have|had|led|built|created|managed|developed|worked|did)${END}`,
    'u',
  ),
  new RegExp(`${START}my\\s+(?:role|responsibilities|team|job|work|task)${END}`, 'iu'),
  new RegExp(`${START}we\\s+(?:built|created|developed|delivered|launched)${END}`, 'iu'),
  new RegExp(
    `${START}я\\s+(?:был|была|работал|работала|сделал|сделала|занимался|занималась|разработал|разработала)${END}`,
    'iu',
  ),
  new RegExp(`${START}мо(?:й|я|и|ей|его)\\s+(?:роль|обязанност|команд|задач|работ)`, 'iu'),
  new RegExp(`${START}мы\\s+(?:сделали|создали|разработали|запустили|внедрили)${END}`, 'iu'),
];

/** Passive constructions: they hide who did the work. */
export const PASSIVE_MARKERS: readonly RegExp[] = [
  new RegExp(`${START}(?:was|were|is|are|been|being)\\s+${WORD}(?:ed|en)${END}`, 'iu'),
  new RegExp(`${START}(?:has|have|had)\\s+been\\s+${WORD}(?:ed|en)${END}`, 'iu'),
  new RegExp(`${START}был[аио]?\\s+${WORD}(?:н|т)[аоые]*${END}`, 'iu'),
  new RegExp(`${START}${WORD}(?:лось|лись|ется|ются|ался|ались)${END}`, 'iu'),
];

/**
 * Quantification signals: a number, a percentage, a money amount, a multiplier
 * or a magnitude word. Presence of any one makes a bullet measurable.
 */
export const QUANTIFICATION: readonly RegExp[] = [
  /\d+\s*%/u,
  new RegExp(`[$€₽₸£¥]\\s*\\d|\\d+\\s*(?:\\$|€|₽|₸|(?:k|m|млн|тыс|млрд)${END})`, 'iu'),
  new RegExp(`${START}\\d+(?:[.,]\\d+)?\\s*(?:x|х)${END}`, 'iu'),
  new RegExp(`${START}(?:from|to|с|до)\\s+\\d+`, 'iu'),
  new RegExp(`${START}\\d{2,}${END}`, 'u'),
  new RegExp(`${START}(?:doubled|tripled|halved|удвоил|утроил)${END}`, 'iu'),
];

/** Seniority signals read from job titles. */
export const SENIORITY_TITLES: Record<'junior' | 'middle' | 'senior' | 'lead', readonly string[]> =
  {
    junior: [
      'junior',
      'jr.',
      'intern',
      'trainee',
      'entry level',
      'джуниор',
      'стажер',
      'стажёр',
      'младший',
    ],
    middle: ['middle', 'mid-level', 'engineer ii', 'specialist', 'мидл', 'специалист'],
    senior: ['senior', 'sr.', 'staff', 'engineer iii', 'сеньор', 'старший', 'ведущий'],
    lead: [
      'lead',
      'team lead',
      'tech lead',
      'principal',
      'head of',
      'director',
      'architect',
      'manager',
      'cto',
      'vp of',
      'руководитель',
      'тимлид',
      'начальник',
      'директор',
      'архитектор',
    ],
  };

/** Section headings a resume is expected to have, by how badly it needs them. */
export const REQUIRED_SECTIONS = ['experience', 'skills'] as const;
export const EXPECTED_SECTIONS = ['education', 'summary'] as const;
