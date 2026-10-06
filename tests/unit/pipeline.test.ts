import { describe, expect, it } from 'vitest';

import { analyseResume, assertUniqueRuleIds, ALL_RULES } from '@/entities/analysis';
import { parseJobDescription } from '@/entities/job-description';
import { buildResumeDocument, extractFromText, segmentResume } from '@/entities/resume';

import {
  MINIMAL_RESUME,
  SAMPLE_JOB_AD,
  STRONG_RESUME,
  UNCONVENTIONAL_RESUME,
  WEAK_RESUME,
} from '@/tests/fixtures/resumes';

/**
 * End-to-end tests over the real pipeline: text in, score out.
 *
 * Deliberately not unit tests of individual rules. What matters is that a good
 * resume scores well and a bad one does not, and that the reasons given are the
 * right reasons -- an engine can pass every unit test and still rank resumes
 * nonsensically.
 */

function analyse(text: string, jobAd?: string) {
  const extracted = extractFromText(text);
  if (!extracted.ok) throw new Error(`Extraction failed: ${extracted.error.message}`);

  const document = buildResumeDocument({
    extraction: extracted.value,
    file: { name: 'fixture.txt', sizeBytes: text.length },
    extractionMs: 0,
  });

  const job = jobAd ? parseJobDescription(jobAd) : null;

  return {
    document,
    result: analyseResume(document, {
      now: new Date('2026-01-15T00:00:00.000Z'),
      job: job
        ? {
            title: job.title,
            requiredSkills: job.skills.filter((s) => s.required).map((s) => s.canonical),
            niceToHaveSkills: job.skills.filter((s) => !s.required).map((s) => s.canonical),
            seniority: job.seniority,
            plainText: job.plainText,
          }
        : null,
    }),
  };
}

const ruleIds = (findings: Array<{ ruleId: string }>) => findings.map((f) => f.ruleId);

describe('rule registry', () => {
  it('has no duplicate rule ids', () => {
    expect(() => assertUniqueRuleIds()).not.toThrow();
  });

  it('gives every rule the four things a finding needs', () => {
    for (const rule of ALL_RULES) {
      expect(rule.title, rule.id).toBeTruthy();
      expect(rule.why, rule.id).toBeTruthy();
      expect(rule.fix, rule.id).toBeTruthy();
      expect(rule.penalty, rule.id).toBeGreaterThan(0);
    }
  });

  it('covers every dimension', () => {
    const covered = new Set(ALL_RULES.map((rule) => rule.dimension));
    expect(covered.size).toBeGreaterThanOrEqual(7);
  });
});

