import { describe, it, expect } from 'vitest';
import { buildYearOptions } from './YearSelect.jsx';

describe('buildYearOptions', () => {
  it('builds inclusive range', () => {
    expect(buildYearOptions(2026, 2028)).toEqual([2026, 2027, 2028]);
  });

  it('returns empty when inverted', () => {
    expect(buildYearOptions(2030, 2020)).toEqual([]);
  });
});
