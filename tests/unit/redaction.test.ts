import { beforeEach, describe, expect, it } from 'vitest';

import { enhanceRequestSchema, MAX_EXCERPTS } from '@/shared/api/enhance-contract';
import { rateLimit, resetRateLimits } from '@/shared/api/rate-limit';

import { analyseResume } from '@/entities/analysis';
import {
  assertRedacted,
  buildResumeDocument,
  extractFromText,
  redactForLlm,
  restore,
} from '@/entities/resume';
import { excerptsFor } from '@/features/llm-suggestions';

import { STRONG_RESUME, WEAK_RESUME } from '@/tests/fixtures/resumes';

/**
 * The privacy boundary, under test.
 *
 * This is the one guarantee the product makes that a user cannot verify by
 * reading the interface, so it is the one that most needs proving: nothing
 * leaving the browser carries a name, an address or a link.
 */

function parse(text: string) {
  const extracted = extractFromText(text);
  if (!extracted.ok) throw new Error(extracted.error.message);

  return buildResumeDocument({
    extraction: extracted.value,
    file: { name: 'resume.txt', sizeBytes: text.length },
    extractionMs: 0,
  });
}

const parsedResume = () => parse(STRONG_RESUME);

describe('redactForLlm', () => {
  const document = parsedResume();

  it('removes the name, email, phone and links', () => {
    const { text } = redactForLlm(document);

    expect(text).not.toContain('Aisha Karimova');
    expect(text).not.toContain('aisha.karimova@example.com');
    expect(text).not.toContain('+7 700 123 45 67');
    expect(text).not.toContain('linkedin.com/in/aishakarimova');
  });

  it('keeps everything a rewrite actually needs', () => {
    const { text } = redactForLlm(document);

    expect(text).toContain('Largest Contentful Paint');
    expect(text).toContain('12%');
    expect(text).toContain('TypeScript');
  });

  it('restores the real values on the way back', () => {
    const redacted = redactForLlm(document);
    expect(restore(redacted.text, redacted.map)).toContain('Aisha Karimova');
  });

  it('uses the same placeholder for a value across separate passes', () => {
    // Excerpt-level and document-level passes must agree, or restoring an
    // excerpt would substitute the wrong value.
    const whole = redactForLlm(document);
    const line = redactForLlm(document, 'Written by Aisha Karimova');

    const placeholder = Object.entries(whole.map.entries).find(
      ([, value]) => value === 'Aisha Karimova',
    )?.[0];

    expect(placeholder).toBeDefined();
    expect(line.text).toContain(placeholder);
  });
});

describe('assertRedacted', () => {
  const document = parsedResume();

  it('passes for text that went through redaction', () => {
    expect(() => assertRedacted(redactForLlm(document).text, document)).not.toThrow();
  });

  it('throws rather than letting a leak through quietly', () => {
    expect(() => assertRedacted('Call Aisha Karimova today', document)).toThrow(/Redaction failed/);
    expect(() => assertRedacted('write to aisha.karimova@example.com', document)).toThrow();
  });
});

describe('what the request would carry', () => {
  const document = parse(WEAK_RESUME);
  const result = analyseResume(document, { now: new Date('2026-01-15T00:00:00.000Z') });

  it('sends only the lines a finding points at', () => {
    const anchored = result.findings.find((finding) =>
      finding.anchors.some((anchor) => anchor.span),
    );
    expect(anchored).toBeDefined();

    const excerpts = excerptsFor(anchored!, document);
    expect(excerpts.length).toBeGreaterThan(0);
    expect(excerpts.length).toBeLessThanOrEqual(MAX_EXCERPTS);

    for (const excerpt of excerpts) {
      expect(document.plainText).toContain(excerpt);
    }
  });

  it('builds a payload that passes its own contract', () => {
    const anchored = result.findings.find((finding) =>
      finding.anchors.some((anchor) => anchor.span),
    )!;

    const excerpts = excerptsFor(anchored, document).map(
      (excerpt) => redactForLlm(document, excerpt).text,
    );

    const payload = {
      ruleId: anchored.ruleId,
      guidance: anchored.fix.slice(0, 600),
      excerpts,
      context: { headline: null, seniority: 'senior' as const, language: 'en' as const },
    };

    expect(enhanceRequestSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects a payload carrying more excerpts than the cap allows', () => {
    const payload = {
      ruleId: 'bullets-not-quantified',
      guidance: 'Add measurable outcomes',
      excerpts: Array.from({ length: MAX_EXCERPTS + 1 }, (_, i) => `line number ${i}`),
      context: { headline: null, seniority: 'senior' as const, language: 'en' as const },
    };

    expect(enhanceRequestSchema.safeParse(payload).success).toBe(false);
  });
});

describe('rateLimit', () => {
  beforeEach(() => resetRateLimits());

  it('allows requests up to the limit and refuses the next one', () => {
    const now = 1_000_000;

    for (let i = 0; i < 3; i += 1) {
      expect(rateLimit('ip', 3, now).allowed).toBe(true);
    }
    expect(rateLimit('ip', 3, now).allowed).toBe(false);
  });

  it('counts each caller separately', () => {
    const now = 1_000_000;
    expect(rateLimit('a', 1, now).allowed).toBe(true);
    expect(rateLimit('b', 1, now).allowed).toBe(true);
    expect(rateLimit('a', 1, now).allowed).toBe(false);
  });

  it('opens a fresh window once the old one expires', () => {
    const now = 1_000_000;
    expect(rateLimit('ip', 1, now).allowed).toBe(true);
    expect(rateLimit('ip', 1, now).allowed).toBe(false);
    expect(rateLimit('ip', 1, now + 61_000).allowed).toBe(true);
  });

  it('reports when the caller may try again', () => {
    const now = 1_000_000;
    rateLimit('ip', 1, now);
    const blocked = rateLimit('ip', 1, now + 15_000);

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(45);
  });
});
