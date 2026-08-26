/**
 * HistoricalMarketData — annual BRVM composite working series (2006–2025).
 *
 * RULES:
 * - Never invent missing index levels or returns.
 * - Never expand annual points into fake daily bars.
 * - Never invent individual stock prices from the index.
 * - Never label this series LIVE.
 * - Never present this as a validated single-stock backtest.
 *
 * Future daily schema (prepared, not filled here):
 * date,symbol,open,high,low,close,volume
 */

export const SERIES_TYPES = Object.freeze({
  PRICE_INDEX: 'PRICE_INDEX',
  TOTAL_RETURN: 'TOTAL_RETURN',
  UNKNOWN: 'UNKNOWN',
});

export const QUALITY = Object.freeze({
  VERIFIED: 'VERIFIED',
  SECONDARY: 'SECONDARY',
  MISSING: 'MISSING',
});

const RETURN_RE = /([+-]?\d+(?:[.,]\d+)?)\s*%/;

function parseReturnFromNotes(notes) {
  if (!notes) return null;
  const m = String(notes).match(RETURN_RE);
  if (!m) return null;
  const n = Number(String(m[1]).replace(',', '.'));
  return Number.isFinite(n) ? n / 100 : null;
}

function parseNumberOrNull(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse annual CSV text into sorted unique year records.
 */
export function parseAnnualHistoricalCsv(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const errors = [];
  const warnings = [];
  if (lines.length < 2) {
    return {
      ok: false,
      points: [],
      errors: ['CSV annuel vide ou invalide'],
      warnings,
      meta: emptyMeta(),
    };
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = {
    year: header.indexOf('year'),
    index: header.indexOf('brvm_composite_year_end'),
    quality: header.indexOf('quality'),
    notes: header.indexOf('notes'),
  };
  if (idx.year < 0) {
    return {
      ok: false,
      points: [],
      errors: ['Colonne year manquante'],
      warnings,
      meta: emptyMeta(),
    };
  }

  const byYear = new Map();
  let duplicates = 0;

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    // notes may contain commas — rejoin tail
    const year = Number(parts[idx.year]);
    if (!Number.isFinite(year)) {
      warnings.push(`Ligne ${i + 1}: année invalide`);
      continue;
    }
    const indexYearEnd =
      idx.index >= 0 ? parseNumberOrNull(parts[idx.index]) : null;
    let quality = idx.quality >= 0 ? String(parts[idx.quality] || '').trim().toUpperCase() : '';
    const notes =
      idx.notes >= 0
        ? parts.slice(idx.notes).join(',').trim()
        : '';

    const annualReturn = parseReturnFromNotes(notes);
    if (!quality) quality = QUALITY.MISSING;
    if (![QUALITY.VERIFIED, QUALITY.SECONDARY, QUALITY.MISSING].includes(quality)) {
      quality = QUALITY.MISSING;
      warnings.push(`${year}: qualité inconnue → MISSING`);
    }
    if (indexYearEnd == null && annualReturn == null) {
      quality = QUALITY.MISSING;
    }

    const point = {
      year,
      indexYearEnd,
      annualReturn, // null if not provided — never invented from thin air
      quality,
      notes,
      seriesType: SERIES_TYPES.PRICE_INDEX,
      hasIndex: indexYearEnd != null,
      hasReturn: annualReturn != null,
    };

    if (byYear.has(year)) {
      duplicates += 1;
      // keep first, warn
      warnings.push(`Doublon année ${year} ignoré`);
      continue;
    }
    byYear.set(year, point);
  }

  const points = [...byYear.values()].sort((a, b) => a.year - b.year);

  // Derive YoY return from consecutive index levels only when both exist (not inventing)
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (cur.annualReturn == null && prev.hasIndex && cur.hasIndex && prev.indexYearEnd > 0) {
      cur.annualReturn = cur.indexYearEnd / prev.indexYearEnd - 1;
      cur.returnSource = 'DERIVED_FROM_INDEX';
    } else if (cur.annualReturn != null) {
      cur.returnSource = 'FROM_NOTES_OR_CSV';
    } else {
      cur.returnSource = 'MISSING';
    }
  }
  if (points[0] && points[0].annualReturn == null) {
    points[0].returnSource = 'MISSING';
  }

  const years = points.map((p) => p.year);
  const missingIndex = points.filter((p) => !p.hasIndex).map((p) => p.year);
  const missingReturn = points.filter((p) => p.annualReturn == null).map((p) => p.year);

  const meta = {
    ok: points.length > 0,
    live: false,
    kind: 'ANNUAL_INDEX',
    seriesType: SERIES_TYPES.PRICE_INDEX,
    label: 'BRVM Composite — historique annuel 2006–2025',
    yearCount: points.length,
    yearStart: years[0] || null,
    yearEnd: years[years.length - 1] || null,
    duplicatesRemoved: duplicates,
    missingIndexYears: missingIndex,
    missingReturnYears: missingReturn,
    qualityCounts: {
      VERIFIED: points.filter((p) => p.quality === QUALITY.VERIFIED).length,
      SECONDARY: points.filter((p) => p.quality === QUALITY.SECONDARY).length,
      MISSING: points.filter((p) => p.quality === QUALITY.MISSING).length,
    },
    stockBacktestValidated: false,
    stockBacktestMessage:
      'BACKTEST TITRES NON VALIDÉ — HISTORIQUE QUOTIDIEN INSUFFISANT',
    note:
      'Série annuelle d’indice (price index). Pas un TOTAL RETURN, pas LIVE, pas un backtest titres.',
  };

  return { ok: points.length > 0, points, errors, warnings, meta };
}

