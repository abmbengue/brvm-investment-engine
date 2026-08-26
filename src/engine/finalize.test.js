import { describe, it, expect } from 'vitest';
import { scoreSymbol, rankUniverse } from '../engine/predictor.js';
import { allocate, selectPortfolio } from '../engine/portfolio.js';
import { parseCsv } from '../lib/csv.js';
import { formatMoneyLabel } from '../lib/money.js';
import { runEngine } from '../engine/pipeline.js';

function feat(over = {}) {
  return {
    symbol: 'SNTS',
    price: 100,
    volume: 1000,
    observations: 30,
    dataQuality: 0.8,
    momentum: 0.05,
    liquidity: 0.5,
    volatility: 0.02,
    pe: 12,
    dividendYield: 0.04,
    roe: 0.12,
    revenueGrowth: 0.08,
    debtEquity: 0.4,
    ...over,
  };
}

describe('predictor robustness', () => {
  it('ignores NaN/Infinity fundamentals', () => {
    const s = scoreSymbol(feat({ pe: NaN, roe: Infinity, dividendYield: -Infinity }));
    expect(Number.isFinite(s.score)).toBe(true);
    expect(s.factors.every((f) => Number.isFinite(f.value))).toBe(true);
    expect(s.factors.some((f) => f.label === 'PER')).toBe(false);
  });

  it('flags insufficient history without inventing high score', () => {
    const s = scoreSymbol(feat({ observations: 1, dataQuality: 0.2, momentum: null, liquidity: null }));
    expect(s.insufficient).toBe(true);
    expect(s.score).toBeLessThanOrEqual(45);
    expect(s.qualityLabel).toBe('INSUFFICIENT');
  });
});

describe('allocation maxWeight', () => {
  it('does not breach maxWeight after capping', () => {
    const ranked = rankUniverse([
      feat({ symbol: 'A', pe: 10 }),
      feat({ symbol: 'B', pe: 10 }),
      feat({ symbol: 'C', pe: 10 }),
      feat({ symbol: 'D', pe: 10 }),
      feat({ symbol: 'E', pe: 10 }),
    ]);
    const sel = selectPortfolio(ranked, 'prudent');
    const alloc = allocate(sel.selected, 10_000_000, 'prudent');
    expect(alloc.checks.maxWeightOk).toBe(true);
    expect(alloc.targetWeightSum).toBeLessThanOrEqual(1 + 1e-6);
    for (const p of alloc.positions) {
      if (p.targetWeight != null) expect(p.targetWeight).toBeLessThanOrEqual(alloc.maxWeight + 1e-9);
    }
  });

  it('handles zero capital', () => {
    const ranked = rankUniverse([feat()]);
    const sel = selectPortfolio(ranked, 'equilibre');
    const alloc = allocate(sel.selected, 0, 'equilibre');
    expect(alloc.invested).toBe(0);
    expect(alloc.spotCash).toBe(0);
  });
});

describe('csv J-1 and diagnostics', () => {
  it('rejects future dates with clear message', () => {
    const csv = `date,symbol,close,volume
2020-01-02,SNTS,100,10
2099-01-01,SNTS,110,10`;
    const r = parseCsv(csv, { now: new Date(2026, 7, 26) });
    expect(r.ok).toBe(true);
    expect(r.importedRows).toBe(1);
    expect(r.warnings.some((w) => /J-1|2099/.test(w))).toBe(true);
    expect(r.summary.dateMax).toBe('2020-01-02');
  });

  it('reports missing close clearly', () => {
    const csv = `date,symbol,close,volume
2020-01-02,SNTS,,10`;
    const r = parseCsv(csv, { now: new Date(2026, 7, 26) });
    expect(r.ok).toBe(false);
    expect(r.warnings.some((w) => /close/.test(w))).toBe(true);
  });
});

describe('money signed label', () => {
  it('formats negative PnL', () => {
    expect(formatMoneyLabel(-1500)).toBe('-1 500 FCFA');
  });
});

describe('backtest never validated', () => {
  it('stays non-validated even with SAMPLE-like rows', () => {
    const better = [];
    const start = new Date('2023-01-01');
    for (let i = 0; i < 40; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const ds = d.toISOString().slice(0, 10);
      for (const sym of ['AAA', 'BBB', 'CCC']) {
        better.push({
          date: ds,
          symbol: sym,
          close: 100 + i + (sym === 'AAA' ? 1 : 0),
          volume: 1000,
        });
      }
    }
    const r = runEngine({
      capital: 1_000_000,
      monthly: 0,
      years: 10,
      annualRatePct: 9,
      profileId: 'equilibre',
      csvResult: {
        ok: true,
        rows: better,
        importedRows: better.length,
        symbols: ['AAA', 'BBB', 'CCC'],
        rejectedRows: 0,
        duplicatesRemoved: 0,
        delimiter: ',',
        meta: { mode: 'INTERNAL', live: false, asOf: '2023-02-09' },
      },
    });
    expect(r.backtest.validated).toBe(false);
    expect(r.backtest.status).toMatch(/NON VALIDÉ/);
  });
});
