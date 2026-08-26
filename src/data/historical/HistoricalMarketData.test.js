import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseAnnualHistoricalCsv,
  detectMarketRegimes,
  calibrateStressFromHistory,
  buildAnnualBenchmark,
  buildHistoricalContext,
  SERIES_TYPES,
  QUALITY,
} from './HistoricalMarketData.js';
import { FUTURE_DAILY_SCHEMA } from './dailySchema.js';
import { runEngine } from '../../engine/pipeline.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const annualCsv = readFileSync(
  join(root, 'public/data/BRVM_HISTORICAL_2006_2025_ANNUAL.csv'),
  'utf8'
);

describe('HistoricalMarketData annual 2006–2025', () => {
  it('loads 20 years', () => {
    const parsed = parseAnnualHistoricalCsv(annualCsv);
    expect(parsed.ok).toBe(true);
    expect(parsed.points).toHaveLength(20);
    expect(parsed.meta.yearStart).toBe(2006);
    expect(parsed.meta.yearEnd).toBe(2025);
    expect(parsed.meta.live).toBe(false);
    expect(parsed.meta.seriesType).toBe(SERIES_TYPES.PRICE_INDEX);
  });

  it('sorts chronologically', () => {
    const shuffled = annualCsv
      .split('\n')
      .filter(Boolean);
    const header = shuffled[0];
    const body = shuffled.slice(1).reverse();
    const parsed = parseAnnualHistoricalCsv([header, ...body].join('\n'));
    const years = parsed.points.map((p) => p.year);
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });

  it('removes duplicates without inventing', () => {
    const withDup = `${annualCsv.trim()}\n2010,999.0,VERIFIED,duplicate should be ignored\n`;
    const parsed = parseAnnualHistoricalCsv(withDup);
    expect(parsed.points.filter((p) => p.year === 2010)).toHaveLength(1);
    expect(parsed.points.find((p) => p.year === 2010).indexYearEnd).toBe(159.1);
    expect(parsed.meta.duplicatesRemoved).toBe(1);
  });

  it('handles missing index levels without inventing them', () => {
    const parsed = parseAnnualHistoricalCsv(annualCsv);
    const y2018 = parsed.points.find((p) => p.year === 2018);
    expect(y2018.indexYearEnd).toBeNull();
    expect(y2018.hasIndex).toBe(false);
    expect(y2018.annualReturn).toBeCloseTo(-0.2914, 4);
    expect(parsed.meta.missingIndexYears).toContain(2018);
    expect(parsed.meta.missingIndexYears).toContain(2025);
  });

  it('derives YoY return only from consecutive index levels', () => {
    const parsed = parseAnnualHistoricalCsv(annualCsv);
    const y2009 = parsed.points.find((p) => p.year === 2009);
    expect(y2009.returnSource).toBe('DERIVED_FROM_INDEX');
    expect(y2009.annualReturn).toBeCloseTo(132.05 / 178.17 - 1, 6);
    // First year has no prior index → return stays missing (not invented)
    const y2006 = parsed.points.find((p) => p.year === 2006);
    expect(y2006.annualReturn).toBeNull();
    expect(y2006.returnSource).toBe('MISSING');
  });

  it('never invents calculations from empty CSV cells', () => {
    const sparse = `year,brvm_composite_year_end,quality,notes
2006,,,
2007,,,
`;
    const parsed = parseAnnualHistoricalCsv(sparse);
    expect(parsed.points).toHaveLength(2);
    expect(parsed.points.every((p) => p.indexYearEnd == null)).toBe(true);
    expect(parsed.points.every((p) => p.annualReturn == null)).toBe(true);
    expect(parsed.points.every((p) => p.quality === QUALITY.MISSING)).toBe(true);
  });

  it('exposes quality VERIFIED / SECONDARY / MISSING', () => {
    const parsed = parseAnnualHistoricalCsv(annualCsv);
    expect(parsed.meta.qualityCounts.VERIFIED).toBeGreaterThan(0);
    expect(parsed.meta.qualityCounts.SECONDARY).toBeGreaterThan(0);
    expect(parsed.points.every((p) => Object.values(QUALITY).includes(p.quality))).toBe(true);
  });

  it('detects regimes and calibrates stress without invention', () => {
    const ctx = buildHistoricalContext(parseAnnualHistoricalCsv(annualCsv));
    expect(ctx.regimes.length).toBeGreaterThan(10);
    expect(ctx.stressCalibration.ok).toBe(true);
    expect(ctx.stressCalibration.scenarios).toHaveLength(4);
    expect(ctx.benchmark).toHaveLength(20);
    expect(ctx.live).toBe(false);
    expect(ctx.stockBacktestValidated).toBe(false);
    expect(ctx.stockBacktestMessage).toBe(
      'BACKTEST TITRES NON VALIDÉ — HISTORIQUE QUOTIDIEN INSUFFISANT'
    );
    const crisis = detectMarketRegimes(ctx.points).find((r) => r.year === 2018);
    expect(crisis.regime).toBe('CRISIS');
  });

  it('prepares future daily schema without filling fake daily bars', () => {
    expect(FUTURE_DAILY_SCHEMA.columns).toEqual([
      'date',
      'symbol',
      'open',
      'high',
      'low',
      'close',
      'volume',
    ]);
    expect(FUTURE_DAILY_SCHEMA.stockBacktestValidated).toBe(false);
  });

  it('wires into engine stress + backtest message (V7 non-regression)', () => {
    const hist = buildHistoricalContext(parseAnnualHistoricalCsv(annualCsv));
    const r = runEngine({
      capital: 1_000_000,
      monthly: 0,
      years: 10,
      annualRatePct: 9,
      profileId: 'equilibre',
      csvResult: null,
      annualHistory: hist,
    });
    expect(r.historicalMarketData.ok).toBe(true);
    expect(r.historicalMarketData.yearCount).toBe(20);
    expect(r.historicalMarketData.seriesType).toBe('PRICE_INDEX');
    expect(r.stress.some((s) => s.source === 'ANNUAL_PRICE_INDEX')).toBe(true);
    expect(r.backtest.validated).toBe(false);
    expect(r.backtest.status).toBe(
      'BACKTEST TITRES NON VALIDÉ — HISTORIQUE QUOTIDIEN INSUFFISANT'
    );
    expect(r.dataStatus.live).toBe(false);
  });
});

describe('calibrateStressFromHistory edge', () => {
  it('returns ok:false when no returns', () => {
    expect(calibrateStressFromHistory([{ annualReturn: null }]).ok).toBe(false);
  });

  it('buildAnnualBenchmark preserves nulls', () => {
    const rows = buildAnnualBenchmark([
      {
        year: 2000,
        indexYearEnd: null,
        annualReturn: null,
        quality: 'MISSING',
        seriesType: 'PRICE_INDEX',
      },
    ]);
    expect(rows[0].indexYearEnd).toBeNull();
    expect(rows[0].annualReturn).toBeNull();
  });
});
