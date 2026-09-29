import { describe, expect, it } from 'vitest';

import { detectScript, excerpt, normalize, uppercaseRatio, wordPattern } from './text';

describe('wordPattern', () => {
  /*
   * Regression guard for a bug that disabled the Russian half of every
   * vocabulary in the product without any visible error.
   *
   * JavaScript defines `\b` over ASCII word characters, so `/\bдата\b/` finds
   * nothing at all: a Cyrillic letter is a non-word character, and the boundary
   * the pattern looks for does not exist. English patterns kept working, which
   * is what made it invisible.
   */
  it('matches Cyrillic words, where the ASCII boundary never could', () => {
    expect(/\bдата рождения\b/i.test('Дата рождения: 15.03.1996')).toBe(false);
    expect(wordPattern(['дата рождения']).test('Дата рождения: 15.03.1996')).toBe(true);
  });

  it('still matches Latin words', () => {
    expect(wordPattern(['date of birth']).test('Date of birth: 1996')).toBe(true);
  });

  it('does not match inside a longer word', () => {
    expect(wordPattern(['go']).test('Google Cloud')).toBe(false);
    expect(wordPattern(['go']).test('Go, Rust')).toBe(true);
    expect(wordPattern(['пол']).test('полотно')).toBe(false);
    expect(wordPattern(['пол']).test('пол: мужской')).toBe(true);
  });

  it('treats punctuation in an alternative literally', () => {
    expect(wordPattern(['d.o.b.']).test('D.O.B. 1990')).toBe(true);
    expect(wordPattern(['c++']).test('C++ and Rust')).toBe(true);
  });
});

describe('normalize', () => {
  it('folds the dash and quote variants that PDF exports produce', () => {
    expect(normalize('Senior — Engineer')).toBe('senior - engineer');
    expect(normalize('“Lead”')).toBe('"lead"');
    expect(normalize('it’s')).toBe("it's");
  });

  it('replaces a non-breaking space with an ordinary one', () => {
    // Built from its code point: a literal NBSP in source is invisible, and
    // the lint rule forbidding it here exists for exactly that reason.
    const nbsp = String.fromCharCode(0x00a0);
    expect(normalize(`React${nbsp}Native`)).toBe('react native');
  });
});

describe('detectScript', () => {
  it('recognises a Latin resume', () => {
    expect(detectScript('Senior Frontend Engineer').script).toBe('latin');
  });

  it('recognises a Cyrillic resume', () => {
    expect(detectScript('Ведущий инженер').script).toBe('cyrillic');
  });

  it('reports a genuine mix', () => {
    expect(detectScript('Разработчик React и TypeScript в команде').script).toBe('mixed');
  });
});

describe('uppercaseRatio', () => {
  it('ignores digits and punctuation', () => {
    expect(uppercaseRatio('EXPERIENCE 2021')).toBe(1);
    expect(uppercaseRatio('Experience')).toBeCloseTo(0.1, 1);
  });
});

describe('excerpt', () => {
  it('keeps short text intact', () => {
    expect(excerpt('Short line', 40)).toBe('Short line');
  });

  it('elides the middle of long text', () => {
    const result = excerpt('a'.repeat(200), 40);
    expect(result.length).toBe(40);
    expect(result).toContain('…');
  });
});
