import { describe, it, expect } from 'vitest';
import { allocate, selectPortfolio, buildTargetWeights } from './portfolio.js';
import { rankUniverse } from './predictor.js';
import { getCompanyName, COMPANY_NAMES, COMPANY_NAME_UNAVAILABLE } from '../data/companyNames.js';
import { runEngine } from './pipeline.js';
import { parseCsv } from '../lib/csv.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function feat(symbol, over = {}) {
  return {
    symbol,
    price: over.price ?? 1000,
    volume: 5000,
    observations: over.observations ?? 40,
    dataQuality: over.dataQuality ?? 0.85,
    momentum: over.momentum ?? 0.04,
    liquidity: over.liquidity ?? 0.5,
    volatility: 0.02,
    pe: 12,
    dividendYield: 0.04,
    roe: 0.12,
    revenueGrowth: 0.08,
    debtEquity: 0.4,
    ...over,
  };
}

function rankedFrom(list) {
  return rankUniverse(list);
}

describe('company names', () => {
  it('maps known core tickers without inventing', () => {
    expect(getCompanyName('ETIT')).toMatch(/Ecobank/i);
    expect(getCompanyName('SNTS')).toMatch(/SONATEL/i);
    expect(getCompanyName('SGBC')).toMatch(/SOCIETE GENERALE|Société Générale/i);
    for (const sym of Object.keys(COMPANY_NAMES)) {
      expect(getCompanyName(sym)).not.toBe(COMPANY_NAME_UNAVAILABLE);
    }
  });

  it('unknown symbol → Nom indisponible', () => {
    expect(getCompanyName('ZZZZ')).toBe(COMPANY_NAME_UNAVAILABLE);
  });
});

