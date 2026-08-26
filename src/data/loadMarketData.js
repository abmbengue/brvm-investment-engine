import { createBrvmOfficialStubProvider } from './providers/brvmOfficialStub.js';
import { createCsvProvider } from './providers/csvProvider.js';
import { createSampleProvider } from './providers/sampleProvider.js';
import { DATA_MODES } from './types.js';

/**
 * Resolve market data through the provider chain.
 * Priority when requesting live: official → (unavailable) → fallback SAMPLE/CSV.
 * Never upgrades SAMPLE/CSV to LIVE.
 */
export async function loadMarketData({
  sampleUrl,
  csvText = null,
  preferSample = false,
} = {}) {
  const official = createBrvmOfficialStubProvider();
  const sample = createSampleProvider(sampleUrl);
  const csv = createCsvProvider(csvText || '');

  const officialAvailable = await Promise.resolve(official.isAvailable());
  let liveAttempt = null;
  if (officialAvailable) {
    liveAttempt = await official.getQuotes();
  } else {
    liveAttempt = await official.getQuotes(); // still returns structured unavailable
  }

  // User CSV explicit
  if (csvText && String(csvText).trim() && !preferSample) {
    const csvResult = await csv.getQuotes();
    return finalize(csvResult, liveAttempt);
  }

  // SAMPLE fallback (default for Pages / offline)
  const sampleResult = await sample.getQuotes();
  if (sampleResult.ok) {
    return finalize(sampleResult, liveAttempt);
  }

  // Last resort: empty CSV path
  if (csvText && String(csvText).trim()) {
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
        note: 'Données temps réel non connectées.',
      },
      errors: [
        ...(liveAttempt?.errors || []),
        ...(sampleResult.errors || []),
        'Aucune source exploitable',
      ],
      warnings: [],
      csvCompat: null,
    },
    liveAttempt
  );
}

function finalize(result, liveAttempt) {
  const liveConnected = Boolean(liveAttempt?.ok && liveAttempt?.meta?.live);
  return {
    ...result,
    liveConnected,
    liveStatusMessage: liveConnected
      ? `LIVE — ${liveAttempt.meta.sourceLabel}`
      : 'Données temps réel non connectées.',
    officialErrors: liveAttempt?.errors || [],
  };
}

/** Parse user file through CSV provider only. */
export async function loadFromCsvText(csvText) {
  const csv = createCsvProvider(csvText);
  const result = await csv.getQuotes();
  return {
    ...result,
    liveConnected: false,
    liveStatusMessage: 'Données temps réel non connectées.',
    officialErrors: [],
  };
}
