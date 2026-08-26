import { describe, it, expect } from 'vitest';
import {
  futureValue,
  futureValueScheduled,
  capitalContributedScheduled,
  normalizeSchedule,
  buildProjectionsScheduled,
} from './simulation.js';

describe('schedule simulation', () => {
  it('legacy futureValue still compounds lump + monthly from t0', () => {
    const a = futureValue(1_000_000, 0, 0.12, 1);
    expect(a).toBeGreaterThan(1_000_000);
  });

  it('spot after initial: delaying spot reduces FV vs investing both at t0', () => {
    const bothAtStart = futureValueScheduled({
      initialApport: 1_000_000,
      spotAmount: 1_000_000,
      monthly: 0,
      annualRate: 0.1,
      planStartYear: 2026,
      spotYear: 2026,
      recurrentStartYear: 2026,
      horizonYears: 10,
    });
    const spotLater = futureValueScheduled({
      initialApport: 1_000_000,
      spotAmount: 1_000_000,
      monthly: 0,
      annualRate: 0.1,
      planStartYear: 2026,
      spotYear: 2030,
      recurrentStartYear: 2026,
      horizonYears: 10,
    });
    expect(bothAtStart).toBeGreaterThan(spotLater);
  });

  it('recurrent start year reduces contributed months', () => {
    const full = capitalContributedScheduled({
      initialApport: 0,
      spotAmount: 0,
      monthly: 100_000,
      planStartYear: 2026,
      spotYear: 2026,
      recurrentStartYear: 2026,
      horizonYears: 2,
    });
    const delayed = capitalContributedScheduled({
      initialApport: 0,
      spotAmount: 0,
      monthly: 100_000,
      planStartYear: 2026,
      spotYear: 2026,
      recurrentStartYear: 2027,
      horizonYears: 2,
    });
    expect(full).toBe(100_000 * 24);
    expect(delayed).toBe(100_000 * 12);
  });

  it('normalizeSchedule clamps years before plan start', () => {
    const s = normalizeSchedule({
      planStartYear: 2026,
      spotYear: 2020,
      recurrentStartYear: 2019,
      horizonYears: 5,
    });
    expect(s.spotYear).toBe(2026);
    expect(s.recurrentStartYear).toBe(2026);
    expect(s.endYear).toBe(2031);
  });

  it('projections include endYear', () => {
    const p = buildProjectionsScheduled({
      initialApport: 500_000,
      spotAmount: 1_000_000,
      monthly: 50_000,
      annualRate: 0.09,
      planStartYear: 2026,
      spotYear: 2027,
      recurrentStartYear: 2028,
      horizonYears: 10,
    });
    expect(p.some((x) => x.years === 10)).toBe(true);
    expect(p.find((x) => x.years === 10).endYear).toBe(2036);
  });
});
