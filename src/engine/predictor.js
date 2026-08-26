/**
 * Predictor — composite score from AVAILABLE fields only.
 * Missing data is skipped (not invented).
 */

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function scorePe(pe) {
  if (pe === null || pe <= 0) return null;
  // Prefer moderate PE; very high PE is negative
  if (pe < 5) return 55;
  if (pe <= 12) return 85;
  if (pe <= 20) return 70;
  if (pe <= 30) return 50;
  return 30;
}

function scoreDiv(d) {
  if (d === null) return null;
  // Assume fraction or percent — normalize if > 1 treat as percent
  const y = d > 1 ? d / 100 : d;
  if (y <= 0) return 35;
  if (y < 0.02) return 50;
  if (y <= 0.06) return 80;
  if (y <= 0.1) return 70;
  return 45; // possibly unsustainable
}

function scoreRoe(roe) {
  if (roe === null) return null;
  const r = roe > 1 ? roe / 100 : roe;
  if (r < 0) return 25;
  if (r < 0.08) return 45;
  if (r <= 0.15) return 75;
  if (r <= 0.25) return 85;
  return 70;
}

function scoreGrowth(g) {
  if (g === null) return null;
  const r = g > 1 ? g / 100 : g;
  if (r < -0.05) return 25;
  if (r < 0) return 40;
  if (r <= 0.1) return 70;
  if (r <= 0.25) return 85;
  return 65;
}

function scoreDebt(d) {
  if (d === null) return null;
  if (d < 0) return 50;
  if (d <= 0.5) return 85;
  if (d <= 1) return 70;
  if (d <= 2) return 45;
  return 25;
}

function scoreMomentum(m) {
  if (m === null) return null;
  if (m < -0.1) return 25;
  if (m < -0.03) return 40;
  if (m <= 0.03) return 55;
  if (m <= 0.1) return 75;
  if (m <= 0.2) return 80;
  return 60; // overextended
}

function scoreLiquidity(l) {
  if (l === null) return null;
  return clamp(l * 100, 0, 100);
}

function scoreRisk(vol) {
  if (vol === null) return null;
  if (vol < 0.01) return 80;
  if (vol < 0.02) return 70;
  if (vol < 0.04) return 55;
  if (vol < 0.07) return 40;
  return 25;
}

/**
 * Score one feature record. Returns score + factor lists + confidence.
 */
export function scoreSymbol(feature) {
  const parts = [];
  const positives = [];
  const negatives = [];

  const add = (label, value, weight) => {
    if (value === null || value === undefined) return;
    parts.push({ label, value, weight });
    if (value >= 65) positives.push(`${label}: ${Math.round(value)}`);
    if (value <= 40) negatives.push(`${label}: ${Math.round(value)}`);
  };

  add('Momentum', scoreMomentum(feature.momentum), 1.1);
  add('Liquidité', scoreLiquidity(feature.liquidity), 1.0);
  add('Risque (vol)', scoreRisk(feature.volatility), 1.0);
  add('PER', scorePe(feature.pe), 1.0);
  add('Dividende', scoreDiv(feature.dividendYield), 0.9);
  add('ROE', scoreRoe(feature.roe), 1.0);
  add('Croissance', scoreGrowth(feature.revenueGrowth), 1.0);
  add('Dette', scoreDebt(feature.debtEquity), 0.9);
  add('Qualité data', clamp(feature.dataQuality * 100, 0, 100), 0.8);

  if (feature.volume === 0) {
    negatives.push('Volume nul');
  }
  if (feature.observations < 2) {
    negatives.push('Historique trop court');
  }

  let score = 0;
  let wSum = 0;
  for (const p of parts) {
    score += p.value * p.weight;
    wSum += p.weight;
  }
  const composite = wSum > 0 ? score / wSum : 0;

  // Confidence = data quality × coverage of scored factors
  const coverage = parts.length / 9;
  const confidence = clamp(feature.dataQuality * 0.6 + coverage * 0.4, 0, 1);

  return {
    symbol: feature.symbol,
    score: Math.round(composite * 10) / 10,
    positives,
    negatives,
    dataQuality: feature.dataQuality,
    confidence,
    factors: parts,
    feature,
  };
}

export function rankUniverse(features) {
  return features
    .map(scoreSymbol)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence);
}
