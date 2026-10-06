import {
  findSpan,
  normalize,
  squish,
  uppercaseRatio,
  wordCount,
  wordPattern,
} from '@/shared/lib/text';

import type {
  ContactBlock,
  LinkKind,
  ResumeLink,
  SensitiveField,
} from '@/entities/resume/model/types';

/**
 * Contact block parsing.
 *
 * Also the place where personal data that hurts a candidate abroad is detected.
 * A photo, a date of birth or a marital status is normal on a CV in this region
 * and a liability in the US, UK or EU, where recruiters are trained to discard
 * resumes carrying protected characteristics. The rule layer explains that; this
 * layer only reports what is present.
 *
 * Every vocabulary here goes through `wordPattern`, never through `\b`: the
 * ASCII-only boundary silently fails on Cyrillic, which would switch off the
 * Russian half of the detection without any visible error.
 */

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]*\w/g;
/**
 * Deliberately loose: resumes write phone numbers a dozen ways.
 *
 * Separators repeat, because "(415) 555-0142" puts a bracket and a space
 * between two digits and "+7 (999) 123-45-67" does it twice. Allowing only
 * one separator character silently missed both.
 */
const PHONE_RE = /(?:\+?\d{1,3}[\s().-]{0,3})?(?:\d[\s().-]{0,3}){8,14}\d/g;
const URL_RE =
  /(?:https?:\/\/|www\.)[^\s<>",;)\]]+|(?:[\w-]+\.)+(?:com|io|dev|me|org|net|ru|kz)\/[^\s<>",;)\]]*/gi;

const LINK_DOMAINS: Array<{ kind: LinkKind; pattern: RegExp }> = [
  { kind: 'linkedin', pattern: /linkedin\.com/i },
  { kind: 'github', pattern: /github\.(com|io)/i },
  { kind: 'gitlab', pattern: /gitlab\.com/i },
  { kind: 'telegram', pattern: /(?:t\.me|telegram\.me)/i },
  { kind: 'stackoverflow', pattern: /stackoverflow\.com/i },
  { kind: 'behance', pattern: /(?:behance\.net|dribbble\.com)/i },
];

interface SensitivePattern {
  field: SensitiveField;
  pattern: RegExp;
}

const SENSITIVE_PATTERNS: SensitivePattern[] = [
  {
    field: 'birthDate',
    pattern: wordPattern([
      'date of birth',
      'dob',
      'd.o.b.',
      'born on',
      'дата рождения',
      'день рождения',
      'год рождения',
    ]),
  },
  {
    field: 'age',
    pattern:
      /(?<![\p{L}\p{N}])(?:age\s*[:–-]?\s*\d{2}|\d{2}\s*years?\s*old|возраст\s*[:–-]?\s*\d{2}|\d{2}\s*(?:лет|года))(?![\p{L}\p{N}])/iu,
  },
  {
    field: 'maritalStatus',
    pattern: wordPattern([
      'marital status',
      'married',
      'divorced',
      'семейное положение',
      'женат',
      'замужем',
      'не женат',
      'холост',
      'разведен',
    ]),
  },
  {
    field: 'gender',
    pattern: /(?<![\p{L}\p{N}])(?:gender|sex|пол)\s*[:–-]/iu,
  },
  {
    field: 'nationality',
    pattern: wordPattern(['nationality', 'citizenship', 'гражданство', 'национальность']),
  },
  {
    field: 'religion',
    pattern: wordPattern(['religion', 'вероисповедание', 'религия']),
  },
  {
    field: 'idNumber',
    pattern: wordPattern([
      'ssn',
      'social security',
      'passport',
      'иин',
      'инн',
      'снилс',
      'паспорт',
      'удостоверение личности',
    ]),
  },
  {
    field: 'fullHomeAddress',
    pattern:
      /(?<![\p{L}\p{N}])(?:ул\.|улица|квартира|кв\.\s*\d|дом\s*\d|apt\.?\s*\d|apartment\s*\d|\d+\s+(?:street|st\.|avenue|ave\.|road|rd\.))/iu,
  },
  {
    field: 'salaryExpectation',
    pattern: wordPattern([
      'salary expectation',
      'salary expectations',
      'expected salary',
      'desired salary',
      'желаемая зарплата',
      'зарплатные ожидания',
      'ожидаемый доход',
      'ожидаемая зарплата',
    ]),
  },
];

/** Cities and markers that identify a location line without a full gazetteer. */
const LOCATION_HINTS = [
  'almaty',
  'astana',
  'nur-sultan',
  'shymkent',
  'karaganda',
  'moscow',
  'saint petersburg',
  'tbilisi',
  'yerevan',
  'bishkek',
  'tashkent',
  'dubai',
  'berlin',
  'amsterdam',
  'london',
  'warsaw',
  'lisbon',
  'remote',
  'relocation',
  'алматы',
  'астана',
  'москва',
  'удаленно',
  'релокация',
];

/** Words that make a capitalised line a job title rather than a person's name. */
const TITLE_WORDS = [
  'engineer',
  'developer',
  'manager',
  'designer',
  'analyst',
  'lead',
  'architect',
  'consultant',
  'specialist',
  'разработчик',
  'инженер',
  'менеджер',
  'аналитик',
  'дизайнер',
  'руководитель',
];

const TITLE_WORDS_RE = wordPattern(TITLE_WORDS);

const HEADLINE_WORDS_RE = wordPattern([
  ...TITLE_WORDS,
  'scientist',
  'qa',
  'sre',
  'devops',
  'product owner',
  'scrum master',
  'тимлид',
  'тестировщик',
]);

