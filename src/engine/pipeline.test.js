import { describe, it, expect } from 'vitest';
import { futureValue, buildProjections } from './simulation.js';
import { runEngine } from './pipeline.js';
import { parseCsv } from '../lib/csv.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('simulation recalculation', () => {
  it('changes final value when capital changes', () => {
    const a = futureValue(1_000_000, 0, 0.09, 10);
    const b = futureValue(10_000_000, 0, 0.09, 10);
    expect(b).toBeGreaterThan(a);
    expect(Math.round(b / a)).toBe(10);
  });

  it('supports horizon 100 years', () => {
    const p = buildProjections(1_000_000, 0, 0.09, 100);
    expect(p.some((x) => x.years === 100)).toBe(true);
    expect(p.at(-1).central).toBeGreaterThan(1_000_000);
  });

  it('apport 0 cases', () => {
    for (const c of [0, 1, 999, 1000, 2300000]) {
      expect(futureValue(c, 0, 0.09, 1)).toBeGreaterThanOrEqual(c);
    }
  });
});

describe('engine pipeline', () => {
  it('BLOCKED without CSV', () => {
    const r = runEngine({
      capital: 5_000_000,
      monthly: 0,
      years: 10,
      annualRatePct: 9,
      profileId: 'equilibre',
      csvResult: null,
    });
    expect(r.qualityGate.status).toBe('BLOCKED');
    expect(r.decisions[0].action).toMatch(/NO ACTION|WAIT/);
    expect(r.dataStatus.live).toBe(false);
  });

  it('profiles change allocation parameters', () => {
    const csv = parseCsv(readFileSync(join(root, 'public/sample-brvm.csv'), 'utf8'));
    const prudent = runEngine({
      capital: 10_000_000,
      monthly: 0,
      years: 10,
      annualRatePct: 9,
      profileId: 'prudent',
      csvResult: csv,
    });
    const dyn = runEngine({
      capital: 10_000_000,
      monthly: 0,
      years: 10,
      annualRatePct: 9,
      profileId: 'dynamique',
      csvResult: csv,
    });
    expect(prudent.profile.reserveRatio).toBeGreaterThan(dyn.profile.reserveRatio);
    expect(prudent.allocation.reserve).toBeGreaterThan(dyn.allocation.reserve);
  });

  it('recalc capital 1M vs 10M changes final value', () => {
    const a = runEngine({
      capital: 1_000_000,
      monthly: 0,
      years: 10,
      annualRatePct: 9,
      profileId: 'equilibre',
      csvResult: null,
    });
    const b = runEngine({
      capital: 10_000_000,
      monthly: 0,
      years: 10,
      annualRatePct: 9,
      profileId: 'equilibre',
      csvResult: null,
    });
    expect(b.finalValue).not.toBe(a.finalValue);
    expect(b.finalValue / a.finalValue).toBeCloseTo(10, 5);
  });
});
