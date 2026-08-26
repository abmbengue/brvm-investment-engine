import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseOhlcCsv, syncHistoricalInternalDb } from './historicalSync.js';
import { getAllBars, __resetMemoryDbForTests } from './internalDb.js';
import { createInternalDbProvider } from './providers/internalDbProvider.js';
import { loadMarketData } from './loadMarketData.js';

describe('historical OHLC parse', () => {
  it('parses Date,Open,High,Low,Close,Volume', () => {
    const rows = parseOhlcCsv(
      `Date,Open,High,Low,Close,Volume
2020-01-02,100,110,90,105,1000
2020-01-03,105,120,100,115,2000`,
      'SNTS'
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ symbol: 'SNTS', close: 105, volume: 1000, pe: null });
  });
});

describe('internal historical sync', () => {
  beforeEach(() => {
    __resetMemoryDbForTests();
  });

  it('builds INTERNAL db from mocked public CSVs and never LIVE', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const ticker = String(url).match(/\/data\/([A-Z0-9-]+)\//)?.[1] || 'X';
      const body = `Date,Open,High,Low,Close,Volume
2023-01-02,10,11,9,10.5,100
2023-06-01,11,12,10,11.5,120
2024-01-02,12,13,11,12.5,150`;
      return { ok: true, text: async () => body.replace('X', ticker) };
    });

    const synced = await syncHistoricalInternalDb({
      tickers: ['SNTS', 'BOAB'],
      fetchImpl,
      maxAgeDays: 365 * 5,
    });

    expect(synced.ok).toBe(true);
    expect(synced.meta.mode).toBe('INTERNAL');
    expect(synced.meta.live).toBe(false);
    expect(synced.meta.symbols).toEqual(['BOAB', 'SNTS']);

    const bars = await getAllBars();
    expect(bars.length).toBeGreaterThanOrEqual(6);

    const provider = createInternalDbProvider();
    expect(await provider.isAvailable()).toBe(true);
    const q = await provider.getQuotes();
    expect(q.meta.mode).toBe('INTERNAL');
    expect(q.meta.live).toBe(false);
  });

  it('loadMarketData prefers INTERNAL after sync', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => `Date,Open,High,Low,Close,Volume
2024-01-02,100,101,99,100,1000
2024-02-01,101,102,100,101,1100
2024-03-01,102,103,101,102,1200`,
    }));

    // Pre-sync
    await syncHistoricalInternalDb({ tickers: ['SNTS'], fetchImpl, maxAgeDays: 1000 });

    // Stub global fetch used by loadMarketData refresh path
    vi.stubGlobal('fetch', fetchImpl);
    const loaded = await loadMarketData({ sampleUrl: null, forceHistoricalSync: false });
    expect(loaded.meta.mode).toBe('INTERNAL');
    expect(loaded.liveConnected).toBe(false);
    expect(loaded.liveStatusMessage).toMatch(/Base interne/i);
    vi.unstubAllGlobals();
  });
});
