import { describe, it, expect } from 'vitest';
import {
  normalizeHoldings,
  markHoldings,
  resolveRecentClose,
  calendarAgeDays,
  MARKET_PRICE_MAX_AGE_DAYS,
} from './holdings.js';
import { allocate, selectPortfolio } from './portfolio.js';
import { runEngine } from './pipeline.js';
import { buildFeatures } from './features.js';

describe('resolveRecentClose', () => {
  const series = [
    { date: '2026-08-20', close: 100 },
    { date: '2026-08-22', close: 110 },
    { date: '2026-08-24', close: 120 },
    { date: '2026-08-25', close: 125 },
  ];

  it('picks most recent close within 3 days of asOf', () => {
    const q = resolveRecentClose(series, '2026-08-25', 3);
    expect(q.fresh).toBe(true);
    expect(q.price).toBe(125);
    expect(q.priceDate).toBe('2026-08-25');
    expect(q.ageDays).toBe(0);
  });

  it('accepts a close up to 3 days old', () => {
    const q = resolveRecentClose(
      [
        { date: '2026-08-20', close: 100 },
        { date: '2026-08-22', close: 110 },
      ],
      '2026-08-25',
      3
    );
    expect(q.fresh).toBe(true);
    expect(q.price).toBe(110);
    expect(q.ageDays).toBe(3);
  });

  it('rejects stale closes beyond 3 days', () => {
    const q = resolveRecentClose(
      [
        { date: '2026-08-10', close: 90 },
        { date: '2026-08-15', close: 95 },
      ],
      '2026-08-25',
      3
    );
    expect(q.fresh).toBe(false);
    expect(q.price).toBeNull();
    expect(q.reason).toBe('STALE');
    expect(q.ageDays).toBeGreaterThan(MARKET_PRICE_MAX_AGE_DAYS);
  });

  it('ignores bars after asOf', () => {
    const q = resolveRecentClose(
      [
        { date: '2026-08-24', close: 120 },
        { date: '2026-08-26', close: 999 },
      ],
      '2026-08-25',
      3
    );
    expect(q.price).toBe(120);
  });

  it('calendarAgeDays works', () => {
    expect(calendarAgeDays('2026-08-22', '2026-08-25')).toBe(3);
  });
});

describe('buildFeatures price freshness', () => {
  it('nulls price when last bar is stale vs asOf', () => {
    const rows = [
      { date: '2026-08-01', symbol: 'OLD', close: 50, volume: 10 },
      { date: '2026-08-25', symbol: 'NEW', close: 80, volume: 10 },
      { date: '2026-08-24', symbol: 'NEW', close: 79, volume: 10 },
    ];
    const feats = buildFeatures(rows, { asOf: '2026-08-25', maxPriceAgeDays: 3 });
    const old = feats.find((f) => f.symbol === 'OLD');
    const neu = feats.find((f) => f.symbol === 'NEW');
    expect(old.price).toBeNull();
    expect(old.priceFresh).toBe(false);
    expect(neu.price).toBe(80);
    expect(neu.priceFresh).toBe(true);
  });
});

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

  it('rejects stale price entries for holdings MTM', () => {
    const marked = markHoldings(
      [{ symbol: 'SNTS', shares: 10, avgCost: 1000 }],
      new Map([
        [
          'SNTS',
          { price: 1500, priceDate: '2026-08-01', ageDays: 20, fresh: false, reason: 'STALE' },
        ],
      ])
    );
    expect(marked.positions[0].priced).toBe(false);
    expect(marked.marketValue).toBe(0);
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
