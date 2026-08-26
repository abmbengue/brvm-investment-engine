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

export const COMPANY_NAME_UNAVAILABLE = 'Nom indisponible';

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

export function formatSymbolLabel(symbol) {
  const name = getCompanyName(symbol);
  return name === COMPANY_NAME_UNAVAILABLE ? String(symbol || '') : `${symbol} — ${name}`;
}
