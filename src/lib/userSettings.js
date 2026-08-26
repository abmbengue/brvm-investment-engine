/**
 * User settings persistence (separate from market INTERNAL IndexedDB).
 * Never stores secrets. Reset does NOT wipe market history.
 */

export const USER_SETTINGS_KEY = 'brvm-user-settings-v1';
export const USER_SETTINGS_VERSION = 1;

export const DEFAULT_USER_SETTINGS = Object.freeze({
  version: USER_SETTINGS_VERSION,
  capital: 5_000_000,
  monthly: 500_000,
  years: 25,
  rate: 9,
  profileId: 'equilibre',
  holdingRows: [{ id: 'default', symbol: '', shares: '', avgCost: '' }],
  updatedAt: null,
});

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeHoldingRows(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return [{ id: `h-${Date.now()}`, symbol: '', shares: '', avgCost: '' }];
  }
  return rows.map((r, i) => ({
    id: String(r?.id || `h-${i}-${Date.now()}`),
    symbol: String(r?.symbol || '').toUpperCase(),
    shares: String(r?.shares ?? '').replace(/[^\d]/g, ''),
    avgCost: String(r?.avgCost ?? '').replace(/[^\d.,]/g, ''),
  }));
}

/**
 * Migrate / sanitize persisted payload. Corrupted → defaults.
 */
export function normalizeUserSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_USER_SETTINGS, holdingRows: normalizeHoldingRows([]) };
  const capital = Number(raw.capital);
  const monthly = Number(raw.monthly);
  const years = Math.trunc(Number(raw.years));
  const rate = Number(raw.rate);
  return {
    version: USER_SETTINGS_VERSION,
    capital: Number.isFinite(capital) && capital >= 0 ? capital : DEFAULT_USER_SETTINGS.capital,
    monthly: Number.isFinite(monthly) && monthly >= 0 ? monthly : DEFAULT_USER_SETTINGS.monthly,
    years: Number.isFinite(years) && years >= 1 ? years : DEFAULT_USER_SETTINGS.years,
    rate: Number.isFinite(rate) ? rate : DEFAULT_USER_SETTINGS.rate,
    profileId: typeof raw.profileId === 'string' && raw.profileId ? raw.profileId : 'equilibre',
    holdingRows: normalizeHoldingRows(raw.holdingRows),
    updatedAt: raw.updatedAt || null,
  };
}

export function loadUserSettings(storage = globalThis.localStorage) {
  if (!storage) return normalizeUserSettings(null);
  try {
    const raw = storage.getItem(USER_SETTINGS_KEY);
    if (!raw) return normalizeUserSettings(null);
    const parsed = safeParse(raw);
    if (!parsed) return normalizeUserSettings(null);
    return normalizeUserSettings(parsed);
  } catch {
    return normalizeUserSettings(null);
  }
}

export function saveUserSettings(settings, storage = globalThis.localStorage) {
  const next = normalizeUserSettings({
    ...settings,
    updatedAt: new Date().toISOString(),
  });
  if (!storage) return next;
  try {
    storage.setItem(USER_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
  return next;
}

/** Reset user params only — never touches INTERNAL market DB. */
export function resetUserSettings(storage = globalThis.localStorage) {
  const fresh = normalizeUserSettings({
    ...DEFAULT_USER_SETTINGS,
    holdingRows: [{ id: `h-${Date.now()}`, symbol: '', shares: '', avgCost: '' }],
    updatedAt: new Date().toISOString(),
  });
  if (storage) {
    try {
      storage.setItem(USER_SETTINGS_KEY, JSON.stringify(fresh));
    } catch {
      /* ignore */
    }
  }
  return fresh;
}
