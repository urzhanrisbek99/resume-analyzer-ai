import { stableId } from '@/shared/lib/id';
import { canonicalizeSkill, findSkillsInText } from '@/shared/lib/skill-taxonomy';
import { findSpan, normalize, squish, wordPattern } from '@/shared/lib/text';

import type {
  JobDescription,
  JobSkillRequirement,
  Seniority,
} from '@/entities/job-description/model/types';

/**
 * Job advert parsing.
 *
 * The distinction that matters for scoring is required vs nice-to-have: missing
 * a required skill costs a candidate the screen, missing a nice-to-have costs
 * nothing. Ads mark this with headings ("Requirements" / "Would be a plus"), so
 * the text is split on those headings and each half is scanned separately.
 */

const REQUIRED_HEADINGS = [
  'requirements',
  'required',
  'must have',
  'must-have',
  'qualifications',
  'what you need',
  'what we expect',
  'you have',
  'skills',
  'hard skills',
  'ожидания',
  'требования',
  'обязательные требования',
  'что мы ждем',
  'что мы ждём',
  'вы подходите',
  'необходимые навыки',
  'ключевые навыки',
];

const OPTIONAL_HEADINGS = [
  'nice to have',
  'nice-to-have',
  'would be a plus',
  'bonus',
  'bonus points',
  'preferred',
  'desirable',
  'optional',
  'advantage',
  'будет плюсом',
  'будет преимуществом',
  'желательно',
  'приветствуется',
  'не обязательно',
];

const RESPONSIBILITY_HEADINGS = [
  'responsibilities',
  'what you will do',
  "what you'll do",
  'your role',
  'about the role',
  'duties',
  'обязанности',
  'задачи',
  'чем предстоит заниматься',
  'что делать',
];

const SENIORITY_PATTERNS: Array<{ level: Seniority; pattern: RegExp }> = [
  {
    level: 'lead',
    pattern: wordPattern([
      'lead',
      'principal',
      'staff',
      'head of',
      'director',
      'architect',
      'тимлид',
      'руководитель',
      'ведущий',
      'архитектор',
    ]),
  },
  { level: 'senior', pattern: wordPattern(['senior', 'sr', 'сеньор', 'старший']) },
  {
    level: 'junior',
    pattern: wordPattern([
      'junior',
      'jr',
      'intern',
      'trainee',
      'джуниор',
      'стажер',
      'стажёр',
      'младший',
    ]),
  },
  { level: 'middle', pattern: wordPattern(['middle', 'mid-level', 'мидл']) },
];

const JOB_TITLE_RE = wordPattern([
  'engineer',
  'developer',
  'designer',
  'manager',
  'analyst',
  'architect',
  'scientist',
  'lead',
  'specialist',
  'разработчик',
  'инженер',
  'аналитик',
  'дизайнер',
  'менеджер',
  'руководитель',
  'тестировщик',
]);

const BULLET_RE = /^\s*(?:[•·◦‣⁃▪*+]|[-–—](?=\s)|\d+[.)])\s*/u;

export function parseJobDescription(text: string): JobDescription {
  const plainText = text.replace(/\r\n?/g, '\n').trim();
  const blocks = splitByHeadings(plainText);

  const skills = new Map<string, JobSkillRequirement>();

  const collect = (source: string, required: boolean) => {
    for (const skill of findSkillsInText(source)) {
      const existing = skills.get(skill.canonical);
      // A skill named in both halves counts as required.
      if (existing && existing.required) continue;

      skills.set(skill.canonical, {
        canonical: skill.canonical,
        raw: skill.canonical,
        required,
        span: findSpan(normalize(plainText), normalize(skill.canonical)),
      });
    }
  };

  collect(blocks.required, true);
  collect(blocks.optional, false);
  // Anything outside a labelled block: treat as required, since most ads that
  // use no headings at all are listing their actual requirements.
  if (blocks.required.length === 0 && blocks.optional.length === 0) {
    collect(plainText, true);
  } else {
    collect(blocks.unlabelled, true);
  }

  return {
    id: stableId('jd', plainText.slice(0, 200), plainText.length),
    title: findTitle(plainText),
    company: null,
    seniority: findSeniority(plainText),
    skills: [...skills.values()],
    responsibilities: extractBullets(blocks.responsibilities).slice(0, 20),
    plainText,
  };
}

interface HeadingBlocks {
  required: string;
  optional: string;
  responsibilities: string;
  unlabelled: string;
}

/**
 * Split the ad at heading lines. A heading is a short line that matches one of
 * the known phrasings; everything until the next heading belongs to it.
 */
function splitByHeadings(text: string): HeadingBlocks {
  const lines = text.split('\n');
  const blocks: HeadingBlocks = {
    required: '',
    optional: '',
    responsibilities: '',
    unlabelled: '',
  };

  let current: keyof HeadingBlocks = 'unlabelled';

  for (const line of lines) {
    const flat = normalize(squish(line)).replace(/[:.]+$/, '');

    if (flat.length > 0 && flat.length <= 60) {
      const matches = (headings: string[]) =>
        headings.some((heading) => flat === heading || flat.startsWith(heading));

      if (matches(OPTIONAL_HEADINGS)) {
        current = 'optional';
        continue;
      }
      if (matches(REQUIRED_HEADINGS)) {
        current = 'required';
        continue;
      }
      if (matches(RESPONSIBILITY_HEADINGS)) {
        current = 'responsibilities';
        continue;
      }
    }

    blocks[current] += `${line}\n`;
  }

  return blocks;
}

function extractBullets(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => BULLET_RE.test(line))
    .map((line) => squish(line.replace(BULLET_RE, '')))
    .filter((line) => line.length > 8);
}

function findSeniority(text: string): Seniority {
  // Only the opening of the ad is considered: a "senior" mentioned deep in the
  // body is usually describing the team, not the vacancy.
  const head = text.slice(0, 400);
  for (const { level, pattern } of SENIORITY_PATTERNS) {
    if (pattern.test(head)) return level;
  }
  return 'unknown';
}

function findTitle(text: string): string | null {
  for (const raw of text.split('\n').slice(0, 8)) {
    const line = squish(raw);
    if (line.length < 4 || line.length > 90) continue;
    if (/[.!?]$/.test(line)) continue;

    if (JOB_TITLE_RE.test(line)) return line;
  }
  return null;
}

/** Normalise a free-text skill list a user typed by hand. */
export function parseSkillList(input: string): string[] {
  return input
    .split(/[,;\n•·|]/u)
    .map((part) => squish(part))
    .filter((part) => part.length > 1 && part.length < 40)
    .map((part) => canonicalizeSkill(part)?.canonical ?? part);
}
