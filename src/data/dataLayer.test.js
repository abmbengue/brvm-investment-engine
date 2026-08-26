import { describe, it, expect, vi, afterEach } from 'vitest';
import { assertProviderShape } from './DataProvider.js';
import { normalizeBar, normalizeDataset } from './normalize.js';
import { createBrvmOfficialStubProvider } from './providers/brvmOfficialStub.js';
import { createCsvProvider } from './providers/csvProvider.js';
import { createSampleProvider } from './providers/sampleProvider.js';
import { loadMarketData, loadFromCsvText } from './loadMarketData.js';
import { evaluateQualityGate } from '../engine/qualityGate.js';

describe('DataProvider contract', () => {
  it('official stub has required shape', () => {
    expect(assertProviderShape(createBrvmOfficialStubProvider())).toBe(true);
  });

  it('official stub is never live/available', async () => {
    const p = createBrvmOfficialStubProvider();
    expect(p.isAvailable()).toBe(false);
    const q = await p.getQuotes();
    expect(q.ok).toBe(false);
    expect(q.meta.live).toBe(false);
    expect(q.meta.mode).not.toBe('LIVE');
  });
});

describe('Normalizer', () => {
  it('keeps missing fundamentals as null', () => {
    const bar = normalizeBar({ date: '2024-01-02', symbol: 'snts', close: 100, volume: 10 });
    expect(bar.symbol).toBe('SNTS');
    expect(bar.pe).toBeNull();
    expect(bar.roe).toBeNull();
  });

  it('rejects invalid price', () => {
    expect(normalizeBar({ date: '2024-01-02', symbol: 'X', close: 0, volume: 1 })).toBeNull();
  });

  it('removes duplicates and sorts', () => {
    const { rows, duplicatesRemoved } = normalizeDataset([
      { date: '2024-01-03', symbol: 'A', close: 2, volume: 1 },
      { date: '2024-01-02', symbol: 'A', close: 1, volume: 1 },
      { date: '2024-01-02', symbol: 'A', close: 1, volume: 1 },
    ]);
    expect(duplicatesRemoved).toBe(1);
    expect(rows[0].date).toBe('2024-01-02');
    expect(rows[1].date).toBe('2024-01-03');
  });

  it('empty dataset errors', () => {
    const r = normalizeDataset([]);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('CSV provider', () => {
  it('parses valid CSV as non-live', async () => {
    const p = createCsvProvider(`date,symbol,close,volume
2024-01-02,SNTS,15000,1000
2024-01-03,SNTS,15100,1100`);
    const r = await p.getQuotes();
    expect(r.ok).toBe(true);
    expect(r.meta.mode).toBe('CSV');
    expect(r.meta.live).toBe(false);
  });

  it('handles empty / invalid', async () => {
    const empty = await createCsvProvider('').getQuotes();
    expect(empty.ok).toBe(false);
    const bad = await loadFromCsvText('not-a-csv');
    expect(bad.ok).toBe(false);
    expect(bad.liveConnected).toBe(false);
  });
});

describe('SAMPLE provider + fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads SAMPLE via fetch and never labels LIVE', async () => {
    const csv = `date,symbol,close,volume
2024-01-02,SNTS,15000,1000
2024-01-03,SNTS,15100,1100
2024-01-02,BOAB,4200,800
2024-01-03,BOAB,4150,900
2024-01-02,ORAC,9000,700
2024-01-03,ORAC,9100,750`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => csv }))
    );
    const loaded = await loadMarketData({ sampleUrl: '/sample-brvm.csv' });
    expect(loaded.ok).toBe(true);
    expect(loaded.meta.mode).toBe('SAMPLE');
    expect(loaded.meta.live).toBe(false);
    expect(loaded.liveConnected).toBe(false);
    expect(loaded.liveStatusMessage).toMatch(/non connectées/i);
  });

  it('falls back when SAMPLE fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    const loaded = await loadMarketData({ sampleUrl: '/missing.csv' });
    expect(loaded.ok).toBe(false);
    expect(loaded.liveConnected).toBe(false);
  });

  it('API unavailable does not crash loadMarketData', async () => {
    const official = createBrvmOfficialStubProvider();
    expect(await official.isAvailable()).toBe(false);
    const r = await loadMarketData({ sampleUrl: null, csvText: '' });
    expect(r.liveConnected).toBe(false);
    expect(r.liveStatusMessage).toMatch(/non connectées/i);
  });
});

describe('Quality Gate meta', () => {
  it('blocks SAMPLE labeled as LIVE', () => {
    const gate = evaluateQualityGate({
      csvResult: { ok: true, importedRows: 10, symbols: ['A', 'B', 'C'] },
      features: [
        { dataQuality: 0.8, observations: 10 },
        { dataQuality: 0.8, observations: 10 },
        { dataQuality: 0.8, observations: 10 },
      ],
      ranked: [
        { confidence: 0.5 },
        { confidence: 0.5 },
        { confidence: 0.5 },
      ],
      meta: { live: true, mode: 'SAMPLE', freshnessMinutes: 5 },
    });
    expect(gate.status).toBe('BLOCKED');
    expect(gate.checks.some((c) => c.id === 'live_integrity')).toBe(true);
  });

  it('warns on stale LIVE freshness', () => {
    const gate = evaluateQualityGate({
      csvResult: { ok: true, importedRows: 10, symbols: ['A', 'B', 'C'] },
      features: [
        { dataQuality: 0.8, observations: 10 },
        { dataQuality: 0.8, observations: 10 },
        { dataQuality: 0.8, observations: 10 },
      ],
      ranked: [{ confidence: 0.5 }, { confidence: 0.5 }, { confidence: 0.5 }],
      meta: { live: true, mode: 'LIVE', freshnessMinutes: 120 },
    });
    expect(gate.checks.find((c) => c.id === 'freshness').status).toBe('WARNING');
  });
});

describe('Sample provider shape', () => {
  it('satisfies contract', () => {
    expect(assertProviderShape(createSampleProvider('/x.csv'))).toBe(true);
  });
});
