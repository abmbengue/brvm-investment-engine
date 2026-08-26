import { describe, expect, it } from 'vitest';
import {
  buildFeatures,
  calendarYearPriceReturns,
  computePriceAppreciation,
  geometricMeanReturn,
  yearEndCloses,
} from './features.js';

describe('price appreciation (PRICE_ONLY)', () => {
  it('computes geometric mean of calendar year returns', () => {
    // +10% then -10% → geom mean ≈ -0.5%
    expect(geometricMeanReturn([0.1, -0.1])).toBeCloseTo(Math.sqrt(1.1 * 0.9) - 1, 10);
  });

  it('takes last close per year as year-end proxy', () => {
    const ends = yearEndCloses([
      { date: '2022-06-01', close: 100 },
      { date: '2022-12-15', close: 110 },
      { date: '2023-03-01', close: 120 },
      { date: '2023-11-01', close: 132 },
    ]);
    expect(ends).toEqual([
      { year: 2022, date: '2022-12-15', close: 110 },
      { year: 2023, date: '2023-11-01', close: 132 },
    ]);
  });

  it('skips non-consecutive years', () => {
    const rets = calendarYearPriceReturns([
      { date: '2020-12-01', close: 100 },
      { date: '2022-12-01', close: 200 },
    ]);
    expect(rets).toEqual([]);
  });

  it('computes avgAnnualReturn and priceCagr without inventing dividends', () => {
    const series = [
      { date: '2022-01-01', close: 100 },
      { date: '2022-12-31', close: 110 },
      { date: '2023-12-31', close: 121 },
    ];
    const a = computePriceAppreciation(series);
    expect(a.returnBasis).toBe('PRICE_ONLY');
    expect(a.dividendsIncluded).toBe(false);
    expect(a.annualYears).toBe(1);
    expect(a.avgAnnualReturn).toBeCloseTo(0.1, 8);
    expect(a.totalReturn).toBeCloseTo(0.21, 8);
    expect(a.priceCagr).toBeCloseTo(a.annualizedReturn, 10);
  });

  it('exposes avgAnnualReturn on features', () => {
    const rows = [
      { date: '2022-12-01', symbol: 'SNTS', close: 100, volume: 10, dividendYield: null },
      { date: '2023-12-01', symbol: 'SNTS', close: 110, volume: 10, dividendYield: null },
      { date: '2024-12-01', symbol: 'SNTS', close: 121, volume: 10, dividendYield: null },
    ];
    const [f] = buildFeatures(rows, { asOf: '2024-12-01', maxPriceAgeDays: 3650 });
    expect(f.dividendYield).toBeNull();
    expect(f.dividendsIncluded).toBe(false);
    expect(f.avgAnnualReturn).toBeCloseTo(0.1, 6);
    expect(f.annualYears).toBe(2);
    expect(f.returnBasis).toBe('PRICE_ONLY');
  });
});