describe('portfolio construction matrix', () => {
  it('CAS A — 50M, no holdings, several eligibles → diversified under maxWeight', () => {
    const ranked = rankedFrom(
      ['SNTS', 'BOAB', 'ORAC', 'SGBC', 'ETIT', 'CABC'].map((s, i) =>
        feat(s, { momentum: 0.05 - i * 0.002 })
      )
    );
    const sel = selectPortfolio(ranked, 'equilibre');
    const alloc = allocate(sel.selected, 50_000_000, 'equilibre');
    expect(alloc.investableSpot).toBeCloseTo(42_500_000, 0);
    expect(alloc.reserveSpot).toBeCloseTo(7_500_000, 0);
    expect(alloc.checks.maxWeightOk).toBe(true);
    expect(alloc.concentration).toBeLessThanOrEqual(0.22 + 1e-6);
    expect(alloc.positionCount).toBeGreaterThanOrEqual(4);
    const top = Math.max(...alloc.positions.map((p) => p.buyAmount || 0));
    expect(top / 50_000_000).toBeLessThan(0.3); // not 85% of capital
    expect(Math.abs(alloc.invested + alloc.residualCash - alloc.investableSpot)).toBeLessThan(1);
  });

  it('CAS B — ETIT score dominates but weight still capped', () => {
    const ranked = rankedFrom([
      feat('ETIT', { momentum: 0.25, pe: 8 }),
      feat('BOAB', { momentum: 0.01 }),
      feat('SGBC', { momentum: 0.01 }),
      feat('ORAC', { momentum: 0.01 }),
      feat('SNTS', { momentum: 0.01 }),
    ]);
    const sel = selectPortfolio(ranked, 'equilibre');
    const alloc = allocate(sel.selected, 50_000_000, 'equilibre');
    const etit = alloc.positions.find((p) => p.symbol === 'ETIT');
    expect(etit.targetWeight).toBeLessThanOrEqual(0.22 + 1e-9);
    expect(etit.weight).toBeLessThanOrEqual(0.22 + 1e-6);
    expect(etit.scoreWeightRawPct).toBeGreaterThanOrEqual(etit.targetWeightPct);
    expect(alloc.positions.filter((p) => p.buyAmount > 0).length).toBeGreaterThan(1);
  });

  it('CAS D — single eligible → diversification limited, no fake names, cash residual', () => {
    const ranked = rankedFrom([feat('ETIT', { momentum: 0.1 })]);
    const sel = selectPortfolio(ranked, 'equilibre');
    expect(sel.diversificationLimited).toBe(true);
    const alloc = allocate(sel.selected, 50_000_000, 'equilibre');
    expect(alloc.diversificationLimited).toBe(true);
    expect(alloc.diversificationNote).toMatch(/DIVERSIFICATION LIMITÉE/);
    expect(alloc.positions).toHaveLength(1);
    expect(alloc.positions[0].targetWeight).toBeLessThanOrEqual(0.22 + 1e-9);
    expect(alloc.residualCash).toBeGreaterThan(20_000_000);
  });

  it('CAS G — existing overweight ETIT cannot be aggravated beyond maxWeight', () => {
    const ranked = rankedFrom([
      feat('ETIT', { price: 100, momentum: 0.2 }),
      feat('BOAB', { price: 100, momentum: 0.05 }),
      feat('SGBC', { price: 100, momentum: 0.05 }),
    ]);
    const sel = selectPortfolio(ranked, 'equilibre', ['ETIT']);
    // Hold ETIT already ~30% of equity budget path: 15M held, 50M cash
    const marked = {
      marketValue: 15_000_000,
      positions: [
        {
          symbol: 'ETIT',
          shares: 150_000,
          price: 100,
          marketValue: 15_000_000,
          avgCost: 90,
        },
      ],
    };
    const alloc = allocate(sel.selected, 50_000_000, 'equilibre', marked);
    const etit = alloc.positions.find((p) => p.symbol === 'ETIT');
    // equityBudget = 42.5M + 15M = 57.5M; max = 22% = 12.65M — already held 15M > max → no add
    expect(etit.buyAmount).toBe(0);
    expect(etit.weight).toBeGreaterThan(0.22); // already over from holdings
  });

  it('CAS I/J — tiny and large capital reconcile amounts', () => {
    const ranked = rankedFrom(
      ['A', 'B', 'C', 'D'].map((s) => feat(s, { price: 500 }))
    );
    const sel = selectPortfolio(ranked, 'equilibre');
    for (const cap of [50_000, 500_000_000]) {
      const alloc = allocate(sel.selected, cap, 'equilibre');
      expect(alloc.checks.amountsReconciled).toBe(true);
      expect(alloc.checks.maxWeightOk).toBe(true);
    }
  });

  it('INSUFFICIENT titles rejected from new lines', () => {
    const good = feat('SNTS');
    const bad = feat('ETIT', { observations: 1, dataQuality: 0.2, momentum: null, liquidity: null });
    const ranked = rankedFrom([good, bad]);
    const sel = selectPortfolio(ranked, 'equilibre');
    expect(sel.selected.map((s) => s.symbol)).toContain('SNTS');
    expect(sel.selected.map((s) => s.symbol)).not.toContain('ETIT');
    expect(sel.rejected.some((r) => r.symbol === 'ETIT')).toBe(true);
  });

  it('buildTargetWeights never exceeds maxWeight and does not renorm a lone name to 100%', () => {
    const ranked = rankedFrom([feat('ETIT', { momentum: 0.3 })]);
    const tw = buildTargetWeights(ranked, 0.22);
    expect(tw.weights[0]).toBeCloseTo(0.22, 6);
    expect(tw.leftover).toBeCloseTo(0.78, 6);
  });
});

describe('reality check SAMPLE 50M', () => {
  it('builds multi-name portfolio under equilibre maxWeight', () => {
    const csv = parseCsv(readFileSync(join(root, 'public/sample-brvm.csv'), 'utf8'));
    const r = runEngine({
      capital: 50_000_000,
      monthly: 0,
      years: 10,
      annualRatePct: 9,
      profileId: 'equilibre',
      csvResult: csv,
    });
    expect(r.allocation.concentration).toBeLessThanOrEqual(0.22 + 0.02);
    expect(r.allocation.positions.filter((p) => p.buyAmount > 1000).length).toBeGreaterThanOrEqual(3);
    expect(r.allocation.positions.every((p) => p.companyName)).toBe(true);
    expect(r.decisions.some((d) => d.companyName && d.companyName !== '—')).toBe(true);
    const etitBuy = r.allocation.positions.find((p) => p.symbol === 'ETIT')?.buyAmount || 0;
    expect(etitBuy / 50_000_000).toBeLessThan(0.35);
  });
});
