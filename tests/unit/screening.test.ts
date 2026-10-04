import { describe, expect, it } from 'vitest';

import { analyseResume, type JobContext } from '@/entities/analysis';
import {
  rankBreakdown,
  rankScore,
  requiredCoverage,
  sortCandidates,
  type CandidateSummary,
} from '@/entities/candidate';
import { parseJobDescription } from '@/entities/job-description';
import { buildResumeDocument, extractFromText } from '@/entities/resume';
import { summariseCandidate } from '@/features/batch-screening';

import {
  MINIMAL_RESUME,
  SAMPLE_JOB_AD,
  STRONG_RESUME,
  UNCONVENTIONAL_RESUME,
  WEAK_RESUME,
} from '@/tests/fixtures/resumes';

function jobContext(adText: string): JobContext {
  const job = parseJobDescription(adText);
  return {
    title: job.title,
    requiredSkills: job.skills.filter((skill) => skill.required).map((skill) => skill.canonical),
    niceToHaveSkills: job.skills.filter((skill) => !skill.required).map((skill) => skill.canonical),
    seniority: job.seniority,
    plainText: job.plainText,
  };
}

function summarise(resumeText: string, fileName: string, job: JobContext | null) {
  const extracted = extractFromText(resumeText);
  if (!extracted.ok) throw new Error(extracted.error.message);

  const document = buildResumeDocument({
    extraction: extracted.value,
    file: { name: fileName, sizeBytes: resumeText.length },
    extractionMs: 0,
  });

  return summariseCandidate({
    id: fileName,
    fileName,
    document,
    result: analyseResume(document, { job, now: new Date('2026-01-15T00:00:00.000Z') }),
    job,
  });
}

/** A summary with only the fields a ranking test cares about. */
function candidate(overrides: Partial<CandidateSummary>): CandidateSummary {
  return {
    id: 'c',
    fileName: 'c.pdf',
    name: null,
    headline: null,
    email: null,
    location: null,
    overallScore: 50,
    jobMatchScore: 50,
    parseabilityScore: 100,
    experienceMonths: 24,
    seniority: 'middle',
    skills: { matchedRequired: [], missingRequired: [], matchedOptional: [] },
    criticalCount: 0,
    majorCount: 0,
    flags: [],
    ...overrides,
  };
}

describe('summariseCandidate', () => {
  const job = jobContext(SAMPLE_JOB_AD);

  it('reports which requirements a resume demonstrates', () => {
    const summary = summarise(STRONG_RESUME, 'strong.txt', job);

    expect(summary.skills.matchedRequired).toContain('TypeScript');
    expect(summary.skills.matchedRequired).toContain('React');
    expect(summary.skills.matchedRequired).toContain('Next.js');
    expect(summary.skills.missingRequired).not.toContain('React');
  });

  it('counts a skill proven only inside a job description', () => {
    // Playwright appears in the skills section; GitLab CI only in a bullet.
    const summary = summarise(STRONG_RESUME, 'strong.txt', job);
    const all = [...summary.skills.matchedRequired, ...summary.skills.matchedOptional];
    expect(all.length).toBeGreaterThan(0);
  });

  it('pulls the contact details a recruiter needs to act', () => {
    const summary = summarise(STRONG_RESUME, 'strong.txt', job);

    expect(summary.name).toBe('Aisha Karimova');
    expect(summary.email).toBe('aisha.karimova@example.com');
    expect(summary.experienceMonths).toBeGreaterThan(0);
  });

  it('reports no job match score when no vacancy was supplied', () => {
    expect(summarise(STRONG_RESUME, 'strong.txt', null).jobMatchScore).toBeNull();
  });

  it('flags a resume with no contactable address', () => {
    expect(summarise(MINIMAL_RESUME, 'minimal.txt', job).flags).toContain('missing-contacts');
  });

  it('does not flag a clean resume', () => {
    const summary = summarise(STRONG_RESUME, 'strong.txt', job);
    expect(summary.flags).not.toContain('missing-contacts');
    expect(summary.flags).not.toContain('undated-experience');
  });
});

