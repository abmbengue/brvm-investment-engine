/**
 * Normalize raw CSV rows into per-symbol features.
 * Never invent missing fundamentals — leave null and score with available fields only.
 */

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
 * Build feature set per symbol from chronological rows.
 */
export function buildFeatures(rows) {
  const bySymbol = new Map();
  for (const r of rows) {
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
    bySymbol.get(r.symbol).push(r);
  }

  const features = [];
  for (const [symbol, series] of bySymbol) {
    series.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const last = series[series.length - 1];
    const closes = series.map((s) => s.close);
    const volumes = series.map((s) => s.volume);

    let variation = null;
    if (series.length >= 2) {
      const prev = series[series.length - 2].close;
      if (prev > 0) variation = (last.close - prev) / prev;
    }

    let momentum = null;
    if (series.length >= 5) {
      const past = series[series.length - 5].close;
      if (past > 0) momentum = (last.close - past) / past;
    } else if (variation !== null) {
      momentum = variation;
    }

    const avgVol = mean(volumes);
    const volStd = stdev(
      closes.slice(-Math.min(20, closes.length)).map((c, i, a) => {
        if (i === 0) return 0;
        return a[i - 1] > 0 ? (c - a[i - 1]) / a[i - 1] : 0;
      }).slice(1)
    );

    // Liquidity score 0..1 from recent average volume (relative within universe later)
    const liquidityRaw = avgVol ?? 0;

    // Latest non-null fundamentals (do not invent)
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
      last.close != null,
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
      price: last.close,
      volume: last.volume,
      variation,
      momentum,
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

  // Relative liquidity within universe
  const maxLiq = Math.max(...features.map((f) => f.liquidityRaw), 1);
  for (const f of features) {
    f.liquidity = maxLiq > 0 ? f.liquidityRaw / maxLiq : 0;
  }

  return features;
}
