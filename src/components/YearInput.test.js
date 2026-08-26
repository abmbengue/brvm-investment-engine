import { describe, it, expect } from 'vitest';
import { clampYear } from './YearInput.jsx';

describe('clampYear', () => {
  it('accepts valid years', () => {
    expect(clampYear('2028', { fallback: 2026 })).toBe(2028);
  });

  it('uses fallback for empty/invalid', () => {
    expect(clampYear('', { fallback: 2026 })).toBe(2026);
    expect(clampYear('abc', { fallback: 2026 })).toBe(2026);
  });

  it('clamps to min/max', () => {
    expect(clampYear('1800', { min: 1990, max: 2200, fallback: 2026 })).toBe(1990);
    expect(clampYear('9999', { min: 1990, max: 2200, fallback: 2026 })).toBe(2200);
  });

  it('does not treat intermediate digits as empty', () => {
    // Typing "2" of "2028" must not snap to fallback via || tricks
    expect(clampYear('2', { min: 1990, max: 2200, fallback: 2026 })).toBe(1990);
  });
});
