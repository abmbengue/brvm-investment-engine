import { describe, it, expect } from 'vitest';
import {
  buildYearlyIllustration,
  yearTickInterval,
  buildYearTicks,
  allocationPieRows,
  decisionPieRows,
  portfolioDividendYield,
} from './illustrationSeries.js';

describe('illustrationSeries', () => {
  const schedule = {
    initialApport: 1_000_000,
    spotAmount: 2_000_000,
    monthly: 100_000,
    planStartYear: 2026,
    spotYear: 2028,
    recurrentStartYear: 2027,
    horizonYears: 5,
  };

  it('builds one point per year with calendar X', () => {
    const ill = buildYearlyIllustration({ schedule, annualRate: 0.09 });
    expect(ill.years).toHaveLength(5);
    expect(ill.years[0].year).toBe(2026);
    expect(ill.years[4].year).toBe(2030);
    expect(ill.xDomain).toEqual([2026, 2030]);
  });

  it('places initial and spot on their years only', () => {
    const ill = buildYearlyIllustration({ schedule, annualRate: 0 });
    const byYear = Object.fromEntries(ill.years.map((y) => [y.year, y]));
    expect(byYear[2026].initialApport).toBe(1_000_000);
    expect(byYear[2027].initialApport).toBe(0);
    expect(byYear[2028].spot).toBe(2_000_000);
    expect(byYear[2026].spot).toBe(0);
    expect(byYear[2027].recurrent).toBe(100_000 * 12);
  });

  it('capital structure sums to contributed buckets', () => {
    const ill = buildYearlyIllustration({ schedule, annualRate: 0 });
    const sum = ill.capitalStructure.reduce((a, x) => a + x.value, 0);
    expect(sum).toBe(ill.totals.contributed);
  });

  it('omits dividends when yield unknown', () => {
    const ill = buildYearlyIllustration({ schedule, annualRate: 0.09, dividendYield: null });
    expect(ill.years.every((y) => y.dividendEst === 0)).toBe(true);
  });

  it('estimates dividends after spot year when yield known', () => {
    const ill = buildYearlyIllustration({
      schedule,
      annualRate: 0,
      holdingsMarketValue: 0,
      dividendYield: 0.05,
    });
    expect(ill.years.find((y) => y.year === 2027).dividendEst).toBe(0);
    expect(ill.years.find((y) => y.year === 2028).dividendEst).toBeGreaterThan(0);
  });

  it('yearTickInterval scales with horizon', () => {
    expect(yearTickInterval(10)).toBe(0);
    expect(yearTickInterval(30)).toBe(4);
    expect(yearTickInterval(100)).toBe(19);
  });

  it('buildYearTicks always includes start and end', () => {
    const ticks = buildYearTicks(2026, 2050, 8);
    expect(ticks[0]).toBe(2026);
    expect(ticks.at(-1)).toBe(2050);
    expect(ticks.length).toBeLessThanOrEqual(9);
    expect(buildYearTicks(2026, 2026)).toEqual([2026]);
  });
});

  it('allocation and decision pies', () => {
    expect(
      allocationPieRows({
        positions: [
          { symbol: 'SNTS', weight: 0.2 },
          { symbol: 'ETIT', weight: 0.1 },
        ],
      })
    ).toHaveLength(2);
    expect(decisionPieRows([{ action: 'BUY' }, { action: 'BUY' }, { action: 'WAIT' }])).toEqual(
      expect.arrayContaining([
        { name: 'BUY', value: 2 },
        { name: 'WAIT', value: 1 },
      ])
    );
  });

  it('portfolioDividendYield needs coverage', () => {
    expect(portfolioDividendYield({ positions: [] })).toBeNull();
    expect(
      portfolioDividendYield({
        positions: [{ weight: 0.5, dividendYield: 0.04 }],
      })
    ).toBeCloseTo(0.04);
  });
});
