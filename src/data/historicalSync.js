import { normalizeDataset, toCsvCompat } from './normalize.js';
import { DATA_MODES } from './types.js';
import { upsertBars } from './internalDb.js';

/** Core liquid universe for the internal working DB (historical public files). */
export const CORE_TICKERS = [
  'SNTS',
  'BOAB',
  'ORAC',
  'SGBC',
  'ETIT',
  'CABC',
  'ECOC',
  'TTLC',
  'SHEC',
  'SIVC',
  'SDCC',
  'CIEC',
];

const RAW_BASE =
  'https://raw.githubusercontent.com/Fredysessie/brvm-data-public/main/data';

/**
 * Parse Yahoo/public OHLC CSV (Date,Open,High,Low,Close,Volume) → raw rows.
 */
export function parseOhlcCsv(text, symbol) {
  const lines = String(text || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length < 2) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 6) continue;
    const date = parts[0].trim();
    const close = Number(parts[4]);
    const volume = Number(parts[5]);
    if (!date || !(close > 0) || !Number.isFinite(volume) || volume < 0) continue;
    rows.push({
      date,
      symbol,
      close,
      volume,
      pe: null,
      dividendYield: null,
      roe: null,
      revenueGrowth: null,
      debtEquity: null,
    });
  }
  return rows;
}

/**
 * Fetch historical daily series for one ticker from the public GitHub dataset.
 * Source: community-published historical CSVs (NOT an official BRVM live feed).
 */
export async function fetchPublicHistory(ticker, { fetchImpl = fetch } = {}) {
  const url = `${RAW_BASE}/${ticker}/${ticker}.daily.csv`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`${ticker}: HTTP ${res.status}`);
  const text = await res.text();
  return parseOhlcCsv(text, ticker);
}

/**
 * Build/refresh the internal DB from public historical summaries.
 * Returns provider-shaped result for the engine. Mode = INTERNAL (never LIVE).
 */
export async function syncHistoricalInternalDb({
  tickers = CORE_TICKERS,
  fetchImpl = fetch,
  maxAgeDays = null,
} = {}) {
  const errors = [];
  const warnings = [];
  const allRaw = [];

  for (const ticker of tickers) {
    try {
      const rows = await fetchPublicHistory(ticker, { fetchImpl });
      if (!rows.length) {
        warnings.push(`${ticker}: fichier vide`);
        continue;
      }
      // Optional trim: keep last N years if maxAgeDays set
      let use = rows;
      if (maxAgeDays != null) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - maxAgeDays);
        const cut = cutoff.toISOString().slice(0, 10);
        use = rows.filter((r) => r.date >= cut);
        if (!use.length) use = rows.slice(-250); // fallback recent window
      }
      allRaw.push(...use);
    } catch (e) {
      errors.push(`${ticker}: ${e.message}`);
    }
  }

  const norm = normalizeDataset(allRaw);
  const meta = {
    sourceId: 'internal-historical',
    sourceLabel: 'Base interne (historique public)',
    mode: DATA_MODES.INTERNAL,
    live: false,
    asOf: norm.rows.length ? norm.rows[norm.rows.length - 1].date : null,
    freshnessMinutes: null,
    retrievedAt: new Date().toISOString(),
    symbols: [...new Set(norm.rows.map((r) => r.symbol))].sort(),
    rowCount: norm.rows.length,
    note:
      'Base de travail interne construite à partir de séries historiques publiques (GitHub brvm-data-public). Ce n’est PAS un flux BRVM live officiel.',
    upstream: 'Fredysessie/brvm-data-public',
    tickersRequested: tickers,
    tickersLoaded: [...new Set(norm.rows.map((r) => r.symbol))].sort(),
  };

  if (norm.rows.length) {
    await upsertBars(norm.rows, meta);
  }

  const csvCompat = toCsvCompat(norm.rows, meta, {
    rejected: norm.rejected,
    duplicatesRemoved: norm.duplicatesRemoved,
    errors: [...errors, ...norm.errors],
    warnings: [...warnings, ...norm.warnings],
  });

  return {
    ok: csvCompat.ok,
    available: csvCompat.ok,
    rows: norm.rows,
    meta,
    errors: csvCompat.errors,
    warnings: csvCompat.warnings,
    csvCompat,
  };
}