describe('scoring behaviour', () => {
  it('scores a strong resume well above a weak one', () => {
    const strong = analyse(STRONG_RESUME).result;
    const weak = analyse(WEAK_RESUME).result;

    expect(strong.overallScore).toBeGreaterThan(weak.overallScore + 20);
    expect(strong.overallScore).toBeGreaterThan(60);
    expect(weak.overallScore).toBeLessThan(65);
  });

  it('is deterministic: the same input produces the identical result', () => {
    const first = analyse(STRONG_RESUME).result;
    const second = analyse(STRONG_RESUME).result;

    expect(second.overallScore).toBe(first.overallScore);
    expect(ruleIds(second.findings)).toEqual(ruleIds(first.findings));
    expect(second.id).toBe(first.id);
  });

  it('orders findings by severity, most serious first', () => {
    const { result } = analyse(WEAK_RESUME);
    const order = ['critical', 'major', 'minor', 'info'];
    const ranks = result.findings.map((finding) => order.indexOf(finding.severity));

    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('keeps every score inside 0-100', () => {
    for (const text of [STRONG_RESUME, WEAK_RESUME, UNCONVENTIONAL_RESUME, MINIMAL_RESUME]) {
      const { result } = analyse(text);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      for (const dimension of result.dimensions) {
        expect(dimension.score).toBeGreaterThanOrEqual(0);
        expect(dimension.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('skips the keyword dimension when no job advert is supplied', () => {
    const withoutJob = analyse(STRONG_RESUME).result;
    const keywords = withoutJob.dimensions.find((d) => d.dimension === 'keywords');

    expect(keywords?.rulesRun).toBe(0);
    expect(keywords?.rulesSkipped).toBeGreaterThan(0);
    expect(ruleIds(withoutJob.findings)).not.toContain('missing-required-skills');
  });
});

describe('findings are actionable', () => {
  it('reports the real problems in a weak resume', () => {
    const ids = ruleIds(analyse(WEAK_RESUME).result.findings);

    expect(ids).toContain('bullets-not-quantified');
    expect(ids).toContain('weak-bullet-openings');
    expect(ids).toContain('cliches');
    expect(ids).toContain('protected-personal-data');
    expect(ids).toContain('salary-expectations-stated');
  });

  it('does not invent problems in a strong resume', () => {
    const ids = ruleIds(analyse(STRONG_RESUME).result.findings);

    expect(ids).not.toContain('bullets-not-quantified');
    expect(ids).not.toContain('weak-bullet-openings');
    expect(ids).not.toContain('cliches');
    expect(ids).not.toContain('missing-contact-email');
    expect(ids).not.toContain('english-level-not-stated');
  });

  it('anchors findings into the resume text so the UI can highlight them', () => {
    const { document, result } = analyse(WEAK_RESUME);
    const anchored = result.findings.filter((finding) =>
      finding.anchors.some((anchor) => anchor.span),
    );

    expect(anchored.length).toBeGreaterThan(0);

    for (const finding of anchored) {
      for (const anchor of finding.anchors) {
        if (!anchor.span) continue;
        expect(anchor.span.start).toBeGreaterThanOrEqual(0);
        expect(anchor.span.end).toBeLessThanOrEqual(document.plainText.length);
        expect(anchor.span.end).toBeGreaterThan(anchor.span.start);
      }
    }
  });
});

describe('the header block', () => {
  /*
   * Regression guard. The candidate name is normally the boldest, largest line
   * on the page, which is exactly what heading detection looks for. Promoting
   * it to a section heading moved it out of the header block -- the one place
   * the name parser reads -- and the report then told a named candidate that no
   * name could be found.
   */
  const HEADER_RESUME = [
    'Urzhan Rysbek',
    '+7702-933-17-44| urzhan@example.com |',
    'linkedin.com/in/urzhan-rysbek |',
    '',
    'WORK EXPERIENCE',
    'SDU | Lecturer Assistant | Sep 2020 - January 2022',
    '- Created reporting sheets used by 40 students',
    '- Built dynamic presentations for report analysis',
    '',
    'SKILLS',
    'JavaScript, React, SQL',
  ].join('\n');

  /** What a PDF yields: the name set bold and larger than the body text. */
  const BOLD_NAME_LINES = [
    {
      text: 'Urzhan Rysbek',
      page: 1,
      x: 0.1,
      y: 0.05,
      width: 0.3,
      fontSizeRatio: 0.03,
      fontFamilies: ['Arial'],
      isBold: true,
      innerGaps: 0,
    },
    {
      text: '+7702-933-17-44| urzhan@example.com |',
      page: 1,
      x: 0.1,
      y: 0.09,
      width: 0.5,
      fontSizeRatio: 0.014,
      fontFamilies: ['Arial'],
      isBold: false,
      innerGaps: 0,
    },
    {
      text: 'linkedin.com/in/urzhan-rysbek |',
      page: 1,
      x: 0.1,
      y: 0.12,
      width: 0.4,
      fontSizeRatio: 0.014,
      fontFamilies: ['Arial'],
      isBold: false,
      innerGaps: 0,
    },
    {
      text: 'WORK EXPERIENCE',
      page: 1,
      x: 0.1,
      y: 0.18,
      width: 0.3,
      fontSizeRatio: 0.02,
      fontFamilies: ['Arial'],
      isBold: true,
      innerGaps: 0,
    },
  ];

  it('finds the name even when it is set like a heading', () => {
    const segmentation = segmentResume(HEADER_RESUME, BOLD_NAME_LINES);
    const headings = segmentation.sections
      .map((section) => section.rawHeading)
      .filter((heading): heading is string => heading !== null);

    expect(headings).not.toContain('Urzhan Rysbek');

    const document = buildResumeDocument({
      extraction: {
        format: 'pdf',
        plainText: HEADER_RESUME,
        lines: BOLD_NAME_LINES,
        warnings: [],
        layout: {
          hasTextLayer: true,
          textCharCount: HEADER_RESUME.length,
          pageCount: 1,
          maxColumnsPerPage: 1,
          multiColumnPages: [],
          tableCount: 0,
          imageCount: 0,
          hasLikelyPhoto: false,
          hasHeaderFooterContent: false,
          headerFooterSamples: [],
          fontFamilies: ['Arial'],
          nonStandardFonts: [],
          hasProblematicGlyphs: false,
          problematicGlyphSamples: [],
          embeddedLinks: [],
          textBoxCount: 0,
        },
      },
      file: { name: 'cv.pdf', sizeBytes: HEADER_RESUME.length },
      extractionMs: 0,
    });

    expect(document.contacts.fullName).toBe('Urzhan Rysbek');
    expect(document.contacts.email).toBe('urzhan@example.com');
  });

  it('does not report a missing name for a resume that has one', () => {
    const document = buildResumeDocument({
      extraction: {
        format: 'pdf',
        plainText: HEADER_RESUME,
        lines: BOLD_NAME_LINES,
        warnings: [],
        layout: {
          hasTextLayer: true,
          textCharCount: HEADER_RESUME.length,
          pageCount: 1,
          maxColumnsPerPage: 1,
          multiColumnPages: [],
          tableCount: 0,
          imageCount: 0,
          hasLikelyPhoto: false,
          hasHeaderFooterContent: false,
          headerFooterSamples: [],
          fontFamilies: ['Arial'],
          nonStandardFonts: [],
          hasProblematicGlyphs: false,
          problematicGlyphSamples: [],
          embeddedLinks: [],
          textBoxCount: 0,
        },
      },
      file: { name: 'cv.pdf', sizeBytes: HEADER_RESUME.length },
      extractionMs: 0,
    });

    const result = analyseResume(document, { now: new Date('2026-01-15T00:00:00.000Z') });
    expect(ruleIds(result.findings)).not.toContain('missing-candidate-name');
  });

  it('still honours a heading the vocabulary recognises on the first line', () => {
    const text = ['SUMMARY', 'Frontend engineer with eight years of experience.'].join('\n');
    const sections = segmentResume(text).sections;
    expect(sections.some((section) => section.kind === 'summary')).toBe(true);
  });
});

describe('unconventional resumes', () => {
  it('finds sections without any recognisable headings', () => {
    const { document } = analyse(UNCONVENTIONAL_RESUME);
    const kinds = document.sections.map((section) => section.kind);

    expect(kinds).toContain('experience');
    expect(document.experience.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts contacts from a single slash-separated header line', () => {
    const { document } = analyse(UNCONVENTIONAL_RESUME);

    expect(document.contacts.email).toBe('dana@example.com');
  });

  it('does not collapse to zero just because the format is unusual', () => {
    const unconventional = analyse(UNCONVENTIONAL_RESUME).result;
    const minimal = analyse(MINIMAL_RESUME).result;

    // Good content in an odd wrapper must still beat genuinely empty content.
    expect(unconventional.overallScore).toBeGreaterThan(minimal.overallScore);
  });

  it('reads dates written as words rather than digits', () => {
    const { document } = analyse(UNCONVENTIONAL_RESUME);
    const dated = document.experience.filter((item) => item.period !== null);

    expect(dated.length).toBeGreaterThanOrEqual(2);
  });
});

describe('job matching', () => {
  it('raises missing required skills when the resume lacks them', () => {
    const ids = ruleIds(analyse(WEAK_RESUME, SAMPLE_JOB_AD).result.findings);
    expect(ids).toContain('missing-required-skills');
  });

  it('separates required from nice-to-have requirements', () => {
    const job = parseJobDescription(SAMPLE_JOB_AD);
    const required = job.skills.filter((skill) => skill.required).map((s) => s.canonical);
    const optional = job.skills.filter((skill) => !skill.required).map((s) => s.canonical);

    expect(required).toContain('TypeScript');
    expect(required).toContain('React');
    expect(optional).toContain('GraphQL');
    expect(optional).not.toContain('TypeScript');
  });

  it('reads the seniority of the vacancy', () => {
    expect(parseJobDescription(SAMPLE_JOB_AD).seniority).toBe('senior');
  });

  it('scores a matching resume higher against the same advert', () => {
    const strong = analyse(STRONG_RESUME, SAMPLE_JOB_AD).result;
    const weak = analyse(WEAK_RESUME, SAMPLE_JOB_AD).result;

    const keywordScore = (result: typeof strong) =>
      result.dimensions.find((d) => d.dimension === 'keywords')?.score ?? 0;

    expect(keywordScore(strong)).toBeGreaterThan(keywordScore(weak));
  });
});
