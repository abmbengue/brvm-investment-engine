import { getProfile } from './profiles.js';

/**
 * Filter non-exploitable titles then select automatically.
 */
export function selectPortfolio(ranked, profileId) {
  const profile = getProfile(profileId);
  const filtered = [];
  const rejected = [];

  for (const item of ranked) {
    const f = item.feature;
    const reasons = [];
    if (!f.price || f.price <= 0) reasons.push('prix invalide');
    if (f.volume === null) reasons.push('volume manquant');
    if (f.dataQuality < 0.25) reasons.push('qualité data insuffisante');
    if (item.score < profile.minScore) reasons.push(`score < ${profile.minScore}`);
    if ((f.liquidity ?? 0) < profile.minLiquidity) reasons.push('liquidité insuffisante');
    if (f.observations < 1) reasons.push('aucune observation');

    if (reasons.length) {
      rejected.push({ symbol: item.symbol, reasons, score: item.score });
    } else {
      filtered.push(item);
    }
  }

  const selected = filtered.slice(0, profile.maxPositions);
  return { profile, selected, rejected, filteredCount: filtered.length };
}

/**
 * Allocation: target weights, amounts, shares, reserve, concentration.
 * New contributions are re-evaluated via current scores (not mechanical).
 */
export function allocate(selected, capital, profileId) {
  const profile = getProfile(profileId);
  const investable = Math.max(0, capital) * (1 - profile.reserveRatio);
  const reserve = Math.max(0, capital) - investable;

  if (!selected.length || investable <= 0) {
    return {
      positions: [],
      reserve,
      invested: 0,
      concentration: 0,
      positionCount: 0,
    };
  }

  // Softmax-like weights from scores with maxWeight cap
  const scores = selected.map((s) => Math.max(1, s.score));
  const sum = scores.reduce((a, b) => a + b, 0);
  let raw = scores.map((s) => s / sum);

  // Cap and redistribute
  let capped = raw.map((w) => Math.min(w, profile.maxWeight));
  let leftover = 1 - capped.reduce((a, b) => a + b, 0);
  // Give leftover to uncapped proportionally
  for (let iter = 0; iter < 5 && leftover > 1e-9; iter++) {
    const room = capped.map((w, i) => ({ i, room: profile.maxWeight - w })).filter((x) => x.room > 1e-9);
    if (!room.length) break;
    const roomSum = room.reduce((a, x) => a + x.room, 0);
    for (const r of room) {
      const add = leftover * (r.room / roomSum);
      capped[r.i] += add;
    }
    capped = capped.map((w) => Math.min(w, profile.maxWeight));
    leftover = 1 - capped.reduce((a, b) => a + b, 0);
  }

  // Renormalize to 1
  const cSum = capped.reduce((a, b) => a + b, 0) || 1;
  const weights = capped.map((w) => w / cSum);

  const positions = selected.map((item, i) => {
    const weight = weights[i];
    const amount = investable * weight;
    const price = item.feature.price;
    const shares = price > 0 ? Math.floor(amount / price) : 0;
    const actualAmount = shares * price;
    return {
      symbol: item.symbol,
      score: item.score,
      weight,
      weightPct: Math.round(weight * 1000) / 10,
      amount: actualAmount,
      targetAmount: amount,
      shares,
      price,
      confidence: item.confidence,
      dataQuality: item.dataQuality,
      positives: item.positives,
      negatives: item.negatives,
    };
  });

  const invested = positions.reduce((a, p) => a + p.amount, 0);
  const unused = investable - invested;
  const topWeight = positions.reduce((m, p) => Math.max(m, p.weight), 0);
  const concentration = topWeight;

  return {
    positions,
    reserve: reserve + Math.max(0, unused),
    invested,
    concentration,
    positionCount: positions.filter((p) => p.shares > 0).length,
    profile,
  };
}
