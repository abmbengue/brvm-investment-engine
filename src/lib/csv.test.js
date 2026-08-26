import { describe, it, expect } from 'vitest';
import { parseCsv } from './csv.js';

describe('parseCsv', () => {
  it('rejects empty', () => {
    const r = parseCsv('');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/vide/i);
  });

  it('rejects invalid', () => {
    const r = parseCsv('hello');
    expect(r.ok).toBe(false);
  });

  it('parses comma CSV', () => {
    const r = parseCsv(`date,symbol,close,volume
2024-01-02,SNTS,15000,1000
2024-01-03,SNTS,15100,1100`);
    expect(r.ok).toBe(true);
    expect(r.importedRows).toBe(2);
    expect(r.symbols).toEqual(['SNTS']);
    expect(r.delimiter).toBe(',');
  });

  it('parses semicolon CSV', () => {
    const r = parseCsv(`date;symbol;close;volume
2024-01-02;BOAB;4200;800
2024-01-03;BOAB;4150;900`);
    expect(r.ok).toBe(true);
    expect(r.delimiter).toBe(';');
    expect(r.symbols).toEqual(['BOAB']);
  });

  it('rejects missing required columns', () => {
    const r = parseCsv(`date,symbol,close
2024-01-02,SNTS,15000`);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /volume/i.test(e))).toBe(true);
  });

  it('removes duplicates', () => {
    const r = parseCsv(`date,symbol,close,volume
2024-01-02,SNTS,15000,1000
2024-01-02,SNTS,15000,1000`);
    expect(r.importedRows).toBe(1);
    expect(r.duplicatesRemoved).toBe(1);
  });

  it('sorts disordered dates', () => {
    const r = parseCsv(`date,symbol,close,volume
2024-01-05,SNTS,15000,1000
2024-01-02,SNTS,14900,1000`);
    expect(r.rows[0].date).toBe('2024-01-02');
    expect(r.rows[1].date).toBe('2024-01-05');
  });

  it('rejects null/zero price', () => {
    const r = parseCsv(`date,symbol,close,volume
2024-01-02,SNTS,0,1000
2024-01-03,SNTS,,1000`);
    expect(r.ok).toBe(false);
    expect(r.rejectedRows).toBe(2);
  });

  it('rejects invalid volume', () => {
    const r = parseCsv(`date,symbol,close,volume
2024-01-02,SNTS,15000,-1`);
    expect(r.rejectedRows).toBe(1);
  });

  it('allows volume 0 but keeps row', () => {
    const r = parseCsv(`date,symbol,close,volume
2024-01-02,SNTS,15000,0`);
    expect(r.ok).toBe(true);
    expect(r.rows[0].volume).toBe(0);
  });

  it('keeps null fundamentals (does not invent)', () => {
    const r = parseCsv(`date,symbol,close,volume,pe
2024-01-02,SNTS,15000,10,`);
    expect(r.rows[0].pe).toBeNull();
  });
});