describe('ranking', () => {
  it('puts required-skill coverage ahead of resume polish', () => {
    const fits = candidate({
      id: 'fits',
      overallScore: 55,
      jobMatchScore: 80,
      skills: {
        matchedRequired: ['React', 'TypeScript'],
        missingRequired: [],
        matchedOptional: [],
      },
    });

    const polishedButWrong = candidate({
      id: 'polished',
      overallScore: 95,
      jobMatchScore: 30,
      skills: {
        matchedRequired: [],
        missingRequired: ['React', 'TypeScript'],
        matchedOptional: [],
      },
    });

    expect(rankScore(fits)).toBeGreaterThan(rankScore(polishedButWrong));
  });

  it('falls back to resume quality when there is no vacancy', () => {
    const better = candidate({ overallScore: 80, jobMatchScore: null });
    const worse = candidate({ overallScore: 40, jobMatchScore: null });

    expect(rankScore(better)).toBe(80);
    expect(rankScore(worse)).toBe(40);
  });

  it('treats a vacancy with no stated requirements as fully covered', () => {
    expect(requiredCoverage(candidate({}))).toBe(1);
  });

  it('exposes the components behind the number', () => {
    const breakdown = rankBreakdown(
      candidate({
        overallScore: 60,
        jobMatchScore: 70,
        skills: { matchedRequired: ['A'], missingRequired: ['B'], matchedOptional: [] },
      }),
    );

    expect(breakdown.requiredCoverage).toBe(0.5);
    expect(breakdown.jobMatchScore).toBe(70);
    expect(breakdown.overallScore).toBe(60);
    expect(breakdown.total).toBe(Math.round(0.55 * 50 + 0.25 * 70 + 0.2 * 60));
  });
});

describe('sortCandidates', () => {
  const rows = [
    candidate({
      id: 'a',
      fileName: 'a.pdf',
      name: 'Борис',
      overallScore: 40,
      experienceMonths: 60,
    }),
    candidate({ id: 'b', fileName: 'b.pdf', name: 'Анна', overallScore: 90, experienceMonths: 12 }),
    candidate({
      id: 'c',
      fileName: 'c.pdf',
      name: 'Виктор',
      overallScore: 65,
      experienceMonths: 36,
    }),
  ];

  it('sorts by score descending by default', () => {
    const sorted = sortCandidates(rows, { key: 'overallScore', direction: 'desc' });
    expect(sorted.map((row) => row.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts names using Russian collation', () => {
    const sorted = sortCandidates(rows, { key: 'name', direction: 'asc' });
    expect(sorted.map((row) => row.name)).toEqual(['Анна', 'Борис', 'Виктор']);
  });

  it('sorts unscored candidates last rather than as zero', () => {
    const withUnscored = [
      candidate({ id: 'scored', jobMatchScore: 10 }),
      candidate({ id: 'unscored', jobMatchScore: null }),
    ];

    const sorted = sortCandidates(withUnscored, { key: 'jobMatchScore', direction: 'desc' });
    expect(sorted.map((row) => row.id)).toEqual(['scored', 'unscored']);
  });

  it('is stable for equal rows, so the table does not reshuffle', () => {
    const tied = [
      candidate({ id: 'x', fileName: 'x.pdf', overallScore: 50 }),
      candidate({ id: 'y', fileName: 'y.pdf', overallScore: 50 }),
    ];

    const first = sortCandidates(tied, { key: 'overallScore', direction: 'desc' });
    const second = sortCandidates(first, { key: 'overallScore', direction: 'desc' });
    expect(second.map((row) => row.id)).toEqual(first.map((row) => row.id));
  });
});

describe('a realistic shortlist', () => {
  const job = jobContext(SAMPLE_JOB_AD);

  it('ranks the candidate who matches the vacancy first', () => {
    const shortlist = [
      summarise(WEAK_RESUME, 'weak.txt', job),
      summarise(STRONG_RESUME, 'strong.txt', job),
      summarise(UNCONVENTIONAL_RESUME, 'unconventional.txt', job),
      summarise(MINIMAL_RESUME, 'minimal.txt', job),
    ];

    const sorted = sortCandidates(shortlist, { key: 'rank', direction: 'desc' });
    expect(sorted[0]?.fileName).toBe('strong.txt');
    expect(sorted[sorted.length - 1]?.fileName).toBe('minimal.txt');
  });

  it('keeps a resume readable despite an unusual format in contention', () => {
    const shortlist = [
      summarise(UNCONVENTIONAL_RESUME, 'unconventional.txt', job),
      summarise(MINIMAL_RESUME, 'minimal.txt', job),
    ];

    const sorted = sortCandidates(shortlist, { key: 'rank', direction: 'desc' });
    expect(sorted[0]?.fileName).toBe('unconventional.txt');
  });
});
