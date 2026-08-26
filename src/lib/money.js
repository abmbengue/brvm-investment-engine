/**
 * Single money parsing/formatting module.
 * Rule: only one parseMoney and one formatMoney in the entire app.
 */

/** Extract digits only from any money-like string. */
export function digitsOnly(value) {
  return String(value ?? '').replace(/[^\d]/g, '');
}

/**
 * Parse a money input into a non-negative number.
 * "2 300 000" → 2300000
 * "" → 0
 * "abc" → 0
 */
export function parseMoney(value) {
  const raw = digitsOnly(value);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Format a number with explicit thousand spaces (fr-FR style, no NBSP).
 * 2300000 → "2 300 000"
 * 0 → "0"
 * empty/invalid → ""
 */
export function formatMoney(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = typeof value === 'number' ? value : parseMoney(value);
  if (!Number.isFinite(n) || n < 0) return '';
  const raw = String(Math.trunc(n));
  if (!raw || raw === 'NaN') return '';
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Display helper with currency suffix. */
export function formatMoneyLabel(value, suffix = 'FCFA') {
  const formatted = formatMoney(value);
  if (!formatted) return `0 ${suffix}`;
  return `${formatted} ${suffix}`;
}
