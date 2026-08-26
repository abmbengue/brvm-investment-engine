/**
 * Official/common BRVM company names for known tickers.
 * Source: BRVM listings / public market pages. Never invent names.
 */
export const COMPANY_NAMES = Object.freeze({
  SNTS: 'SONATEL Sénégal',
  BOAB: 'Bank of Africa — Bénin',
  ORAC: 'Orange Côte d’Ivoire',
  SGBC: 'Société Générale Côte d’Ivoire',
  ETIT: 'Ecobank Transnational Incorporated',
  CABC: 'SICABLE Côte d’Ivoire',
  ECOC: 'Ecobank Côte d’Ivoire',
  TTLC: 'TotalEnergies Marketing Côte d’Ivoire',
  SHEC: 'Vivo Energy Côte d’Ivoire',
  SIVC: 'Erium Côte d’Ivoire',
  SDCC: 'SODECI (Société de Distribution d’Eau de Côte d’Ivoire)',
  CIEC: 'CIE (Compagnie Ivoirienne d’Électricité)',
});

/**
 * Common aliases / trade names → official BRVM ticker.
 * Never invent tickers; only map known public aliases.
 */
export const SYMBOL_ALIASES = Object.freeze({
  SONATEL: 'SNTS',
  'SONATEL SENEGAL': 'SNTS',
  ORANGE: 'ORAC',
  'ORANGE CI': 'ORAC',
  'ORANGE COTE D IVOIRE': 'ORAC',
  ECOBANK: 'ETIT',
  ETI: 'ETIT',
  SODECI: 'SDCC',
  CIE: 'CIEC',
  TOTAL: 'TTLC',
  TOTALENERGIES: 'TTLC',
  'SOCIETE GENERALE': 'SGBC',
  SGCI: 'SGBC',
  SICABLE: 'CABC',
});

export const COMPANY_NAME_UNAVAILABLE = 'Nom indisponible';

function normalizeKey(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve company name for a symbol. Unknown → "Nom indisponible" (never invent).
 */
export function getCompanyName(symbol) {
  const key = String(symbol || '')
    .trim()
    .toUpperCase();
  if (!key) return COMPANY_NAME_UNAVAILABLE;
  return COMPANY_NAMES[key] || COMPANY_NAME_UNAVAILABLE;
}

/**
 * Map user input (ticker or known alias like SONATEL) → BRVM ticker.
 * Unknown input is returned uppercased (no invention of a ticker).
 */
export function resolveSymbolInput(raw) {
  const upper = String(raw || '')
    .trim()
    .toUpperCase();
  if (!upper) return '';
  if (COMPANY_NAMES[upper]) return upper;

  const soft = normalizeKey(raw);
  if (SYMBOL_ALIASES[upper]) return SYMBOL_ALIASES[upper];
  if (SYMBOL_ALIASES[soft]) return SYMBOL_ALIASES[soft];

  // Match company name / first significant token (e.g. SONATEL)
  if (soft.length >= 4) {
    for (const [ticker, name] of Object.entries(COMPANY_NAMES)) {
      const n = normalizeKey(name);
      const first = n.split(' ')[0];
      if (n === soft || n.startsWith(`${soft} `) || soft === first) {
        return ticker;
      }
    }
  }
  return upper;
}

export function formatSymbolLabel(symbol) {
  const name = getCompanyName(symbol);
  return name === COMPANY_NAME_UNAVAILABLE ? String(symbol || '') : `${symbol} — ${name}`;
}