export interface ParseContactsInput {
  /** The header block, or the whole document when no header was identified. */
  headerText: string;
  /** Full document text: sensitive fields hide in any section. */
  plainText: string;
  /** Links recovered from the file container rather than the visible text. */
  embeddedLinks: string[];
  hasImageLikelyPhoto: boolean;
}

export function parseContacts(input: ParseContactsInput): ContactBlock {
  const { headerText, plainText, embeddedLinks, hasImageLikelyPhoto } = input;

  const email = firstMatch(plainText, EMAIL_RE);
  const phone = findPhone(plainText);
  const links = collectLinks(plainText, embeddedLinks);
  const fullName = findName(headerText, email);
  const headline = findHeadline(headerText, fullName);
  const location = findLocation(headerText);

  const sensitiveFields: SensitiveField[] = SENSITIVE_PATTERNS.filter((entry) =>
    entry.pattern.test(plainText),
  ).map((entry) => entry.field);

  if (hasImageLikelyPhoto) sensitiveFields.unshift('photo');

  return {
    fullName,
    email,
    phone,
    location,
    headline,
    links,
    sensitiveFields: [...new Set(sensitiveFields)],
  };
}

function firstMatch(text: string, pattern: RegExp): string | null {
  const match = text.match(new RegExp(pattern.source, pattern.flags.replace('g', '')));
  return match?.[0] ?? null;
}

/**
 * Reject digit runs that are really dates or money. A phone number has at least
 * ten digits and is not immediately preceded by a currency symbol.
 */
function findPhone(text: string): string | null {
  for (const match of text.matchAll(PHONE_RE)) {
    const candidate = match[0];
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) continue;

    const index = match.index ?? 0;
    const before = text.slice(Math.max(0, index - 12), index);
    if (/[$€₽₸]\s*$/.test(before)) continue;
    if (/(?:usd|eur|kzt|rub|tenge|тенге)\s*$/i.test(before)) continue;

    return squish(candidate);
  }
  return null;
}

function collectLinks(text: string, embeddedLinks: string[]): ResumeLink[] {
  const found = new Map<string, ResumeLink>();

  const register = (raw: string) => {
    const url = squish(raw).replace(/[.,;)]+$/, '');
    if (url.length < 6) return;

    const key = normalize(url)
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '');
    if (found.has(key)) return;

    const matched = LINK_DOMAINS.find((entry) => entry.pattern.test(url));
    found.set(key, {
      kind: matched?.kind ?? (isPortfolioLike(url) ? 'portfolio' : 'other'),
      url,
      // A recruiter has to be able to click it. A bare handle is not a link.
      isResolvable: /^https?:\/\//i.test(url) || /^www\./i.test(url) || /\.[a-z]{2,}\//i.test(url),
    });
  };

  for (const match of text.matchAll(URL_RE)) register(match[0]);
  for (const link of embeddedLinks) register(link);

  return [...found.values()];
}

function isPortfolioLike(url: string): boolean {
  return /\.(?:dev|me|io|design|site|portfolio)\b/i.test(url) || /portfolio|cv|resume/i.test(url);
}

/**
 * The candidate name.
 *
 * Taken from the top of the document: two to four capitalised words, no digits,
 * no contact punctuation. An ALL CAPS name is common and must still match, so
 * casing is checked as "not lowercase" rather than "title case".
 */
function findName(headerText: string, email: string | null): string | null {
  const candidates = headerText
    .split(/\n|\s+[|•·/]\s+/u)
    .map(squish)
    .filter((line) => line.length > 0)
    .slice(0, 8);

  for (const line of candidates) {
    if (email && line.includes(email)) continue;
    if (/\d|@|https?:\/\/|\+/.test(line)) continue;

    const words = line.split(/\s+/).filter((word) => word.length > 1);
    if (words.length < 2 || words.length > 4) continue;

    const allCapitalised = words.every((word) => {
      const first = word[0] ?? '';
      return first === first.toUpperCase() && first !== first.toLowerCase();
    });
    if (!allCapitalised) continue;

    // Job titles also pass the tests above; names do not contain these words.
    if (TITLE_WORDS_RE.test(line)) continue;

    return line;
  }

  return null;
}

/** The professional headline: the title line that usually sits under the name. */
function findHeadline(headerText: string, fullName: string | null): string | null {
  const lines = headerText
    .split(/\n|\s+[|•·/]\s+/u)
    .map(squish)
    .filter((line) => line.length > 0);

  const start = fullName ? lines.indexOf(fullName) + 1 : 0;

  for (const line of lines.slice(start, start + 4)) {
    if (line.length < 4 || line.length > 90) continue;
    if (/@|https?:\/\/|\+\d/.test(line)) continue;
    if (uppercaseRatio(line) > 0.85 && wordCount(line) <= 2) continue;

    if (HEADLINE_WORDS_RE.test(line)) return line;
  }

  return null;
}

function findLocation(headerText: string): string | null {
  const lower = normalize(headerText);
  const hit = LOCATION_HINTS.find((hint) => lower.includes(hint));
  if (!hit) return null;

  const span = findSpan(lower, hit);
  if (!span) return null;

  // Return the original casing of the enclosing comma-delimited fragment.
  const lineStart = headerText.lastIndexOf('\n', span.start) + 1;
  const lineEndRaw = headerText.indexOf('\n', span.end);
  const lineEnd = lineEndRaw === -1 ? headerText.length : lineEndRaw;
  const line = headerText.slice(lineStart, lineEnd);

  const fragment = line
    .split(/[|•·]/u)
    .map(squish)
    .find((part) => normalize(part).includes(hit));

  return fragment && fragment.length <= 60 ? fragment : squish(line).slice(0, 60);
}
