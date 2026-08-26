import { describe, it, expect } from 'vitest';
import {
  buildDecisionsExportRows,
  buildAllocationExportRows,
  buildPortfolioExportRows,
  exportAnalysisCsv,
} from './exportAnalysis.js';

const sample = {
  engineVersion: '7.5.0',
  spotCash: 1_000_000,
  capital: 1_000_000,
  dataStatus: { mode: 'INTERNAL', asOf: '2026-08-24', live: false },
  decisions: [
    {
      symbol: 'SNTS',
      action: 'BUY',
      score: 72,
      confidence: 0.6,
      dataQuality: 0.7,
      risk: 'marché',
      justification: 'Score élevé',
      invalidation: 'Score < 55',
    },
  ],
  allocation: {
    positions: [
      {
        symbol: 'SNTS',
        weightPct: 10,
        targetWeightPct: 12,
        amount: 100000,
        targetAmount: 120000,
        buyAmount: 20000,
        shares: 5,
        buyShares: 1,
        score: 72,
        confidence: 0.6,
        dataQuality: 0.7,
        alreadyHeld: false,
      },
    ],
  },
  holdings: {
    positions: [{ symbol: 'SNTS', shares: 4, avgCost: 10000, price: 12000, marketValue: 48000, pnl: 8000 }],
  },
};

describe('exportAnalysis', () => {
  it('stamps mode asOf and Pas LIVE on decisions', () => {
    const rows = buildDecisionsExportRows(sample);
    expect(rows[0].data_mode).toBe('INTERNAL');
    expect(rows[0].asOf).toBe('2026-08-24');
    expect(rows[0].live).toBe('NON');
    expect(rows[0].live_policy).toMatch(/Pas LIVE/);
    expect(rows[0].action).toBe('BUY');
  });

  it('exports allocation and portfolio', () => {
    expect(buildAllocationExportRows(sample)[0].symbol).toBe('SNTS');
    const port = buildPortfolioExportRows(sample);
    expect(port.some((r) => r.section === 'CASH')).toBe(true);
    expect(port.some((r) => r.symbol === 'SNTS')).toBe(true);
  });

  it('builds downloadable csv text', () => {
    const { csv, filename, rowCount } = exportAnalysisCsv(sample, 'decisions');
    expect(csv).toContain('data_mode');
    expect(csv).toContain('INTERNAL');
    expect(filename).toMatch(/pas-LIVE/);
    expect(rowCount).toBeGreaterThan(0);
  });
});
