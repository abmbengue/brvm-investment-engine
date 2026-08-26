import { createBrvmOfficialStubProvider } from './providers/brvmOfficialStub.js';
import { createCsvProvider } from './providers/csvProvider.js';
import { createSampleProvider } from './providers/sampleProvider.js';
import { createInternalDbProvider } from './providers/internalDbProvider.js';
import { syncHistoricalInternalDb } from './historicalSync.js';
import { DATA_MODES } from './types.js';
import { getDbSummary, upsertBars } from './internalDb.js';

const STALE_MS = 7 * 24 * 60 * 60 * 1000; // refresh weekly

/**
 * Load market data for the engine.
 * Prefer INTERNAL historical DB (built from public historical series).
 * Never upgrades anything to LIVE without an authorized feed.
 */
export async function loadMarketData({
  sampleUrl,
  csvText = null,
  preferSample = false,
  forceHistoricalSync = false,
} = {}) {
  const official = createBrvmOfficialStubProvider();
  const liveAttempt = await official.getQuotes();

  // Explicit user CSV
  if (csvText && String(csvText).trim() && !preferSample) {
    const csv = createCsvProvider(csvText);
    const csvResult = await csv.getQuotes();
    return finalize(csvResult, liveAttempt);
  }

  // Explicit SAMPLE preference
  if (preferSample && sampleUrl) {
    const sample = createSampleProvider(sampleUrl);
    const sampleResult = await sample.getQuotes();
    return finalize(sampleResult, liveAttempt);
  }

  // Ensure internal DB exists / is fresh
  const summary = await getDbSummary();
  const updatedAt = summary.updatedAt ? Date.parse(summary.updatedAt) : 0;
  const stale = !summary.rowCount || !updatedAt || Date.now() - updatedAt > STALE_MS;

  if (forceHistoricalSync || stale) {
    try {
      // Keep ~3y window for workable predictor/backtest without huge downloads
      await syncHistoricalInternalDb({ maxAgeDays: 365 * 3 });
    } catch (e) {
      // continue to fallbacks
      liveAttempt.errors = [...(liveAttempt.errors || []), `Sync historique: ${e.message}`];
    }
  }

  const internal = createInternalDbProvider();
  if (await internal.isAvailable()) {
    const internalResult = await internal.getQuotes();
    if (internalResult.ok) return finalize(internalResult, liveAttempt);
  }

  // Fallbacks
  if (sampleUrl) {
    const sample = createSampleProvider(sampleUrl);
    const sampleResult = await sample.getQuotes();
    if (sampleResult.ok) return finalize(sampleResult, liveAttempt);
  }

  if (csvText && String(csvText).trim()) {
    const csv = createCsvProvider(csvText);
    const csvResult = await csv.getQuotes();
    return finalize(csvResult, liveAttempt);
  }

  return finalize(
    {
      ok: false,
      available: false,
      rows: [],
      meta: {
        sourceId: 'none',
        sourceLabel: 'Aucune source',
        mode: DATA_MODES.NONE,
        live: false,
        asOf: null,
        freshnessMinutes: null,
        retrievedAt: new Date().toISOString(),
        symbols: [],
        rowCount: 0,
        note: 'Données temps réel non connectées. Base interne indisponible.',
      },
      errors: ['Aucune source exploitable'],
      warnings: [],
      csvCompat: null,
    },
    liveAttempt
  );
}

function finalize(result, liveAttempt) {
  const liveConnected = Boolean(liveAttempt?.ok && liveAttempt?.meta?.live);
  const mode = result.meta?.mode;
  let liveStatusMessage = 'Données temps réel non connectées.';
  if (liveConnected) liveStatusMessage = `LIVE — ${liveAttempt.meta.sourceLabel}`;
  else if (mode === DATA_MODES.INTERNAL) {
    liveStatusMessage =
      'Base interne historique active (pas un flux BRVM live officiel).';
  }

  return {
    ...result,
    liveConnected,
    liveStatusMessage,
    officialErrors: liveAttempt?.errors || [],
  };
}

/** Parse user file through CSV provider only; also merge into internal DB. */
export async function loadFromCsvText(csvText) {
  const csv = createCsvProvider(csvText);
  const result = await csv.getQuotes();
  if (result.ok && result.rows?.length) {
    await upsertBars(result.rows, {
      lastCsvImportAt: new Date().toISOString(),
      note: 'Fusion CSV utilisateur dans la base interne.',
    });
  }
  return {
    ...result,
    liveConnected: false,
    liveStatusMessage: 'Données temps réel non connectées.',
    officialErrors: [],
  };
}

/** Force rebuild of internal historical DB from public series. */
export async function refreshInternalHistoricalDb() {
  const official = createBrvmOfficialStubProvider();
  const liveAttempt = await official.getQuotes();
  const synced = await syncHistoricalInternalDb({ maxAgeDays: 365 * 3 });
  return finalize(synced, liveAttempt);
}
