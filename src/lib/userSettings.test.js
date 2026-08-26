import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadUserSettings,
  saveUserSettings,
  resetUserSettings,
  normalizeUserSettings,
  USER_SETTINGS_KEY,
  DEFAULT_USER_SETTINGS,
} from './userSettings.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

describe('userSettings persistence', () => {
  let storage;
  beforeEach(() => {
    storage = memoryStorage();
  });

  it('loads defaults when empty', () => {
    const s = loadUserSettings(storage);
    expect(s.capital).toBe(DEFAULT_USER_SETTINGS.capital);
    expect(s.holdingRows.length).toBeGreaterThanOrEqual(1);
  });

  it('saves and loads roundtrip', () => {
    saveUserSettings(
      {
        capital: 12_000_000,
        monthly: 100_000,
        years: 40,
        rate: 8.5,
        profileId: 'prudent',
        holdingRows: [{ id: '1', symbol: 'SNTS', shares: '10', avgCost: '12000' }],
      },
      storage
    );
    const s = loadUserSettings(storage);
    expect(s.capital).toBe(12_000_000);
    expect(s.years).toBe(40);
    expect(s.profileId).toBe('prudent');
    expect(s.holdingRows[0].symbol).toBe('SNTS');
    expect(storage.getItem(USER_SETTINGS_KEY)).toBeTruthy();
  });

  it('recovers from corrupted JSON', () => {
    storage.setItem(USER_SETTINGS_KEY, '{not-json');
    const s = loadUserSettings(storage);
    expect(s.capital).toBe(DEFAULT_USER_SETTINGS.capital);
  });

  it('reset restores defaults without throwing', () => {
    saveUserSettings({ capital: 99, monthly: 1, years: 2, rate: 1, profileId: 'dynamique' }, storage);
    const r = resetUserSettings(storage);
    expect(r.capital).toBe(DEFAULT_USER_SETTINGS.capital);
    expect(loadUserSettings(storage).profileId).toBe('equilibre');
  });

  it('normalize clamps invalid years', () => {
    const s = normalizeUserSettings({ years: 0, capital: -5, monthly: 'x' });
    expect(s.years).toBeGreaterThanOrEqual(1);
    expect(s.capital).toBe(DEFAULT_USER_SETTINGS.capital);
  });
});
