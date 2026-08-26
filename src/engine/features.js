/**
 * Normalize raw CSV rows into per-symbol features.
 * Never invent missing fundamentals — leave null and score with available fields only.
 * Market price = most recent close within maxPriceAgeDays of asOf (default 3).
 *
 * Returns are PRICE_ONLY: dividend cash is never invented. INTERNAL OHLC has no DPS/yield.
 */

import { resolveRecentClose, MARKET_PRICE_MAX_AGE_DAYS } from './holdings.js';

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

/**
 * Last available close per calendar year (proxy year-end when Dec 31 absent).
 * @param {object[]} series chronological bars with date + close
 * @returns {{ year: number, date: string, close: number }[]}
 */
export function yearEndCloses(series) {
  const byYear = new Map();
  for (const bar of series || []) {
    const close = Number(bar?.close);
    const date = bar?.date;
    if (!date || !Number.isFinite(close) || close <= 0) continue;
    const year = Number(String(date).slice(0, 4));
    if (!Number.isFinite(year)) continue;
    const prev = byYear.get(year);
    if (!prev || String(date) >= String(prev.date)) {
      byYear.set(year, { year, date: String(date), close });
    }
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

/**
 * Calendar YoY price returns for consecutive years only (gaps skipped).
 * @returns {{ year: number, return: number }[]}
 */
export function calendarYearPriceReturns(series) {
  const ends = yearEndCloses(series);
  const out = [];
  for (let i = 1; i < ends.length; i++) {
    if (ends[i].year !== ends[i - 1].year + 1) continue;
    const c0 = ends[i - 1].close;
    const c1 = ends[i].close;
    if (!(c0 > 0)) continue;
    out.push({ year: ends[i].year, return: (c1 - c0) / c0 });
  }
  return out;
}

/**
 * Geometric mean of annual returns: (Π(1+r))^(1/n) − 1 — compounded annually.
 * @param {number[]} returns
 */
export function geometricMeanReturn(returns) {
  const rs = (returns || []).filter((r) => Number.isFinite(r));
  if (!rs.length) return null;
  let prod = 1;
  for (const r of rs) prod *= 1 + r;
  if (!(prod > 0)) return null;
  const g = prod ** (1 / rs.length) - 1;
  return Number.isFinite(g) ? g : null;
}

/**
 * Price-only appreciation metrics from a close series.
 * Never invents dividends / total return.
 */
export function computePriceAppreciation(series) {
  const empty = {
    totalReturn: null,
    annualizedReturn: null,
    priceCagr: null,
    avgAnnualReturn: null,
    annualYears: 0,
    yearReturns: [],
    returnDays: null,
    returnBasis: 'PRICE_ONLY',
    dividendsIncluded: false,
  };
  if (!Array.isArray(series) || series.length < 2) return empty;

  const firstClose = series[0]?.close;
  const lastClose = series[series.length - 1]?.close;
  let totalReturn = null;
  let annualizedReturn = null;
  let returnDays = null;

  if (
    firstClose != null &&
    lastClose != null &&
    Number.isFinite(firstClose) &&
    Number.isFinite(lastClose) &&
    firstClose > 0
  ) {
    totalReturn = (lastClose - firstClose) / firstClose;
    const t0 = Date.parse(series[0].date);
    const t1 = Date.parse(series[series.length - 1].date);
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) {
      returnDays = Math.round((t1 - t0) / 86400000);
      if (returnDays >= 60 && Number.isFinite(totalReturn)) {
        annualizedReturn = (1 + totalReturn) ** (365.25 / returnDays) - 1;
        if (!Number.isFinite(annualizedReturn)) annualizedReturn = null;
      }
    }
  }

  const yearReturns = calendarYearPriceReturns(series);
  const avgAnnualReturn =
    yearReturns.length >= 1
      ? geometricMeanReturn(yearReturns.map((y) => y.return))
      : null;

  return {
    totalReturn,
    annualizedReturn,
    priceCagr: annualizedReturn,
    avgAnnualReturn,
    annualYears: yearReturns.length,
    yearReturns,
    returnDays,
    returnBasis: 'PRICE_ONLY',
    dividendsIncluded: false,
  };
}

function inferAsOf(rows) {
  let max = null;
  for (const r of rows || []) {
    if (r?.date && (!max || String(r.date) > max)) max = r.date;
  }
  return max;
}

/**
 * Build feature set per symbol from chronological rows.
 * @param {object[]} rows
 * @param {{ asOf?: string|null, maxPriceAgeDays?: number }} [opts]
 */
export function buildFeatures(rows, opts = {}) {
  const maxPriceAgeDays = opts.maxPriceAgeDays ?? MARKET_PRICE_MAX_AGE_DAYS;
  const asOf = opts.asOf || inferAsOf(rows);

  const bySymbol = new Map();
  for (const r of rows || []) {
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
    bySymbol.get(r.symbol).push(r);
  }

  const features = [];
  for (const [symbol, series] of bySymbol) {
    series.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const last = series[series.length - 1];
    const closes = series.map((s) => s.close);
    const volumes = series.map((s) => s.volume);
    const quote = resolveRecentClose(series, asOf, maxPriceAgeDays);

    let variation = null;
    if (series.length >= 2) {
      const prev = series[series.length - 2].close;
      if (prev > 0 && last.close > 0) variation = (last.close - prev) / prev;
    }

    let momentum = null;
    if (series.length >= 5) {
      const past = series[series.length - 5].close;
      if (past > 0 && last.close > 0) momentum = (last.close - past) / past;
    } else if (variation !== null) {
      momentum = variation;
    }

    const appreciation = computePriceAppreciation(series);
    const {
      totalReturn,
      annualizedReturn,
      priceCagr,
      avgAnnualReturn,
      annualYears,
      returnDays,
      returnBasis,
      dividendsIncluded,
    } = appreciation;

    const avgVol = mean(volumes);
    const liquidityRaw = avgVol ?? 0;
    const volStd = stdev(
      closes
        .slice(-Math.min(20, closes.length))
        .map((c, i, a) => {
          if (i === 0) return 0;
          return a[i - 1] > 0 ? (c - a[i - 1]) / a[i - 1] : 0;
        })
        .slice(1)
    );

    const pickLast = (key) => {
      for (let i = series.length - 1; i >= 0; i--) {
        if (series[i][key] !== null && series[i][key] !== undefined) return series[i][key];
      }
      return null;
    };

    const pe = pickLast('pe');
    const dividendYield = pickLast('dividendYield');
    const roe = pickLast('roe');
    const revenueGrowth = pickLast('revenueGrowth');
    const debtEquity = pickLast('debtEquity');

    const availableFields = [
      quote.fresh && quote.price != null,
      variation != null,
      last.volume != null,
      momentum != null,
      pe != null,
      dividendYield != null,
      roe != null,
      revenueGrowth != null,
      debtEquity != null,
      series.length >= 2,
    ];
    const dataQuality = availableFields.filter(Boolean).length / availableFields.length;

    features.push({
      symbol,
      observations: series.length,
      firstDate: series[0].date,
      lastDate: last.date,
      asOf,
      price: quote.fresh ? quote.price : null,
      priceDate: quote.priceDate,
      priceAgeDays: quote.ageDays,
      priceFresh: quote.fresh,
      priceReason: quote.reason,
      maxPriceAgeDays,
      volume: last.volume,
      variation,
      momentum,
      totalReturn,
      annualizedReturn,
      priceCagr,
      avgAnnualReturn,
      annualYears,
      returnDays,
      returnBasis,
      dividendsIncluded,
      liquidityRaw,
      volatility: volStd,
      pe,
      dividendYield,
      roe,
      revenueGrowth,
      debtEquity,
      dataQuality,
      series,
    });
  }

  const maxLiq = Math.max(...features.map((f) => f.liquidityRaw), 1);
  for (const f of features) {
    f.liquidity = maxLiq > 0 ? f.liquidityRaw / maxLiq : 0;
  }

  return features;
}
