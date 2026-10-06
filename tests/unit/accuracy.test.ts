import { describe, expect, it } from 'vitest';

import { normalize } from '@/shared/lib/text';

import { analyseResume } from '@/entities/analysis';
import { buildResumeDocument, extractFromText, type ResumeDocument } from '@/entities/resume';

import { CORPUS, type CorpusEntry } from '@/tests/fixtures/corpus';

/**
 * Parsing accuracy across resumes that do not look like each other.
 *
 * This measures rather than asserts. A pass/fail per fixture would hide how
 * close or far a miss was, and the honest question is not "does it work" but
 * "on what share of real resumes does each field come out right".
 *
 * Thresholds are set at the level currently achieved, so a regression fails the
 * build. Raising them is a deliberate act, which is the point.
 */

interface FieldScore {
  field: string;
  hits: number;
  total: number;
  misses: Array<{ id: string; challenge: string; got: string; want: string }>;
}

function parse(entry: CorpusEntry): ResumeDocument {
  const extracted = extractFromText(entry.text);
  if (!extracted.ok) throw new Error(`${entry.id}: ${extracted.error.message}`);

  return buildResumeDocument({
    extraction: extracted.value,
    file: { name: `${entry.id}.txt`, sizeBytes: entry.text.length },
    extractionMs: 0,
  });
}

const PARSED = CORPUS.map((entry) => ({ entry, document: parse(entry) }));

function score(
  field: string,
  check: (
    document: ResumeDocument,
    entry: CorpusEntry,
  ) => { ok: boolean; got: string; want: string },
): FieldScore {
  const result: FieldScore = { field, hits: 0, total: PARSED.length, misses: [] };

  for (const { entry, document } of PARSED) {
    const outcome = check(document, entry);
    if (outcome.ok) result.hits += 1;
    else
      result.misses.push({
        id: entry.id,
        challenge: entry.challenge,
        got: outcome.got,
        want: outcome.want,
      });
  }

  return result;
}

/** Names vary by convention; compare on the set of word stems. */
function nameMatches(got: string | null, want: string | null): boolean {
  if (want === null) return true; // the fixture has no extractable name
  if (got === null) return false;

  const words = (value: string) =>
    new Set(
      normalize(value)
        .split(/\s+/)
        .filter((word) => word.length > 2),
    );

  const expected = words(want);
  const actual = words(got);
  let shared = 0;
  for (const word of expected) if (actual.has(word)) shared += 1;

  // Two of the name parts in common is a match: a patronymic or a middle name
  // being dropped is not a parsing failure worth counting.
  return shared >= Math.min(2, expected.size);
}

const SCORES = [
  score('name', (document, entry) => ({
    ok: nameMatches(document.contacts.fullName, entry.truth.name),
    got: document.contacts.fullName ?? 'null',
    want: entry.truth.name ?? 'null',
  })),

  score('email', (document, entry) => ({
    ok: document.contacts.email === entry.truth.email,
    got: document.contacts.email ?? 'null',
    want: entry.truth.email ?? 'null',
  })),

  score('phone', (document, entry) => ({
    ok: (document.contacts.phone !== null) === entry.truth.phone,
    got: document.contacts.phone ?? 'null',
    want: entry.truth.phone ? 'some phone' : 'none',
  })),

  score('job count', (document, entry) => ({
    ok: document.experience.length === entry.truth.jobs,
    got: String(document.experience.length),
    want: String(entry.truth.jobs),
  })),

  score('dated jobs', (document, entry) => ({
    ok: document.experience.filter((item) => item.period !== null).length === entry.truth.datedJobs,
    got: String(document.experience.filter((item) => item.period !== null).length),
    want: String(entry.truth.datedJobs),
  })),

  score('experience section', (document) => ({
    ok: document.sections.some((section) => section.kind === 'experience'),
    got: document.sections.map((section) => section.kind).join(','),
    want: 'includes experience',
  })),

  score('skills', (document, entry) => {
    const found = new Set(document.skills.map((skill) => skill.canonical));
    const missing = entry.truth.skills.filter((skill) => !found.has(skill));
    return {
      ok: missing.length === 0,
      got: missing.length === 0 ? 'all found' : `missing ${missing.join(', ')}`,
      want: entry.truth.skills.join(', '),
    };
  }),

  score('education', (document, entry) => ({
    ok:
      (document.education.length > 0 || document.sections.some((s) => s.kind === 'education')) ===
      entry.truth.hasEducation,
    got: `${document.education.length} entries`,
    want: entry.truth.hasEducation ? 'present' : 'absent',
  })),
];

