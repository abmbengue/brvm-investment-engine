import { getProfile } from './profiles.js';

/**
 * Filter non-exploitable titles then select automatically.
 * Existing holdings are always monitored (kept in selection set when still ranked).
 */
export function selectPortfolio(ranked, profileId, heldSymbols = []) {
  const profile = getProfile(profileId);
  const held = new Set((heldSymbols || []).map((s) => String(s).toUpperCase()));
  const filtered = [];
  const rejected = [];

  for (const item of ranked) {
    const f = item.feature;
    const reasons = [];
    if (!f.price || f.price <= 0) reasons.push('prix invalide');
    if (f.volume === null) reasons.push('volume manquant');
    if (f.dataQuality < 0.25) reasons.push('qualité data insuffisante');
    if (item.score < profile.minScore && !held.has(item.symbol)) {
      reasons.push(`score < ${profile.minScore}`);
    }
    if ((f.liquidity ?? 0) < profile.minLiquidity && !held.has(item.symbol)) {
      reasons.push('liquidité insuffisante');
    }
    if (f.observations < 1) reasons.push('aucune observation');

    if (reasons.length) {
      rejected.push({ symbol: item.symbol, reasons, score: item.score });
    } else {
      filtered.push(item);
    }
  }

  // Ensure held symbols present in ranked+filtered bubble into selection preference
  const heldRanked = filtered.filter((x) => held.has(x.symbol));
  const others = filtered.filter((x) => !held.has(x.symbol));
  const selected = [...heldRanked, ...others].slice(0, Math.max(profile.maxPositions, heldRanked.length));

  return { profile, selected, rejected, filteredCount: filtered.length };
}

/**
 * Allocate SPOT cash toward targets, aware of existing holdings.
 * capital = cash disponible spot (not including holdings market value).
 */
export function allocate(selected, capital, profileId, markedHoldings = null) {
  const profile = getProfile(profileId);
  const spotCash = Math.max(0, Number(capital) || 0);
  const existingMv = markedHoldings?.marketValue || 0;
  const totalWealth = spotCash + existingMv;

  const investableSpot = spotCash * (1 - profile.reserveRatio);
  const reserveSpot = spotCash - investableSpot;

  const heldMap = new Map((markedHoldings?.positions || []).map((p) => [p.symbol, p]));

  if (!selected.length || (investableSpot <= 0 && heldMap.size === 0)) {
    return {
      positions: [],
      existing: markedHoldings?.positions || [],
      reserve: reserveSpot,
      invested: 0,
      spotCash,
      existingMarketValue: existingMv,
      totalWealth,
      concentration: 0,
      positionCount: heldMap.size,
      proposedBuys: [],
    };
  }

  const scores = selected.map((s) => Math.max(1, s.score));
  const sum = scores.reduce((a, b) => a + b, 0);
  let raw = scores.map((s) => s / sum);
  let capped = raw.map((w) => Math.min(w, profile.maxWeight));
  let leftover = 1 - capped.reduce((a, b) => a + b, 0);
  for (let iter = 0; iter < 5 && leftover > 1e-9; iter++) {
    const room = capped.map((w, i) => ({ i, room: profile.maxWeight - w })).filter((x) => x.room > 1e-9);
    if (!room.length) break;
    const roomSum = room.reduce((a, x) => a + x.room, 0);
    for (const r of room) capped[r.i] += leftover * (r.room / roomSum);
    capped = capped.map((w) => Math.min(w, profile.maxWeight));
    leftover = 1 - capped.reduce((a, b) => a + b, 0);
  }
  const cSum = capped.reduce((a, b) => a + b, 0) || 1;
  const weights = capped.map((w) => w / cSum);

  // Target value in total wealth terms; buy deficit with spot cash
  let remainingCash = investableSpot;
  const proposedBuys = [];
  const positions = selected.map((item, i) => {
    const weight = weights[i];
    const targetValue = totalWealth > 0 ? totalWealth * weight : investableSpot * weight;
    const held = heldMap.get(item.symbol);
    const heldValue = held?.marketValue || 0;
    const deficit = Math.max(0, targetValue - heldValue);
    const price = item.feature.price;
    const buyBudget = Math.min(deficit, remainingCash);
    const buyShares = price > 0 ? Math.floor(buyBudget / price) : 0;
    const buyAmount = buyShares * price;
    remainingCash -= buyAmount;

    if (buyShares > 0) {
      proposedBuys.push({
        symbol: item.symbol,
        action: held ? 'ADD' : 'BUY',
        shares: buyShares,
        amount: buyAmount,
        price,
      });
    }

    const finalShares = (held?.shares || 0) + buyShares;
    const finalAmount = heldValue + buyAmount;
    const finalWeight = totalWealth > 0 ? finalAmount / totalWealth : weight;

    return {
      symbol: item.symbol,
      score: item.score,
      weight: finalWeight,
      weightPct: Math.round(finalWeight * 1000) / 10,
      targetWeightPct: Math.round(weight * 1000) / 10,
      amount: finalAmount,
      targetAmount: targetValue,
      shares: finalShares,
      existingShares: held?.shares || 0,
      buyShares,
      buyAmount,
      price,
      confidence: item.confidence,
      dataQuality: item.dataQuality,
      positives: item.positives,
      negatives: item.negatives,
      alreadyHeld: Boolean(held),
    };
  });

  // Include held names not in selected (still show as existing-only)
  for (const [sym, held] of heldMap) {
    if (positions.some((p) => p.symbol === sym)) continue;
    const w = totalWealth > 0 && held.marketValue != null ? held.marketValue / totalWealth : 0;
    positions.push({
      symbol: sym,
      score: null,
      weight: w,
      weightPct: Math.round(w * 1000) / 10,
      targetWeightPct: 0,
      amount: held.marketValue || 0,
      targetAmount: 0,
      shares: held.shares,
      existingShares: held.shares,
      buyShares: 0,
      buyAmount: 0,
      price: held.price,
      confidence: null,
      dataQuality: null,
      positives: [],
      negatives: ['Hors sélection automatique'],
      alreadyHeld: true,
    });
  }

  const investedSpot = proposedBuys.reduce((a, p) => a + p.amount, 0);
  const topWeight = positions.reduce((m, p) => Math.max(m, p.weight || 0), 0);

  return {
    positions,
    existing: markedHoldings?.positions || [],
    proposedBuys,
    reserve: reserveSpot + Math.max(0, remainingCash),
    invested: investedSpot,
    spotCash,
    existingMarketValue: existingMv,
    totalWealth,
    concentration: topWeight,
    positionCount: positions.filter((p) => p.shares > 0).length,
    profile,
  };
}
