/**
 * Normalize raw CSV rows into per-symbol features.
 * Never invent missing fundamentals — leave null and score with available fields only.
 * Market price = most recent close within maxPriceAgeDays of asOf (default 3).
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

    let totalReturn = null;
    let annualizedReturn = null;
    let returnDays = null;
    const firstClose = series[0]?.close;
    const lastClose = last.close;
    if (
      series.length >= 2 &&
      firstClose != null &&
      lastClose != null &&
      Number.isFinite(firstClose) &&
      Number.isFinite(lastClose) &&
      firstClose > 0
    ) {
      totalReturn = (lastClose - firstClose) / firstClose;
      const t0 = Date.parse(series[0].date);
      const t1 = Date.parse(last.date);
      if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) {
        returnDays = Math.round((t1 - t0) / 86400000);
        if (returnDays >= 60 && Number.isFinite(totalReturn)) {
          annualizedReturn = (1 + totalReturn) ** (365.25 / returnDays) - 1;
          if (!Number.isFinite(annualizedReturn)) annualizedReturn = null;
        }
      }
    }

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
      returnDays,
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
