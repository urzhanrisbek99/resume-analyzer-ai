import { describe, expect, it } from 'vitest';

import { findGaps, parseDateRange, rangeMonths, totalMonths } from './dates';

/**
 * Date parsing carries the whole narrative dimension: tenure, gaps and
 * progression are only as good as this. The cases below are the shapes real
 * resumes actually use, in both languages.
 */

describe('parseDateRange', () => {
  const cases: Array<[string, { year: number; month: number | null }, boolean]> = [
    ['Jan 2020 - Present', { year: 2020, month: 1 }, true],
    ['January 2020 - March 2022', { year: 2020, month: 1 }, false],
    ['03/2020 - 05/2022', { year: 2020, month: 3 }, false],
    ['2020 - 2022', { year: 2020, month: null }, false],
    ['2020-03 — 2022-05', { year: 2020, month: 3 }, false],
    ['март 2020 — н.в.', { year: 2020, month: 3 }, true],
    ['июнь 2018 — февраль 2021', { year: 2018, month: 6 }, false],
    ['2022 to now', { year: 2022, month: null }, true],
  ];

  it.each(cases)('parses %s', (input, expectedStart, expectedCurrent) => {
    const parsed = parseDateRange(input);
    expect(parsed).not.toBeNull();
    expect(parsed?.start).toEqual(expectedStart);
    expect(parsed?.isCurrent).toBe(expectedCurrent);
  });

  it('returns null for text that holds no date', () => {
    expect(parseDateRange('Senior Engineer')).toBeNull();
    expect(parseDateRange('')).toBeNull();
  });

  it('rejects implausible years rather than inventing a range', () => {
    expect(parseDateRange('1200 - 1300')).toBeNull();
  });
});

describe('rangeMonths', () => {
  it('counts inclusive months', () => {
    const range = parseDateRange('January 2020 - March 2020');
    expect(range && rangeMonths(range)).toBe(3);
  });

  it('measures an open range against the reference date', () => {
    const range = parseDateRange('January 2020 - Present');
    expect(range && rangeMonths(range, new Date('2020-06-15T00:00:00Z'))).toBe(6);
  });
});

describe('totalMonths', () => {
  it('does not double count overlapping periods', () => {
    const ranges = [parseDateRange('2020 - 2022'), parseDateRange('2021 - 2023')].flatMap((r) =>
      r ? [r] : [],
    );
    // 2020-01 through 2023-01 inclusive is 37 months, not 25 + 25.
    expect(totalMonths(ranges, new Date('2024-01-01T00:00:00Z'))).toBe(37);
  });
});

describe('findGaps', () => {
  it('reports a real break between jobs', () => {
    const ranges = [
      parseDateRange('January 2018 - December 2019'),
      parseDateRange('January 2021 - December 2022'),
    ].flatMap((r) => (r ? [r] : []));

    const gaps = findGaps(ranges);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.months).toBe(12);
  });

  it('treats overlapping roles as continuous, not as a gap', () => {
    const ranges = [
      parseDateRange('January 2018 - December 2020'),
      parseDateRange('June 2019 - December 2021'),
    ].flatMap((r) => (r ? [r] : []));

    expect(findGaps(ranges)).toHaveLength(0);
  });

  it('ignores a short break between jobs', () => {
    const ranges = [
      parseDateRange('January 2018 - March 2020'),
      parseDateRange('May 2020 - December 2021'),
    ].flatMap((r) => (r ? [r] : []));

    expect(findGaps(ranges)).toHaveLength(0);
  });
});
