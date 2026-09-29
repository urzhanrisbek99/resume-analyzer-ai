/**
 * Synthetic resume fixtures.
 *
 * Written by hand rather than taken from real people: a resume is personal data
 * and a test corpus is the last place it belongs. Each fixture isolates a
 * situation the engine has to get right, and the awkward ones matter more than
 * the tidy one -- a checker that only handles the template is a checker nobody
 * needs.
 */

/** The shape everything is measured against: clean, quantified, conventional. */
export const STRONG_RESUME = `Aisha Karimova
Senior Frontend Engineer
Almaty, Kazakhstan | aisha.karimova@example.com | +7 700 123 45 67
linkedin.com/in/aishakarimova | github.com/aishakarimova

SUMMARY
Frontend engineer with 8 years building consumer products at scale. Took a
fintech platform from 200k to 1.4M monthly users while cutting time to
interactive by 62%. Looking for a senior role in a product team.

EXPERIENCE

Senior Frontend Engineer | Kaspi.kz | Almaty | March 2021 - Present
- Cut Largest Contentful Paint from 4.2s to 1.1s across the payments flow, lifting checkout conversion by 12%
- Led the migration of 240 components from Angular to React, shipping incrementally over 7 months with zero downtime
- Mentored 4 engineers to mid-level; 3 now lead their own squads
- Introduced visual regression testing, reducing UI defects reaching production by 71%

Frontend Engineer | Chocofamily | Almaty | June 2018 - February 2021
- Built a design system adopted by 6 product teams, cutting new feature delivery from 3 weeks to 8 days
- Reduced bundle size by 340KB through route-level code splitting
- Automated release checks in GitLab CI, removing 5 hours of manual QA per release

Junior Developer | Halyk Bank | Almaty | August 2016 - May 2018
- Delivered an internal reporting dashboard used daily by 90 analysts

EDUCATION
Kazakh-British Technical University
Bachelor of Computer Science, 2012 - 2016

SKILLS
Languages: TypeScript, JavaScript, Python
Frameworks: React, Next.js, Redux, Tailwind CSS
Infrastructure: Docker, AWS, GitHub Actions
Testing: Jest, Playwright, Cypress

LANGUAGES
English - C1, Russian - native, Kazakh - native
`;

/** Every content defect at once: duties, no numbers, cliches, first person. */
export const WEAK_RESUME = `Ivan Petrov
ivan.petrov@example.com

ОПЫТ РАБОТЫ

Разработчик, ООО Техносервис, 2020 - 2023
- Отвечал за разработку внутренних сервисов компании
- Занимался поддержкой существующего кода
- Участвовал в код-ревью
- Я работал с базой данных

Программист, ТОО Альфа, 2018 - 2020
- Работал над различными задачами
- Помогал коллегам

НАВЫКИ
Ответственный, стрессоустойчивый, быстро обучаюсь, умею работать в команде.
JavaScript, React, SQL

ОБРАЗОВАНИЕ
КазНУ, 2014 - 2018

Дата рождения: 15.03.1996
Семейное положение: женат
Желаемая зарплата: 800 000 тенге
`;

/**
 * No headings, no bullet markers, no conventional order. This is the fixture
 * that proves content inference works, and the reason it exists at all.
 */
export const UNCONVENTIONAL_RESUME = `Dana Seitkali / product designer / dana@example.com / dana.design

what i do
I design interfaces for logistics software. Eight years in, mostly B2B, mostly
messy domains where the hard part is understanding the work before drawing
anything.

where i have been
2022 to now, Wayfinder Logistics, lead product designer. Rebuilt the dispatch
console used by 1,200 operators; task completion time dropped 38 percent.
Set up the first design system the company had, now used across 4 products.

2019 to 2022, Cargotech, product designer. Shipped a driver app that reached
40,000 installs in its first year. Ran usability sessions with 60 drivers.

2016 to 2019, freelance. Interfaces for small logistics operators.

tools
Figma, Framer, HTML, CSS, a little React when it helps me prototype

school
Almaty Management University, design, 2012 to 2016

languages
English C1, Russian native, Kazakh native
`;

/** Structural failure: no dates, no contacts, one prose blob. */
export const MINIMAL_RESUME = `Programmer

I have been working in IT for a long time and know many technologies.
Worked in several companies on different projects. Responsible for various
tasks including development and testing. Looking for interesting work.
`;

export const SAMPLE_JOB_AD = `Senior Frontend Engineer
Remote (Europe) | Full-time

About the role
You will own the customer-facing web application and work directly with product
and design on the checkout experience.

Requirements
- 5+ years building production web applications
- Expert TypeScript and React
- Experience with Next.js and server-side rendering
- Strong understanding of web performance and Core Web Vitals
- Experience with automated testing (Jest, Playwright)

Nice to have
- GraphQL
- Experience with design systems
- Kubernetes
`;

export const ALL_FIXTURES = {
  strong: STRONG_RESUME,
  weak: WEAK_RESUME,
  unconventional: UNCONVENTIONAL_RESUME,
  minimal: MINIMAL_RESUME,
} as const;

export type FixtureName = keyof typeof ALL_FIXTURES;
