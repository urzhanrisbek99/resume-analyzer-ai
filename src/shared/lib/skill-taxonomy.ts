import { normalize } from '@/shared/lib/text';

/**
 * Skill vocabulary: canonical names, synonyms and categories.
 *
 * This is reference data, not behaviour. It lives in `shared` because two
 * entities need the same canonical form and neither owns it: the resume parser
 * canonicalises what a candidate wrote, and job-description matching compares
 * against the same canon. Putting it inside either entity would force the other
 * to cross-import it, which is a worse trade than a shared dictionary.
 *
 * Synonyms exist because "ReactJS", "React.js" and "React" must match a job ad
 * that says any one of them -- the single most common reason a keyword-matching
 * ATS scores a qualified candidate at zero.
 */

export type SkillCategory =
  'language' | 'framework' | 'database' | 'cloud' | 'tooling' | 'practice' | 'soft' | 'other';

interface SkillEntry {
  canonical: string;
  category: SkillCategory;
  /** Written forms that mean the same skill. Matched case-insensitively. */
  synonyms: string[];
}

const SKILLS: SkillEntry[] = [
  // --- languages ---------------------------------------------------------
  {
    canonical: 'JavaScript',
    category: 'language',
    synonyms: ['js', 'javascript', 'ecmascript', 'es6', 'es2015'],
  },
  { canonical: 'TypeScript', category: 'language', synonyms: ['ts', 'typescript'] },
  { canonical: 'Python', category: 'language', synonyms: ['python', 'python3', 'py'] },
  { canonical: 'Java', category: 'language', synonyms: ['java', 'java se', 'java ee'] },
  { canonical: 'Kotlin', category: 'language', synonyms: ['kotlin'] },
  { canonical: 'Swift', category: 'language', synonyms: ['swift'] },
  { canonical: 'Go', category: 'language', synonyms: ['go', 'golang'] },
  { canonical: 'Rust', category: 'language', synonyms: ['rust'] },
  { canonical: 'C#', category: 'language', synonyms: ['c#', 'csharp', 'c sharp', '.net c#'] },
  { canonical: 'C++', category: 'language', synonyms: ['c++', 'cpp'] },
  { canonical: 'C', category: 'language', synonyms: ['c language'] },
  { canonical: 'PHP', category: 'language', synonyms: ['php'] },
  { canonical: 'Ruby', category: 'language', synonyms: ['ruby'] },
  { canonical: 'Scala', category: 'language', synonyms: ['scala'] },
  { canonical: 'SQL', category: 'language', synonyms: ['sql', 't-sql', 'pl/sql', 'plsql'] },
  {
    canonical: 'Bash',
    category: 'language',
    synonyms: ['bash', 'shell', 'shell scripting', 'zsh'],
  },
  { canonical: 'HTML', category: 'language', synonyms: ['html', 'html5'] },
  { canonical: 'CSS', category: 'language', synonyms: ['css', 'css3'] },

  // --- frameworks and libraries ------------------------------------------
  { canonical: 'React', category: 'framework', synonyms: ['react', 'reactjs', 'react.js'] },
  { canonical: 'Next.js', category: 'framework', synonyms: ['next.js', 'nextjs', 'next js'] },
  { canonical: 'Vue', category: 'framework', synonyms: ['vue', 'vuejs', 'vue.js', 'vue 3'] },
  { canonical: 'Nuxt', category: 'framework', synonyms: ['nuxt', 'nuxtjs', 'nuxt.js'] },
  { canonical: 'Angular', category: 'framework', synonyms: ['angular', 'angularjs', 'angular 2+'] },
  { canonical: 'Svelte', category: 'framework', synonyms: ['svelte', 'sveltekit'] },
  { canonical: 'Node.js', category: 'framework', synonyms: ['node', 'nodejs', 'node.js'] },
  { canonical: 'Express', category: 'framework', synonyms: ['express', 'expressjs', 'express.js'] },
  { canonical: 'NestJS', category: 'framework', synonyms: ['nest', 'nestjs', 'nest.js'] },
  {
    canonical: 'Django',
    category: 'framework',
    synonyms: ['django', 'django rest framework', 'drf'],
  },
  { canonical: 'Flask', category: 'framework', synonyms: ['flask'] },
  { canonical: 'FastAPI', category: 'framework', synonyms: ['fastapi', 'fast api'] },
  { canonical: 'Spring', category: 'framework', synonyms: ['spring', 'spring boot', 'springboot'] },
  {
    canonical: '.NET',
    category: 'framework',
    synonyms: ['.net', 'dotnet', 'asp.net', 'asp.net core'],
  },
  { canonical: 'Laravel', category: 'framework', synonyms: ['laravel'] },
  { canonical: 'Rails', category: 'framework', synonyms: ['rails', 'ruby on rails', 'ror'] },
  { canonical: 'React Native', category: 'framework', synonyms: ['react native', 'react-native'] },
  { canonical: 'Flutter', category: 'framework', synonyms: ['flutter'] },
  { canonical: 'Redux', category: 'framework', synonyms: ['redux', 'redux toolkit', 'rtk'] },
  {
    canonical: 'TanStack Query',
    category: 'framework',
    synonyms: ['react query', 'tanstack query'],
  },
  {
    canonical: 'Tailwind CSS',
    category: 'framework',
    synonyms: ['tailwind', 'tailwindcss', 'tailwind css'],
  },
  { canonical: 'GraphQL', category: 'framework', synonyms: ['graphql', 'apollo', 'apollo client'] },
  { canonical: 'tRPC', category: 'framework', synonyms: ['trpc'] },
  { canonical: 'Webpack', category: 'tooling', synonyms: ['webpack'] },
  { canonical: 'Vite', category: 'tooling', synonyms: ['vite'] },

  // --- databases ----------------------------------------------------------
  { canonical: 'PostgreSQL', category: 'database', synonyms: ['postgres', 'postgresql', 'psql'] },
  { canonical: 'MySQL', category: 'database', synonyms: ['mysql', 'mariadb'] },
  { canonical: 'MongoDB', category: 'database', synonyms: ['mongo', 'mongodb'] },
  { canonical: 'Redis', category: 'database', synonyms: ['redis'] },
  {
    canonical: 'Elasticsearch',
    category: 'database',
    synonyms: ['elasticsearch', 'elastic', 'opensearch'],
  },
  { canonical: 'ClickHouse', category: 'database', synonyms: ['clickhouse'] },
  { canonical: 'SQLite', category: 'database', synonyms: ['sqlite'] },
  { canonical: 'Microsoft SQL Server', category: 'database', synonyms: ['mssql', 'sql server'] },
  { canonical: 'Oracle', category: 'database', synonyms: ['oracle db', 'oracle database'] },
  { canonical: 'Cassandra', category: 'database', synonyms: ['cassandra', 'scylladb'] },
  { canonical: 'DynamoDB', category: 'database', synonyms: ['dynamodb', 'dynamo'] },

  // --- cloud and infrastructure -------------------------------------------
  {
    canonical: 'AWS',
    category: 'cloud',
    synonyms: ['aws', 'amazon web services', 'ec2', 's3', 'lambda'],
  },
  {
    canonical: 'Google Cloud',
    category: 'cloud',
    synonyms: ['gcp', 'google cloud', 'google cloud platform'],
  },
  { canonical: 'Azure', category: 'cloud', synonyms: ['azure', 'microsoft azure'] },
  {
    canonical: 'Docker',
    category: 'cloud',
    synonyms: ['docker', 'docker compose', 'containerization'],
  },
  { canonical: 'Kubernetes', category: 'cloud', synonyms: ['kubernetes', 'k8s', 'helm'] },
  {
    canonical: 'Terraform',
    category: 'cloud',
    synonyms: ['terraform', 'iac', 'infrastructure as code'],
  },
  { canonical: 'Ansible', category: 'cloud', synonyms: ['ansible'] },
  { canonical: 'Nginx', category: 'cloud', synonyms: ['nginx'] },
  { canonical: 'Kafka', category: 'cloud', synonyms: ['kafka', 'apache kafka'] },
  { canonical: 'RabbitMQ', category: 'cloud', synonyms: ['rabbitmq', 'rabbit mq'] },
  { canonical: 'Vercel', category: 'cloud', synonyms: ['vercel'] },

  // --- tooling -------------------------------------------------------------
  { canonical: 'Git', category: 'tooling', synonyms: ['git', 'github', 'gitlab', 'bitbucket'] },
  {
    canonical: 'CI/CD',
    category: 'tooling',
    synonyms: [
      'ci/cd',
      'cicd',
      'continuous integration',
      'continuous delivery',
      'github actions',
      'gitlab ci',
      'jenkins',
    ],
  },
  { canonical: 'Jira', category: 'tooling', synonyms: ['jira', 'atlassian'] },
  { canonical: 'Figma', category: 'tooling', synonyms: ['figma'] },
  { canonical: 'Jest', category: 'tooling', synonyms: ['jest'] },
  { canonical: 'Vitest', category: 'tooling', synonyms: ['vitest'] },
  { canonical: 'Cypress', category: 'tooling', synonyms: ['cypress'] },
  { canonical: 'Playwright', category: 'tooling', synonyms: ['playwright'] },
  { canonical: 'Selenium', category: 'tooling', synonyms: ['selenium'] },
  { canonical: 'Grafana', category: 'tooling', synonyms: ['grafana', 'prometheus'] },
  { canonical: 'Sentry', category: 'tooling', synonyms: ['sentry'] },

  // --- practices -----------------------------------------------------------
  {
    canonical: 'REST API',
    category: 'practice',
    synonyms: ['rest', 'rest api', 'restful', 'restful api'],
  },
  {
    canonical: 'Microservices',
    category: 'practice',
    synonyms: ['microservices', 'microservice architecture'],
  },
  {
    canonical: 'Agile',
    category: 'practice',
    synonyms: ['agile', 'scrum', 'kanban', 'sprint planning'],
  },
  {
    canonical: 'TDD',
    category: 'practice',
    synonyms: ['tdd', 'test driven development', 'test-driven development'],
  },
  {
    canonical: 'Code Review',
    category: 'practice',
    synonyms: ['code review', 'peer review', 'pull request review'],
  },
  {
    canonical: 'System Design',
    category: 'practice',
    synonyms: ['system design', 'architecture design', 'solution architecture'],
  },
  { canonical: 'Accessibility', category: 'practice', synonyms: ['accessibility', 'a11y', 'wcag'] },
  {
    canonical: 'Performance Optimization',
    category: 'practice',
    synonyms: ['performance optimization', 'performance tuning', 'web vitals', 'core web vitals'],
  },
  {
    canonical: 'Machine Learning',
    category: 'practice',
    synonyms: ['machine learning', 'ml', 'deep learning'],
  },
  {
    canonical: 'Data Analysis',
    category: 'practice',
    synonyms: ['data analysis', 'data analytics', 'bi'],
  },

  // --- soft ----------------------------------------------------------------
  {
    canonical: 'Mentoring',
    category: 'soft',
    synonyms: ['mentoring', 'mentorship', 'coaching', 'наставничество'],
  },
  {
    canonical: 'Leadership',
    category: 'soft',
    synonyms: ['leadership', 'team leadership', 'people management', 'лидерство'],
  },
  {
    canonical: 'Communication',
    category: 'soft',
    synonyms: ['communication', 'stakeholder management', 'коммуникация'],
  },
  {
    canonical: 'Problem Solving',
    category: 'soft',
    synonyms: ['problem solving', 'analytical thinking'],
  },
];

