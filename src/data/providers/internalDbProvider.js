import { DATA_MODES } from '../types.js';
import { toCsvCompat } from '../normalize.js';
import { getAllBars, getDbSummary } from '../internalDb.js';
import { assertProviderShape } from '../DataProvider.js';
import { asOfJ1Date, filterBarsThroughAsOf } from '../historicalSync.js';

/**
 * Reads the local internal historical database for the Predictor.
 * Always clips to J-1 — never treats data as BRVM LIVE.
 */
export function createInternalDbProvider() {
  async function load() {
    const bars = await getAllBars();
    const summary = await getDbSummary();
    const asOfLimit = asOfJ1Date();
    const clipped = filterBarsThroughAsOf(bars, asOfLimit);
    const sorted = [...clipped].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.symbol.localeCompare(b.symbol)
    );
    const meta = {
      sourceId: 'internal-db',
      sourceLabel: 'Base interne historique jusqu’à J-1',
      mode: DATA_MODES.INTERNAL,
      live: false,
      asOf: sorted.length ? sorted[sorted.length - 1].date : null,
      asOfPolicy: 'J-1',
      asOfLimit,
      freshnessMinutes: null,
      retrievedAt: new Date().toISOString(),
      symbols: [...new Set(sorted.map((b) => b.symbol))].sort(),
      rowCount: sorted.length,
      note:
        summary.note ||
        'Lecture de la base interne jusqu’à J-1. Pas de flux LIVE BRVM.',
      upstream: summary.upstream || null,
      updatedAt: summary.updatedAt || null,
      fullHistory: summary.fullHistory === true,
    };
    const csvCompat = toCsvCompat(sorted, meta);
    return {
      ok: csvCompat.ok,
      available: csvCompat.ok,
      rows: sorted,
      meta,
      errors: csvCompat.ok ? [] : ['Base interne vide'],
      warnings: [],
      csvCompat,
    };
  }

  const provider = {
    id: 'internal-db',
    label: 'Base interne historique',

    async isAvailable() {
      const s = await getDbSummary();
      return (s.rowCount || 0) > 0;
    },

    async getMetadata() {
      const s = await getDbSummary();
      return {
        sourceId: 'internal-db',
        sourceLabel: 'Base interne historique',
        mode: DATA_MODES.INTERNAL,
        live: false,
        asOf: null,
        freshnessMinutes: null,
        retrievedAt: new Date().toISOString(),
        symbols: s.symbols || [],
        rowCount: s.rowCount || 0,
        note: s.note || 'Base interne',
        updatedAt: s.updatedAt || null,
      };
    },

    getQuotes() {
      return load();
    },

    getHistory() {
      return load();
    },

    getFundamentals() {
      return load();
    },
  };

  assertProviderShape(provider);
  return provider;
}
