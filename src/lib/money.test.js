import { describe, it, expect } from 'vitest';
import { parseMoney, formatMoney, digitsOnly } from './money.js';

describe('parseMoney / formatMoney', () => {
  const cases = [
    [0, '0'],
    [1, '1'],
    [999, '999'],
    [1000, '1 000'],
    [2300000, '2 300 000'],
    [15000000, '15 000 000'],
    [250000000, '250 000 000'],
    [1000000000, '1 000 000 000'],
    [500000, '500 000'],
  ];

  it.each(cases)('formatMoney(%s) → %s', (n, expected) => {
    expect(formatMoney(n)).toBe(expected);
  });

  it.each([
    ['2 300 000', 2300000],
    ['2300000', 2300000],
    ['500 000', 500000],
    ['15 000 000', 15000000],
    ['', 0],
    ['abc', 0],
    ['  ', 0],
  ])('parseMoney(%s) → %s', (s, expected) => {
    expect(parseMoney(s)).toBe(expected);
  });

  it('round-trips required examples', () => {
    for (const raw of [2300000, 500000, 15000000, 250000000, 1000000000]) {
      expect(parseMoney(formatMoney(raw))).toBe(raw);
    }
  });

  it('digitsOnly strips non-digits', () => {
    expect(digitsOnly('2 300 000 FCFA')).toBe('2300000');
  });
});