function emptyMeta() {
  return {
    ok: false,
    live: false,
    kind: 'ANNUAL_INDEX',
    seriesType: SERIES_TYPES.PRICE_INDEX,
    yearCount: 0,
    stockBacktestValidated: false,
    stockBacktestMessage:
      'BACKTEST TITRES NON VALIDÉ — HISTORIQUE QUOTIDIEN INSUFFISANT',
  };
}

/**
 * Market regimes from available annual returns only.
 */
export function detectMarketRegimes(points) {
  return (points || [])
    .filter((p) => p.annualReturn != null)
    .map((p) => {
      const r = p.annualReturn;
      let regime = 'NEUTRAL';
      if (r <= -0.2) regime = 'CRISIS';
      else if (r < -0.05) regime = 'BEAR';
      else if (r < 0.05) regime = 'NEUTRAL';
      else if (r < 0.2) regime = 'BULL';
      else regime = 'STRONG_BULL';
      return {
        year: p.year,
        annualReturn: r,
        regime,
        quality: p.quality,
      };
    });
}

/**
 * Stress calibration from observed annual returns (no invention).
 */
export function calibrateStressFromHistory(points) {
  const rets = (points || [])
    .map((p) => p.annualReturn)
    .filter((r) => r != null)
    .sort((a, b) => a - b);

  if (!rets.length) {
    return {
      ok: false,
      scenarios: [],
      message: 'Pas assez de rendements annuels pour calibrer le stress',
    };
  }

  const worst = rets[0];
  const p25 = rets[Math.floor((rets.length - 1) * 0.25)];
  const median = rets[Math.floor((rets.length - 1) * 0.5)];
  const p75 = rets[Math.floor((rets.length - 1) * 0.75)];

  return {
    ok: true,
    sampleSize: rets.length,
    scenarios: [
      { id: 'hist_crisis', label: 'Historique crise (pire année)', rate: worst },
      { id: 'hist_weak', label: 'Historique faible (P25)', rate: p25 },
      { id: 'hist_median', label: 'Historique médian', rate: median },
      { id: 'hist_favorable', label: 'Historique favorable (P75)', rate: p75 },
    ],
    seriesType: SERIES_TYPES.PRICE_INDEX,
  };
}

/**
 * Annual benchmark table for UI.
 */
export function buildAnnualBenchmark(points) {
  return (points || []).map((p) => ({
    year: p.year,
    indexYearEnd: p.indexYearEnd,
    annualReturn: p.annualReturn,
    quality: p.quality,
    seriesType: p.seriesType,
    returnSource: p.returnSource || null,
  }));
}

/**
 * Build full annual historical context (no daily invention).
 */
export function buildHistoricalContext(parsed) {
  const base = parsed || {
    ok: false,
    points: [],
    errors: [],
    warnings: [],
    meta: emptyMeta(),
  };
  const regimes = detectMarketRegimes(base.points);
  const stressCalibration = calibrateStressFromHistory(base.points);
  const benchmark = buildAnnualBenchmark(base.points);
  return {
    ...base,
    regimes,
    stressCalibration,
    benchmark,
    live: false,
    seriesType: SERIES_TYPES.PRICE_INDEX,
    stockBacktestValidated: false,
    stockBacktestMessage:
      base.meta?.stockBacktestMessage ||
      'BACKTEST TITRES NON VALIDÉ — HISTORIQUE QUOTIDIEN INSUFFISANT',
  };
}

/**
 * Load bundled annual historical file.
 */
export async function loadBundledAnnualHistory(url, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url);
  if (!res.ok) {
    return buildHistoricalContext({
      ok: false,
      points: [],
      errors: [`HTTP ${res.status}`],
      warnings: [],
      meta: emptyMeta(),
    });
  }
  const text = await res.text();
  return buildHistoricalContext(parseAnnualHistoricalCsv(text));
}

export { FUTURE_DAILY_SCHEMA } from './dailySchema.js';
