import { describe, it, expect } from 'vitest';
import {
  getCompanyName,
  resolveSymbolInput,
  COMPANY_NAME_UNAVAILABLE,
} from './companyNames.js';

describe('companyNames / aliases', () => {
  it('maps SNTS to SONATEL', () => {
    expect(getCompanyName('SNTS')).toMatch(/SONATEL/i);
  });

  it('resolves SONATEL alias to SNTS', () => {
    expect(resolveSymbolInput('SONATEL')).toBe('SNTS');
    expect(resolveSymbolInput('sonatel')).toBe('SNTS');
    expect(resolveSymbolInput('Sonatel Sénégal')).toBe('SNTS');
  });

  it('keeps known tickers as-is', () => {
    expect(resolveSymbolInput('SNTS')).toBe('SNTS');
    expect(resolveSymbolInput('BOAB')).toBe('BOAB');
  });

  it('does not invent unknown tickers', () => {
    expect(resolveSymbolInput('XXXX')).toBe('XXXX');
    expect(getCompanyName('XXXX')).toBe(COMPANY_NAME_UNAVAILABLE);
  });
});
