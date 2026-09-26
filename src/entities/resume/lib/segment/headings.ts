import { normalize } from '@/shared/lib/text';

import type { SectionKind } from '@/entities/resume/model/types';

/**
 * Section heading vocabulary, RU and EN.
 *
 * Real resumes do not use canonical headings. They write "Где я работал",
 * "Tech stack", "Про меня", "Чем занимаюсь" or nothing at all. This vocabulary
 * covers the common phrasings; anything it misses falls through to the
 * content-based inference in `segment.ts`, which never relies on headings.
 */

interface HeadingPattern {
  kind: SectionKind;
  /** Matched against the normalised heading text. */
  keywords: string[];
  /**
   * Confidence when a keyword matches. Lower for phrasings that are ambiguous:
   * "projects" can head a portfolio section or a sub-list inside one job.
   */
  confidence: number;
}

const HEADING_PATTERNS: HeadingPattern[] = [
  {
    kind: 'summary',
    confidence: 0.9,
    keywords: [
      'summary',
      'professional summary',
      'career summary',
      'profile',
      'professional profile',
      'about',
      'about me',
      'objective',
      'career objective',
      'overview',
      'introduction',
      'highlights',
      'career highlights',
      'key qualifications',
      'о себе',
      'обо мне',
      'краткая информация',
      'резюме',
      'профиль',
      'цель',
      'карьерная цель',
      'кто я',
      'коротко о себе',
      'про меня',
    ],
  },
  {
    kind: 'experience',
    confidence: 0.95,
    keywords: [
      'experience',
      'work experience',
      'professional experience',
      'employment',
      'employment history',
      'work history',
      'career',
      'career history',
      'relevant experience',
      'professional background',
      'positions',
      'опыт',
      'опыт работы',
      'профессиональный опыт',
      'трудовой опыт',
      'место работы',
      'места работы',
      'карьера',
      'где я работал',
      'где работал',
      'работа',
      'занятость',
    ],
  },
  {
    kind: 'education',
    confidence: 0.95,
    keywords: [
      'education',
      'academic background',
      'academic',
      'qualifications',
      'academic qualifications',
      'degrees',
      'образование',
      'учеба',
      'учёба',
      'академическое образование',
      'вуз',
      'обучение',
    ],
  },
  {
    kind: 'skills',
    confidence: 0.9,
    keywords: [
      'skills',
      'technical skills',
      'hard skills',
      'core skills',
      'key skills',
      'competencies',
      'core competencies',
      'technologies',
      'tech stack',
      'stack',
      'technical expertise',
      'expertise',
      'tools',
      'tools and technologies',
      'toolbox',
      'навыки',
      'ключевые навыки',
      'технические навыки',
      'технологии',
      'стек',
      'стек технологий',
      'инструменты',
      'компетенции',
      'знания',
      'чем владею',
      'с чем работаю',
    ],
  },
  {
    kind: 'projects',
    confidence: 0.85,
    keywords: [
      'projects',
      'personal projects',
      'side projects',
      'selected projects',
      'portfolio',
      'pet projects',
      'open source',
      'open source contributions',
      'проекты',
      'личные проекты',
      'пет-проекты',
      'портфолио',
      'избранные проекты',
    ],
  },
  {
    kind: 'certifications',
    confidence: 0.9,
    keywords: [
      'certifications',
      'certificates',
      'licenses',
      'licenses and certifications',
      'courses',
      'training',
      'professional development',
      'сертификаты',
      'сертификация',
      'курсы',
      'повышение квалификации',
      'дополнительное образование',
      'тренинги',
    ],
  },
  {
    kind: 'languages',
    confidence: 0.9,
    keywords: ['languages', 'language skills', 'языки', 'знание языков', 'иностранные языки'],
  },
  {
    kind: 'awards',
    confidence: 0.85,
    keywords: [
      'awards',
      'honors',
      'honours',
      'achievements',
      'recognition',
      'награды',
      'достижения',
      'признание',
    ],
  },
  {
    kind: 'publications',
    confidence: 0.85,
    keywords: [
      'publications',
      'talks',
      'conference talks',
      'speaking',
      'articles',
      'patents',
      'публикации',
      'статьи',
      'доклады',
      'выступления',
      'патенты',
    ],
  },
  {
    kind: 'volunteering',
    confidence: 0.85,
    keywords: [
      'volunteering',
      'volunteer experience',
      'community',
      'community involvement',
      'волонтерство',
      'волонтёрство',
      'общественная деятельность',
    ],
  },
  {
    kind: 'interests',
    confidence: 0.8,
    keywords: [
      'interests',
      'hobbies',
      'personal interests',
      'outside work',
      'интересы',
      'хобби',
      'увлечения',
    ],
  },
  {
    kind: 'references',
    confidence: 0.9,
    keywords: ['references', 'referees', 'рекомендации', 'рекомендатели'],
  },
  {
    kind: 'contacts',
    confidence: 0.85,
    keywords: [
      'contact',
      'contacts',
      'contact information',
      'contact details',
      'get in touch',
      'reach me',
      'links',
      'контакты',
      'контактная информация',
      'связаться',
      'ссылки',
    ],
  },
];

/** Decorations that wrap a heading without being part of its name. */
const DECORATION_RE = /^[\s\p{P}\p{S}]+|[\s:|/\\•·]+$/gu;

export interface HeadingMatch {
  kind: SectionKind;
  confidence: number;
}

/**
 * Classify a candidate heading.
 *
 * Exact matches win over containment so that "Work experience" does not get
 * classified by the substring "work" alone, and a heading combining two topics
 * ("Skills & Tools") resolves to the first pattern that matches whole.
 */
export function classifyHeading(text: string): HeadingMatch | null {
  const cleaned = normalize(text).replace(DECORATION_RE, '').trim();
  if (cleaned.length === 0 || cleaned.length > 64) return null;

  for (const pattern of HEADING_PATTERNS) {
    if (pattern.keywords.includes(cleaned)) {
      return { kind: pattern.kind, confidence: pattern.confidence };
    }
  }

  // Containment pass, longest keyword first so the most specific phrasing wins.
  const candidates = HEADING_PATTERNS.flatMap((pattern) =>
    pattern.keywords.map((keyword) => ({ pattern, keyword })),
  ).sort((a, b) => b.keyword.length - a.keyword.length);

  for (const { pattern, keyword } of candidates) {
    if (keyword.length < 4) continue;
    if (!cleaned.includes(keyword)) continue;
    // A long line that merely mentions the word is prose, not a heading.
    if (cleaned.length > keyword.length * 3 + 12) continue;
    return { kind: pattern.kind, confidence: pattern.confidence - 0.15 };
  }

  return null;
}

/** Every heading phrasing the vocabulary knows, for tests and the UI glossary. */
export function knownHeadingsFor(kind: SectionKind): string[] {
  return HEADING_PATTERNS.filter((pattern) => pattern.kind === kind).flatMap(
    (pattern) => pattern.keywords,
  );
}
