/**
 * Normalize heterogeneous provider rows into the internal bar model.
 * Missing enriched fields remain null.
 */

function toNumberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function toDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{2}[/-]\d{2}[/-]\d{4}/.test(s)) {
    const [dd, mm, yyyy] = s.split(/[/-]/);
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * @param {object} raw
 * @returns {import('./types.js').NormalizedBar|null}
 */
export function normalizeBar(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const date = toDate(raw.date ?? raw.tradeDate ?? raw.Date);
  const symbol = String(raw.symbol ?? raw.ticker ?? raw.code ?? '')
    .trim()
    .toUpperCase();
  const close = toNumberOrNull(raw.close ?? raw.price ?? raw.last ?? raw.cloture);
  const volume = toNumberOrNull(raw.volume ?? raw.vol ?? raw.quantite);

  if (!date || !symbol || close === null || close <= 0 || volume === null || volume < 0) {
    return null;
  }

  return {
    date,
    symbol,
    close,
    volume,
    pe: toNumberOrNull(raw.pe ?? raw.per),
    dividendYield: toNumberOrNull(raw.dividendYield ?? raw.dividend ?? raw.divYield),
    roe: toNumberOrNull(raw.roe),
    revenueGrowth: toNumberOrNull(raw.revenueGrowth ?? raw.growth),
    debtEquity: toNumberOrNull(raw.debtEquity ?? raw.debt),
    marketCap: toNumberOrNull(raw.marketCap ?? raw.capitalisation),
    sharesOutstanding: toNumberOrNull(raw.sharesOutstanding ?? raw.shares),
  };
}

/**
 * Normalize + dedupe + sort. Does not invent values.
 * @param {object[]} rawRows
 */
export function normalizeDataset(rawRows) {
  const warnings = [];
  const errors = [];
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return { rows: [], warnings, errors: ['Dataset vide'], duplicatesRemoved: 0, rejected: 0 };
  }

  const seen = new Set();
  const rows = [];
  let duplicatesRemoved = 0;
  let rejected = 0;

  for (const raw of rawRows) {
    const bar = normalizeBar(raw);
    if (!bar) {
      rejected += 1;
      continue;
    }
    const key = `${bar.date}|${bar.symbol}`;
    if (seen.has(key)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(key);
    rows.push(bar);
  }

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.symbol.localeCompare(b.symbol)));

  if (!rows.length) errors.push('Aucune barre normalisable');
  if (duplicatesRemoved) warnings.push(`${duplicatesRemoved} doublons retirés`);
  if (rejected) warnings.push(`${rejected} lignes rejetées`);

  return { rows, warnings, errors, duplicatesRemoved, rejected };
}

/** Build legacy csvCompat object expected by runEngine / parseCsv consumers. */
export function toCsvCompat(rows, meta, extras = {}) {
  const symbols = [...new Set(rows.map((r) => r.symbol))].sort();
  return {
    ok: rows.length > 0,
    rows,
    symbols,
    lineCount: rows.length,
    importedRows: rows.length,
    rejectedRows: extras.rejected || 0,
    duplicatesRemoved: extras.duplicatesRemoved || 0,
    errors: extras.errors || [],
    warnings: extras.warnings || [],
    delimiter: extras.delimiter || ',',
    meta,
  };
}
