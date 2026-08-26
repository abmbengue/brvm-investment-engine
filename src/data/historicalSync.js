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

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * As-of date for the working universe: yesterday (J-1).
 * Never use "today" as if it were a live BRVM session.
 */
export function asOfJ1Date(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - 1);
  return ymd(d);
}

/**
 * Keep every available bar with date <= asOf (default J-1). Drop today/future.
 */
export function filterBarsThroughAsOf(rows, asOf = asOfJ1Date()) {
  return (rows || []).filter((r) => r?.date && String(r.date) <= asOf);
}

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
 * Uses ALL available history through J-1 (never LIVE, never today's session).
 */
export async function syncHistoricalInternalDb({
  tickers = CORE_TICKERS,
  fetchImpl = fetch,
  maxAgeDays = null,
  now = new Date(),
} = {}) {
  const errors = [];
  const warnings = [];
  const allRaw = [];
  const asOf = asOfJ1Date(now);

  for (const ticker of tickers) {
    try {
      const rows = await fetchPublicHistory(ticker, { fetchImpl });
      if (!rows.length) {
        warnings.push(`${ticker}: fichier vide`);
        continue;
      }
      // Optional lower bound only — default is full history
      let use = rows;
      if (maxAgeDays != null) {
        const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        cutoff.setDate(cutoff.getDate() - maxAgeDays);
        const cut = ymd(cutoff);
        use = rows.filter((r) => r.date >= cut);
        if (!use.length) use = rows.slice(-250);
      }
      // Hard stop: never include today or future (J-1 max)
      use = filterBarsThroughAsOf(use, asOf);
      if (!use.length) {
        warnings.push(`${ticker}: aucune barre <= ${asOf} (J-1)`);
        continue;
      }
      allRaw.push(...use);
    } catch (e) {
      errors.push(`${ticker}: ${e.message}`);
    }
  }

  const norm = normalizeDataset(allRaw);
  const lastDate = norm.rows.length ? norm.rows[norm.rows.length - 1].date : null;
  const meta = {
    sourceId: 'internal-historical',
    sourceLabel: 'Base interne (historique public jusqu’à J-1)',
    mode: DATA_MODES.INTERNAL,
    live: false,
    asOf: lastDate,
    asOfPolicy: 'J-1',
    asOfLimit: asOf,
    freshnessMinutes: null,
    retrievedAt: new Date().toISOString(),
    symbols: [...new Set(norm.rows.map((r) => r.symbol))].sort(),
    rowCount: norm.rows.length,
    note:
      'Toutes les données historiques publiques disponibles jusqu’à J-1. Pas de flux LIVE BRVM. Source: GitHub brvm-data-public.',
    upstream: 'Fredysessie/brvm-data-public',
    tickersRequested: tickers,
    tickersLoaded: [...new Set(norm.rows.map((r) => r.symbol))].sort(),
    fullHistory: maxAgeDays == null,
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
