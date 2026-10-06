/**
 * An accuracy corpus: resumes that do not look like each other.
 *
 * The existing fixtures prove the pipeline runs. This corpus asks a harder
 * question -- does it read resumes people actually write, rather than the one
 * shape the parser was built against. Every entry carries the ground truth a
 * human would extract, so failures are measurable instead of impressionistic.
 *
 * All synthetic. A resume is personal data and a test corpus is the last place
 * it belongs, so these are composed from patterns rather than copied.
 */

export interface GroundTruth {
  /** Null when the format genuinely has no extractable name. */
  name: string | null;
  email: string | null;
  phone: boolean;
  /** How many distinct employers a human would count. */
  jobs: number;
  /** How many of those a human could date. */
  datedJobs: number;
  /** Technologies that must be found, by canonical name. */
  skills: string[];
  /** Section kinds a human would say are present. */
  sections: string[];
  hasEducation: boolean;
}

export interface CorpusEntry {
  id: string;
  /** What makes this one awkward. Reported next to any failure. */
  challenge: string;
  text: string;
  truth: GroundTruth;
}

export const CORPUS: CorpusEntry[] = [
  {
    id: 'classic-en',
    challenge: 'Conventional reverse-chronological English resume',
    text: `MARIA CHEN
Senior Backend Engineer
San Francisco, CA | maria.chen@example.com | (415) 555-0142
linkedin.com/in/mariachen | github.com/mariachen

PROFESSIONAL SUMMARY
Backend engineer with 9 years building payment infrastructure. Scaled a
settlement pipeline from 40k to 2.1M transactions per day.

PROFESSIONAL EXPERIENCE

Senior Backend Engineer, Stripe — San Francisco, CA
March 2020 – Present
• Rebuilt the settlement pipeline, raising throughput from 40k to 2.1M daily transactions
• Cut p99 latency on the ledger service from 840ms to 95ms
• Led a team of 5 engineers through a zero-downtime Postgres migration

Backend Engineer, Square — San Francisco, CA
July 2016 – February 2020
• Designed the dispute resolution service handling 180k cases per year
• Reduced on-call pages by 62% by rewriting the retry scheduler

EDUCATION
B.S. Computer Science, University of California Berkeley, 2012 – 2016

TECHNICAL SKILLS
Languages: Go, Python, SQL
Infrastructure: Kubernetes, Terraform, AWS, Kafka
Databases: PostgreSQL, Redis`,
    truth: {
      name: 'Maria Chen',
      email: 'maria.chen@example.com',
      phone: true,
      jobs: 2,
      datedJobs: 2,
      skills: ['Go', 'Python', 'Kubernetes', 'PostgreSQL', 'AWS'],
      sections: ['summary', 'experience', 'education', 'skills'],
      hasEducation: true,
    },
  },

  {
    id: 'hh-russian',
    challenge: 'Russian hh.ru export: patronymic, Russian month names, verbose',
    text: `Петров Иван Сергеевич
Ведущий разработчик

Телефон: +7 (999) 123-45-67
Email: ivan.petrov@example.com
Город: Москва

ОПЫТ РАБОТЫ

Сентябрь 2019 — настоящее время
Яндекс, Москва
Ведущий разработчик
• Сократил время сборки монорепозитория с 24 до 6 минут
• Внедрил поэтапную миграцию 180 сервисов на новый протокол
• Провёл более 400 код-ревью, выстроил процесс для команды из 12 человек

Март 2016 — август 2019
Тинькофф, Москва
Старший разработчик
• Разработал систему антифрода, снизившую потери на 34%
• Запустил платформу A/B-тестов, которой пользуются 9 команд

ОБРАЗОВАНИЕ
МГУ им. М.В. Ломоносова, факультет ВМК, 2011 — 2016

КЛЮЧЕВЫЕ НАВЫКИ
Java, Kotlin, Spring, PostgreSQL, Kafka, Docker, Kubernetes

ЯЗЫКИ
Английский — B2, Русский — родной`,
    truth: {
      name: 'Петров Иван Сергеевич',
      email: 'ivan.petrov@example.com',
      phone: true,
      jobs: 2,
      datedJobs: 2,
      skills: ['Java', 'Kotlin', 'Spring', 'PostgreSQL', 'Kafka'],
      sections: ['experience', 'education', 'skills', 'languages'],
      hasEducation: true,
    },
  },

  {
    id: 'dates-first',
    challenge: 'Dates in the left column, before the role',
    text: `Thomas Weber
Data Engineer
thomas.weber@example.de | +49 151 23456789 | Berlin

EXPERIENCE

2021 – now      Zalando, Berlin
                Senior Data Engineer
                - Rebuilt the event pipeline, cutting ingest cost by 41%
                - Delivered a lakehouse migration across 60 datasets

2018 – 2021     Delivery Hero, Berlin
                Data Engineer
                - Built the forecasting pipeline used by 14 markets
                - Reduced model training time from 9 hours to 50 minutes

2016 – 2018     SoundCloud, Berlin
                Analyst
                - Automated weekly reporting for 3 business units

EDUCATION
2012 – 2016     TU Berlin, B.Sc. Computer Science

SKILLS
Python, Spark, Airflow, dbt, Snowflake, AWS, SQL`,
    truth: {
      name: 'Thomas Weber',
      email: 'thomas.weber@example.de',
      phone: true,
      jobs: 3,
      datedJobs: 3,
      skills: ['Python', 'AWS', 'SQL'],
      sections: ['experience', 'education', 'skills'],
      hasEducation: true,
    },
  },

  {
    id: 'no-headings',
    challenge: 'No section headings whatsoever, lowercase prose',
    text: `dana seitkali — product designer — dana@example.com — +7 701 234 56 78

i design interfaces for logistics software. eight years in, mostly b2b, mostly
messy domains where the hard part is understanding the work before drawing it.

2022 to now, wayfinder logistics, lead product designer. rebuilt the dispatch
console used by 1,200 operators; task completion time dropped 38 percent. set up
the first design system the company had, now used across 4 products.

2019 to 2022, cargotech, product designer. shipped a driver app that reached
40,000 installs in its first year. ran usability sessions with 60 drivers.

2016 to 2019, freelance. interfaces for small logistics operators.

tools i use: figma, framer, html, css, a little react when prototyping

almaty management university, design, 2012 to 2016

english c1, russian native, kazakh native`,
    truth: {
      name: null,
      email: 'dana@example.com',
      phone: true,
      jobs: 3,
      datedJobs: 3,
      skills: ['React', 'HTML', 'CSS'],
      sections: ['experience'],
      hasEducation: true,
    },
  },

  {
    id: 'pipe-header',
    challenge: 'Everything on one line per job, pipe separated',
    text: `Aylin Demir | Frontend Engineer | aylin.demir@example.com | +90 532 111 22 33 | Istanbul

SUMMARY
Frontend engineer, 6 years. Took a marketplace from 300k to 1.8M monthly users
while halving time to interactive.

WORK HISTORY
Senior Frontend Engineer | Trendyol | Istanbul | 01/2022 - Present
• Halved time to interactive, from 5.1s to 2.4s, across the product pages
• Migrated 310 components to TypeScript with no feature freeze
• Set up visual regression tests, cutting UI defects by 58%

Frontend Engineer | Hepsiburada | Istanbul | 06/2019 - 12/2021
• Built the checkout flow serving 1.2M orders per month
• Introduced code splitting, reducing initial bundle by 420KB

EDUCATION
Bogazici University | B.Sc. Computer Engineering | 2015 - 2019

SKILLS
TypeScript, JavaScript, React, Next.js, Redux, Jest, Playwright, Webpack`,
    truth: {
      name: 'Aylin Demir',
      email: 'aylin.demir@example.com',
      phone: true,
      jobs: 2,
      datedJobs: 2,
      skills: ['TypeScript', 'React', 'Next.js', 'Jest', 'Playwright'],
      sections: ['summary', 'experience', 'education', 'skills'],
      hasEducation: true,
    },
  },

  {
    id: 'unusual-headings',
    challenge: 'Headings the vocabulary does not know, written as questions',
    text: `Noa Levi
noa.levi@example.com | +972 54 123 4567 | Tel Aviv

What I do
Platform engineer. I make other engineers faster, mostly by deleting things.

Where I have done it
Platform Engineer, Monday.com, Tel Aviv, Feb 2021 - Present
- Cut CI time from 38 minutes to 7 by sharding and caching the test suite
- Replaced three bespoke deploy scripts with one Terraform module, used by 22 teams

DevOps Engineer, Wix, Tel Aviv, Aug 2018 - Jan 2021
- Moved 140 services to Kubernetes without a customer-visible incident
- Cut cloud spend by 29% by right-sizing and reserving capacity

What I know
Go, Python, Terraform, Kubernetes, Docker, AWS, Prometheus, Grafana

Where I studied
Technion, B.Sc. Computer Science, 2014 - 2018

Languages
Hebrew native, English C1`,
    truth: {
      name: 'Noa Levi',
      email: 'noa.levi@example.com',
      phone: true,
      jobs: 2,
      datedJobs: 2,
      skills: ['Go', 'Python', 'Terraform', 'Kubernetes', 'AWS'],
      sections: ['experience'],
      hasEducation: true,
    },
  },

  {
    id: 'tab-table',
    challenge: 'Job header laid out as a table with tab stops',
    text: `JOHN O'BRIEN
Site Reliability Engineer
john.obrien@example.ie   +353 86 123 4567   Dublin

EXPERIENCE
Company         Role                    Period
Intercom        Senior SRE              Apr 2021 - Present
   • Reduced mean time to recovery from 42 minutes to 9
   • Built the incident tooling now used by all 18 on-call rotations

Stripe          SRE                     Sep 2017 - Mar 2021
   • Ran the migration of 200 services onto a new service mesh
   • Cut alert noise by 71% by rewriting the alerting rules

EDUCATION
Trinity College Dublin   B.A. Computer Science   2013 - 2017

SKILLS
Go, Python, Kubernetes, Terraform, Prometheus, AWS, Bash`,
    truth: {
      name: "John O'Brien",
      email: 'john.obrien@example.ie',
      phone: true,
      jobs: 2,
      datedJobs: 2,
      skills: ['Go', 'Python', 'Kubernetes', 'Terraform', 'AWS'],
      sections: ['experience', 'education', 'skills'],
      hasEducation: true,
    },
  },

  {
    id: 'career-changer',
    challenge: 'Career changer: unrelated early roles, a gap, a bootcamp',
    text: `Sofia Marino
Junior Frontend Developer
sofia.marino@example.it | +39 345 678 9012 | Milan

ABOUT
Former restaurant manager, now building web interfaces. Two years in, shipping
production code since my third month.

EXPERIENCE

Junior Frontend Developer
Satispay, Milan
June 2023 - Present
• Shipped 14 features to production in the first year
• Rewrote the onboarding flow, lifting completion from 54% to 71%

Frontend Developer (contract)
Freelance, Milan
January 2023 - May 2023
• Built three marketing sites for local businesses

Restaurant Manager
Trattoria Bella, Milan
March 2017 - September 2021
• Managed a team of 11 and a yearly budget of 740k euro

EDUCATION
Full-stack bootcamp, Boolean Careers, 2022
Diploma in Hospitality Management, IPSSAR Milano, 2013 - 2016

SKILLS
JavaScript, TypeScript, React, HTML, CSS, Git`,
    truth: {
      name: 'Sofia Marino',
      email: 'sofia.marino@example.it',
      phone: true,
      jobs: 3,
      datedJobs: 3,
      skills: ['JavaScript', 'TypeScript', 'React', 'HTML', 'CSS', 'Git'],
      sections: ['experience', 'education', 'skills'],
      hasEducation: true,
    },
  },

  {
    id: 'academic',
    challenge: 'Academic CV: publications, teaching, no bullet markers',
    text: `Dr. Amina Yusupova
Research Scientist, Machine Learning
amina.yusupova@example.org | +44 7700 900123 | Cambridge, UK

RESEARCH EXPERIENCE

Research Scientist, DeepMind, London, October 2021 to present
Led a team of four on sample-efficient reinforcement learning. Published three
first-author papers and reduced training compute for the main agent by 38%.

Postdoctoral Researcher, University of Cambridge, September 2018 to September 2021
Worked on uncertainty estimation in deep networks. Supervised two PhD students.

EDUCATION
PhD in Computer Science, University of Cambridge, 2014 to 2018
MSc in Mathematics, Moscow State University, 2012 to 2014

PUBLICATIONS
Yusupova A. et al. Sample-efficient exploration. NeurIPS 2023.
Yusupova A., Smith J. Calibrated uncertainty. ICML 2021.

SKILLS
Python, PyTorch, JAX, Machine Learning, Statistics

LANGUAGES
Russian native, English C2, French B1`,
    truth: {
      name: 'Amina Yusupova',
      email: 'amina.yusupova@example.org',
      phone: true,
      jobs: 2,
      datedJobs: 2,
      skills: ['Python', 'Machine Learning'],
      sections: ['experience', 'education', 'skills', 'languages', 'publications'],
      hasEducation: true,
    },
  },

  {
    id: 'mixed-language',
    challenge: 'Russian prose with English job titles and technologies',
    text: `Ермеков Данияр
Senior Android Developer

danyar.ermekov@example.kz | +7 777 888 99 00 | Алматы

О СЕБЕ
Android-разработчик, 7 лет. Вывел банковское приложение с 400 тысяч до 3,2 млн
активных пользователей в месяц.

ОПЫТ РАБОТЫ

Senior Android Developer — Kaspi.kz — Алматы
Январь 2021 — настоящее время
• Сократил время холодного старта приложения с 3,4 с до 1,2 с
• Перевёл 140 экранов на Jetpack Compose без остановки релизов
• Наставничество: вырастил трёх разработчиков до среднего уровня

Android Developer — Halyk Bank — Алматы
Июнь 2018 — декабрь 2020
• Разработал модуль платежей, обрабатывающий 900 тысяч операций в месяц

ОБРАЗОВАНИЕ
КБТУ, информационные системы, 2014 — 2018

НАВЫКИ
Kotlin, Java, Android SDK, Jetpack Compose, Coroutines, Git, CI/CD

ЯЗЫКИ
Казахский — родной, Русский — родной, Английский — B2`,
    truth: {
      name: 'Ермеков Данияр',
      email: 'danyar.ermekov@example.kz',
      phone: true,
      jobs: 2,
      datedJobs: 2,
      skills: ['Kotlin', 'Java', 'Git', 'CI/CD'],
      sections: ['summary', 'experience', 'education', 'skills', 'languages'],
      hasEducation: true,
    },
  },

  {
    id: 'numbered-bullets',
    challenge: 'Numbered achievements, dates in parentheses after the company',
    text: `Carlos Mendes
Engineering Manager
carlos.mendes@example.br | +55 11 98765 4321 | Sao Paulo

EXPERIENCE

Engineering Manager at Nubank (March 2020 - Present)
1. Grew the platform team from 6 to 19 engineers across three squads
2. Cut deployment lead time from 4 days to under 2 hours
3. Introduced a career framework adopted company-wide

Tech Lead at iFood (January 2017 - February 2020)
1. Led the rewrite of the order service, raising peak capacity 4x
2. Reduced incident count by 55% over eighteen months

EDUCATION
Universidade de Sao Paulo, B.Sc. Computer Science (2012 - 2016)

SKILLS
Java, Kotlin, Spring, Kafka, PostgreSQL, AWS, Leadership, Mentoring`,
    truth: {
      name: 'Carlos Mendes',
      email: 'carlos.mendes@example.br',
      phone: true,
      jobs: 2,
      datedJobs: 2,
      skills: ['Java', 'Kotlin', 'Spring', 'Kafka', 'PostgreSQL', 'AWS'],
      sections: ['experience', 'education', 'skills'],
      hasEducation: true,
    },
  },

  {
    id: 'minimal-junior',
    challenge: 'Junior with one job, thin content, no summary',
    text: `Lukas Nowak
lukas.nowak@example.pl
+48 512 345 678
Warsaw

EXPERIENCE
Junior QA Engineer, Allegro, Warsaw
September 2023 - Present
- Wrote 240 automated tests for the checkout flow
- Found and reported 61 defects before release

EDUCATION
Warsaw University of Technology, B.Sc. Computer Science, 2019 - 2023

SKILLS
Python, Selenium, Playwright, SQL, Git`,
    truth: {
      name: 'Lukas Nowak',
      email: 'lukas.nowak@example.pl',
      phone: true,
      jobs: 1,
      datedJobs: 1,
      skills: ['Python', 'Selenium', 'Playwright', 'SQL', 'Git'],
      sections: ['experience', 'education', 'skills'],
      hasEducation: true,
    },
  },

  {
    id: 'all-caps-name',
    challenge: 'Surname first in capitals, European convention',
    text: `DUPONT Claire
Product Manager

claire.dupont@example.fr
+33 6 12 34 56 78
Paris, France

PROFIL
Product manager, 8 ans. J'ai lance trois produits B2B de zero a la rentabilite.

EXPERIENCE PROFESSIONNELLE

Senior Product Manager, Doctolib, Paris
Avril 2021 - aujourd'hui
• Lance la plateforme de teleconsultation, 1,4 million de consultations la premiere annee
• Augmente la retention a 90 jours de 34% a 58%

Product Manager, BlaBlaCar, Paris
Septembre 2017 - Mars 2021
• Pilote la refonte du tunnel de reservation, conversion +22%

FORMATION
HEC Paris, Master en Management, 2013 - 2017

COMPETENCES
Product Strategy, SQL, Figma, Jira, A/B Testing`,
    truth: {
      name: 'DUPONT Claire',
      email: 'claire.dupont@example.fr',
      phone: true,
      jobs: 2,
      datedJobs: 2,
      skills: ['SQL', 'Figma', 'Jira'],
      sections: ['experience', 'education'],
      hasEducation: true,
    },
  },

  {
    id: 'no-bullet-markers',
    challenge: 'Achievements as plain paragraphs, no markers at all',
    text: `Priya Nair
Staff Software Engineer
priya.nair@example.in | +91 98765 43210 | Bangalore

EXPERIENCE

Staff Software Engineer, Razorpay, Bangalore
July 2020 - Present
Owned the payments gateway serving 8 million transactions a day. Reduced failure
rate from 1.8% to 0.3% by rewriting the retry and routing logic.
Mentored six engineers, four of whom were promoted during the period.

Senior Software Engineer, Flipkart, Bangalore
March 2016 - June 2020
Built the inventory reservation service handling 40k requests per second at peak.
Cut database load by 64% through a redesigned caching layer.

EDUCATION
Indian Institute of Technology Bombay, B.Tech Computer Science, 2012 - 2016

SKILLS
Java, Go, Kafka, Redis, PostgreSQL, Kubernetes, AWS`,
    truth: {
      name: 'Priya Nair',
      email: 'priya.nair@example.in',
      phone: true,
      jobs: 2,
      datedJobs: 2,
      skills: ['Java', 'Go', 'Kafka', 'Redis', 'PostgreSQL', 'Kubernetes', 'AWS'],
      sections: ['experience', 'education', 'skills'],
      hasEducation: true,
    },
  },

  {
    id: 'slash-dates',
    challenge: 'Numeric slash dates, abbreviated months, inconsistent formats',
    text: `Ahmed Hassan
Cloud Architect
ahmed.hassan@example.ae | +971 50 123 4567 | Dubai

EXPERIENCE

Cloud Architect, Careem, Dubai
03/2021 - present
• Designed the multi-region failover that cut downtime by 94%
• Saved 2.1M USD annually by re-architecting compute allocation

Senior DevOps Engineer, Souq.com, Dubai
Jun 2017 - Feb 2021
• Automated provisioning, dropping environment setup from 3 days to 20 minutes

DevOps Engineer, Etisalat, Dubai
2014 - 2017
• Ran the migration of 80 legacy applications to containers

EDUCATION
American University of Sharjah, B.Sc. Computer Engineering, 2010 - 2014

SKILLS
AWS, Azure, Terraform, Kubernetes, Docker, Ansible, Python, Bash`,
    truth: {
      name: 'Ahmed Hassan',
      email: 'ahmed.hassan@example.ae',
      phone: true,
      jobs: 3,
      datedJobs: 3,
      skills: ['AWS', 'Azure', 'Terraform', 'Kubernetes', 'Docker', 'Ansible', 'Python'],
      sections: ['experience', 'education', 'skills'],
      hasEducation: true,
    },
  },
];
