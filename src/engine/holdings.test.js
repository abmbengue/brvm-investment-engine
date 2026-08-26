import { describe, it, expect } from 'vitest';
import { normalizeHoldings, markHoldings } from './holdings.js';
import { allocate, selectPortfolio } from './portfolio.js';
import { runEngine } from './pipeline.js';

describe('holdings', () => {
  it('merges duplicate symbols', () => {
    const { holdings } = normalizeHoldings([
      { symbol: 'snts', shares: 10, avgCost: 1000 },
      { symbol: 'SNTS', shares: 5, avgCost: 1200 },
    ]);
    expect(holdings).toHaveLength(1);
    expect(holdings[0].shares).toBe(15);
    expect(holdings[0].avgCost).toBeCloseTo((1000 * 10 + 1200 * 5) / 15);
  });

  it('marks to market without inventing price', () => {
    const marked = markHoldings(
      [{ symbol: 'SNTS', shares: 10, avgCost: 1000 }],
      new Map([['SNTS', 1500]])
    );
    expect(marked.marketValue).toBe(15000);
    expect(marked.pnl).toBe(5000);

    const missing = markHoldings([{ symbol: 'XXXX', shares: 1, avgCost: 10 }], new Map());
    expect(missing.positions[0].priced).toBe(false);
    expect(missing.marketValue).toBe(0);
  });
});

describe('allocation with existing holdings', () => {
  it('proposes ADD on held name and uses spot cash', () => {
    const rankedLike = [
      {
        symbol: 'SNTS',
        score: 80,
        confidence: 0.9,
        dataQuality: 0.9,
        positives: [],
        negatives: [],
        feature: { price: 1000, volume: 100, liquidity: 1, observations: 10, dataQuality: 0.9 },
      },
      {
        symbol: 'BOAB',
        score: 70,
        confidence: 0.8,
        dataQuality: 0.8,
        positives: [],
        negatives: [],
        feature: { price: 500, volume: 100, liquidity: 0.8, observations: 10, dataQuality: 0.8 },
      },
    ];
    const sel = selectPortfolio(rankedLike, 'equilibre', ['SNTS']);
    const marked = markHoldings([{ symbol: 'SNTS', shares: 10, avgCost: 900 }], new Map([['SNTS', 1000]]));
    const alloc = allocate(sel.selected, 5_000_000, 'equilibre', marked);
    expect(alloc.spotCash).toBe(5_000_000);
    expect(alloc.existingMarketValue).toBe(10_000);
    expect(alloc.proposedBuys.length).toBeGreaterThan(0);
    const snts = alloc.positions.find((p) => p.symbol === 'SNTS');
    expect(snts.alreadyHeld).toBe(true);
    expect(snts.existingShares).toBe(10);
  });
});

describe('engine holdings wiring', () => {
  it('exposes holdings and totalWealthNow', () => {
    const csv = {
      ok: true,
      rows: [
        { date: '2024-01-01', symbol: 'SNTS', close: 1000, volume: 100, pe: null, dividendYield: null, roe: null, revenueGrowth: null, debtEquity: null },
        { date: '2024-01-02', symbol: 'SNTS', close: 1100, volume: 120, pe: 10, dividendYield: 0.04, roe: 0.1, revenueGrowth: 0.05, debtEquity: 0.4 },
        { date: '2024-01-01', symbol: 'BOAB', close: 500, volume: 80, pe: null, dividendYield: null, roe: null, revenueGrowth: null, debtEquity: null },
        { date: '2024-01-02', symbol: 'BOAB', close: 520, volume: 90, pe: 8, dividendYield: 0.05, roe: 0.12, revenueGrowth: 0.03, debtEquity: 0.5 },
        { date: '2024-01-01', symbol: 'ORAC', close: 2000, volume: 50, pe: null, dividendYield: null, roe: null, revenueGrowth: null, debtEquity: null },
        { date: '2024-01-02', symbol: 'ORAC', close: 2100, volume: 55, pe: 11, dividendYield: 0.03, roe: 0.15, revenueGrowth: 0.04, debtEquity: 0.3 },
      ],
      symbols: ['SNTS', 'BOAB', 'ORAC'],
      importedRows: 6,
      rejectedRows: 0,
      duplicatesRemoved: 0,
      delimiter: ',',
      meta: { mode: 'SAMPLE', live: false },
    };
    const r = runEngine({
      capital: 1_000_000,
      monthly: 0,
      years: 10,
      annualRatePct: 9,
      profileId: 'equilibre',
      csvResult: csv,
      holdings: [{ symbol: 'SNTS', shares: 100, avgCost: 1000 }],
    });
    expect(r.holdings.positionCount).toBe(1);
    expect(r.holdings.marketValue).toBe(1100 * 100);
    expect(r.totalWealthNow).toBe(1_000_000 + 110000);
    expect(r.spotCash).toBe(1_000_000);
  });
});