/** synonym -> entry, built once. */
const INDEX: Map<string, SkillEntry> = (() => {
  const map = new Map<string, SkillEntry>();
  for (const entry of SKILLS) {
    map.set(normalize(entry.canonical), entry);
    for (const synonym of entry.synonyms) map.set(normalize(synonym), entry);
  }
  return map;
})();

/** Longest synonyms first, so "react native" wins over "react" when scanning. */
const SCAN_ORDER: Array<{ key: string; entry: SkillEntry }> = [...INDEX.entries()]
  .map(([key, entry]) => ({ key, entry }))
  .sort((a, b) => b.key.length - a.key.length);

export interface CanonicalSkill {
  canonical: string;
  category: SkillCategory;
}

/** Resolve a written skill to its canonical form, or null when unknown. */
export function canonicalizeSkill(raw: string): CanonicalSkill | null {
  const entry = INDEX.get(
    normalize(raw)
      .replace(/\s*\(.*\)\s*$/, '')
      .trim(),
  );
  return entry ? { canonical: entry.canonical, category: entry.category } : null;
}

/**
 * Find every known skill mentioned in free text, with word-boundary matching so
 * "Go" does not match inside "Google" and "C" does not match every letter C.
 */
export function findSkillsInText(text: string): CanonicalSkill[] {
  const haystack = normalize(text);
  const found = new Map<string, CanonicalSkill>();
  // Mark consumed ranges so "react native" prevents a second hit on "react".
  const consumed: Array<[number, number]> = [];

  for (const { key, entry } of SCAN_ORDER) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(key)}(?![\\p{L}\\p{N}])`, 'gu');
    for (const match of haystack.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (consumed.some(([from, to]) => start < to && end > from)) continue;
      consumed.push([start, end]);
      found.set(entry.canonical, { canonical: entry.canonical, category: entry.category });
    }
  }

  return [...found.values()];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function allCanonicalSkills(): CanonicalSkill[] {
  return SKILLS.map((entry) => ({ canonical: entry.canonical, category: entry.category }));
}