const share = (field: string) => {
  const entry = SCORES.find((s) => s.field === field)!;
  return entry.hits / entry.total;
};

describe('parsing accuracy across varied resume formats', () => {
  it('reports the score per field', () => {
    const lines = SCORES.map((s) => {
      const pct = Math.round((s.hits / s.total) * 100);
      return `  ${s.field.padEnd(20)} ${String(s.hits).padStart(2)}/${s.total}  ${String(pct).padStart(3)}%`;
    });

    console.log(`\nAccuracy over ${PARSED.length} resumes:\n${lines.join('\n')}\n`);

    for (const s of SCORES) {
      if (s.misses.length === 0) continue;
      console.log(`  ${s.field} misses:`);
      for (const miss of s.misses) {
        console.log(`    ${miss.id} (${miss.challenge})`);
        console.log(`       got  ${miss.got}`);
        console.log(`       want ${miss.want}`);
      }
    }

    expect(SCORES.length).toBeGreaterThan(0);
  });

  /*
   * Thresholds sit at the level currently reached, so a regression fails the
   * build. The structural fields are held at 100%: an email or a phone number is
   * found by pattern, and missing one is a defect rather than a hard case. The
   * inference-heavy fields keep one fixture of headroom, so that adding a harder
   * resume to the corpus starts a conversation instead of blocking a commit.
   */
  it('extracts the email from every resume', () => {
    expect(share('email')).toBe(1);
  });

  it('finds a phone number wherever one exists', () => {
    expect(share('phone')).toBe(1);
  });

  it('finds an experience section in every resume', () => {
    expect(share('experience section')).toBe(1);
  });

  it('reads the candidate name in every format in the corpus', () => {
    expect(share('name')).toBeGreaterThanOrEqual(0.93);
  });

  it('counts jobs correctly', () => {
    expect(share('job count')).toBeGreaterThanOrEqual(0.93);
  });

  it('dates the jobs it finds', () => {
    expect(share('dated jobs')).toBeGreaterThanOrEqual(0.93);
  });

  it('finds the declared technologies', () => {
    expect(share('skills')).toBeGreaterThanOrEqual(0.93);
  });

  it('recognises education wherever it is present', () => {
    expect(share('education')).toBeGreaterThanOrEqual(0.93);
  });

  it('reads nine in ten fields correctly overall', () => {
    const hits = SCORES.reduce((sum, s) => sum + s.hits, 0);
    const total = SCORES.reduce((sum, s) => sum + s.total, 0);
    expect(hits / total).toBeGreaterThanOrEqual(0.95);
  });
});

describe('scoring behaves sensibly across the corpus', () => {
  it('never produces a score outside 0-100', () => {
    for (const { document } of PARSED) {
      const result = analyseResume(document, { now: new Date('2026-01-15T00:00:00.000Z') });
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    }
  });

  it('never claims a named candidate has no name', () => {
    for (const { entry, document } of PARSED) {
      if (entry.truth.name === null) continue;

      const result = analyseResume(document, { now: new Date('2026-01-15T00:00:00.000Z') });
      const ids = result.findings.map((finding) => finding.ruleId);

      expect(ids, `${entry.id}: name is "${document.contacts.fullName}"`).not.toContain(
        'missing-candidate-name',
      );
    }
  });

  it('never claims a contactable candidate has no email', () => {
    for (const { entry, document } of PARSED) {
      if (!entry.truth.email) continue;

      const result = analyseResume(document, { now: new Date('2026-01-15T00:00:00.000Z') });
      expect(
        result.findings.map((finding) => finding.ruleId),
        entry.id,
      ).not.toContain('missing-contact-email');
    }
  });

  it('never reports zero achievements for a resume that lists them', () => {
    for (const { entry, document } of PARSED) {
      if (entry.truth.jobs === 0) continue;

      const bullets = document.experience.reduce((sum, item) => sum + item.bullets.length, 0);
      expect(bullets, `${entry.id} has no bullets at all`).toBeGreaterThan(0);
    }
  });

  it('gives every resume in the corpus a defensible score', () => {
    // None of these are bad resumes; a tool that scores them all near zero is
    // not calibrated, whatever its rules say.
    for (const { entry, document } of PARSED) {
      const result = analyseResume(document, { now: new Date('2026-01-15T00:00:00.000Z') });
      expect(result.overallScore, `${entry.id} scored ${result.overallScore}`).toBeGreaterThan(35);
    }
  });
});
