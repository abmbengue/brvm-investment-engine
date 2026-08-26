/**
 * CSV import for BRVM market data.
 * Supports comma and semicolon separators.
 * Minimum: date,symbol,close,volume
 * Enriched: pe,dividendYield,roe,revenueGrowth,debtEquity
 */

const REQUIRED = ['date', 'symbol', 'close', 'volume'];

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace('dividendyield', 'dividendyield')
    .replace('revenuegrowth', 'revenuegrowth')
    .replace('debtequity', 'debtequity');
}

function detectDelimiter(text) {
  const first = String(text).split(/\r?\n/).find((l) => l.trim()) || '';
  const semis = (first.match(/;/g) || []).length;
  const commas = (first.match(/,/g) || []).length;
  return semis > commas ? ';' : ',';
}

function parseNumber(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'null' || s === '-' || s.toLowerCase() === 'na') return null;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseDate(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  // Accept YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
  let d;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s.slice(0, 10));
  else if (/^\d{2}[/-]\d{2}[/-]\d{4}/.test(s)) {
    const [dd, mm, yyyy] = s.split(/[/-]/);
    d = new Date(`${yyyy}-${mm}-${dd}`);
  } else d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Parse CSV text into normalized rows + diagnostics.
 */
export function parseCsv(text) {
  const result = {
    ok: false,
    rows: [],
    symbols: [],
    lineCount: 0,
    importedRows: 0,
    rejectedRows: 0,
    duplicatesRemoved: 0,
    errors: [],
    warnings: [],
    delimiter: ',',
  };

  if (!text || !String(text).trim()) {
    result.errors.push('Fichier CSV vide');
    return result;
  }

  const delimiter = detectDelimiter(text);
  result.delimiter = delimiter;
  const lines = String(text)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    result.errors.push('Fichier invalide : en-tête ou données manquants');
    return result;
  }

  const headersRaw = lines[0].split(delimiter).map((h) => h.trim());
  const headers = headersRaw.map(normalizeHeader);
  result.lineCount = lines.length - 1;

  const headerMap = {};
  headers.forEach((h, i) => {
    headerMap[h] = i;
  });

  // Map common aliases
  const alias = {
    date: ['date', 'datedebut', 'tradedate'],
    symbol: ['symbol', 'ticker', 'titre', 'code'],
    close: ['close', 'cloture', 'prix', 'price', 'last'],
    volume: ['volume', 'vol', 'quantite'],
    pe: ['pe', 'per'],
    dividendyield: ['dividendyield', 'dividend', 'divyield', 'rendement'],
    roe: ['roe'],
    revenuegrowth: ['revenuegrowth', 'growth', 'croissance'],
    debtequity: ['debtequity', 'debt', 'dette'],
  };

  function colIndex(key) {
    for (const a of alias[key] || [key]) {
      if (headerMap[a] !== undefined) return headerMap[a];
    }
    return -1;
  }

  for (const req of REQUIRED) {
    if (colIndex(req) < 0) {
      result.errors.push(`Colonne obligatoire manquante : ${req}`);
    }
  }
  if (result.errors.length) return result;

  const seen = new Set();
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delimiter);
    const get = (key) => {
      const idx = colIndex(key);
      return idx >= 0 ? parts[idx] : '';
    };

    const date = parseDate(get('date'));
    const symbol = String(get('symbol') || '')
      .trim()
      .toUpperCase();
    const close = parseNumber(get('close'));
    const volume = parseNumber(get('volume'));

    if (!date || !symbol) {
      result.rejectedRows += 1;
      result.warnings.push(`Ligne ${i + 1}: date/symbol invalide`);
      continue;
    }
    if (close === null || close <= 0) {
      result.rejectedRows += 1;
      result.warnings.push(`Ligne ${i + 1}: prix nul ou invalide (${symbol})`);
      continue;
    }
    if (volume === null || volume < 0) {
      result.rejectedRows += 1;
      result.warnings.push(`Ligne ${i + 1}: volume invalide (${symbol})`);
      continue;
    }
    // volume = 0 is allowed for data quality scoring but flagged
    const key = `${date}|${symbol}`;
    if (seen.has(key)) {
      result.duplicatesRemoved += 1;
      continue;
    }
    seen.add(key);

    const row = {
      date,
      symbol,
      close,
      volume,
      pe: parseNumber(get('pe')),
      dividendYield: parseNumber(get('dividendyield')),
      roe: parseNumber(get('roe')),
      revenueGrowth: parseNumber(get('revenuegrowth')),
      debtEquity: parseNumber(get('debtequity')),
    };
    rows.push(row);
  }

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.symbol.localeCompare(b.symbol)));

  result.rows = rows;
  result.importedRows = rows.length;
  result.symbols = [...new Set(rows.map((r) => r.symbol))].sort();
  result.ok = rows.length > 0;
  if (!result.ok) result.errors.push('Aucune ligne exploitable après validation');
  return result;
}
