import { getProfile } from './profiles.js';
import { getCompanyName } from '../data/companyNames.js';

/**
 * Filter non-exploitable titles then select automatically.
 * Existing holdings are always monitored (kept when still ranked).
 * INSUFFICIENT quality cannot enter as a new allocation line.
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
    if (item.insufficient || item.qualityLabel === 'INSUFFICIENT') {
      if (!held.has(item.symbol)) reasons.push('qualité INSUFFICIENT — non éligible à une nouvelle ligne');
    }
    if (item.score < profile.minScore && !held.has(item.symbol)) {
      reasons.push(`score < ${profile.minScore}`);
    }
    if ((f.liquidity ?? 0) < profile.minLiquidity && !held.has(item.symbol)) {
      reasons.push('liquidité insuffisante');
    }
    if (f.observations < 1) reasons.push('aucune observation');

    if (reasons.length) {
      rejected.push({
        symbol: item.symbol,
        companyName: getCompanyName(item.symbol),
        reasons,
        score: item.score,
        qualityLabel: item.qualityLabel || null,
      });
    } else {
      filtered.push(item);
    }
  }

  const heldRanked = filtered.filter((x) => held.has(x.symbol));
  const others = filtered.filter((x) => !held.has(x.symbol));
  const selected = [...heldRanked, ...others].slice(
    0,
    Math.max(profile.maxPositions, heldRanked.length)
  );

  const minForDiversification = Math.min(
    profile.maxPositions,
    Math.max(3, Math.ceil(1 / profile.maxWeight - 1e-9))
  );

  return {
    profile,
    selected,
    rejected,
    filteredCount: filtered.length,
    eligibleCount: selected.length,
    minForDiversification,
    diversificationLimited: selected.length > 0 && selected.length < minForDiversification,
  };
}

/**
 * Score → raw weights (proportional), then risk-constrain with maxWeight + redistribution.
 * Score is NOT a portfolio weight.
 */
export function buildTargetWeights(selected, maxWeight) {
  if (!selected.length) {
    return { raw: [], capped: [], weights: [], leftover: 0, targetWeightSum: 0 };
  }
  const scores = selected.map((s) => Math.max(0, Number(s.score) || 0));
  const scoreSum = scores.reduce((a, b) => a + b, 0);
  const raw =
    scoreSum > 0
      ? scores.map((s) => s / scoreSum)
      : selected.map(() => 1 / selected.length);

  let capped = raw.map((w) => Math.min(w, maxWeight));
  let leftover = 1 - capped.reduce((a, b) => a + b, 0);
  for (let iter = 0; iter < 12 && leftover > 1e-9; iter++) {
    const room = capped
      .map((w, i) => ({ i, room: maxWeight - w }))
      .filter((x) => x.room > 1e-9);
    if (!room.length) break;
    // Redistribute leftover proportional to remaining score among names with room
    const scoreRoom = room.map((r) => ({
      ...r,
      score: Math.max(1e-9, scores[r.i]),
    }));
    const sSum = scoreRoom.reduce((a, x) => a + x.score, 0);
    for (const r of scoreRoom) {
      const add = Math.min(r.room, leftover * (r.score / sSum));
      capped[r.i] += add;
    }
    capped = capped.map((w) => Math.min(w, maxWeight));
    leftover = 1 - capped.reduce((a, b) => a + b, 0);
  }

  // Never renorm upward past available room — leftover stays cash
  const cSum = capped.reduce((a, b) => a + b, 0);
  const weights = cSum > 1 + 1e-9 ? capped.map((w) => w / cSum) : capped;
  return {
    raw,
    capped,
    weights,
    leftover: Math.max(0, 1 - weights.reduce((a, b) => a + b, 0)),
    targetWeightSum: weights.reduce((a, b) => a + b, 0),
  };
}

/**
 * Allocate SPOT cash toward targets, aware of existing holdings.
 *
 * Cash model:
 * - spotCash = capital initial
 * - reserveSpot = spot * reserveRatio (never spent on buys)
 * - investableSpot = spot - reserveSpot
 * - equityBudget = investableSpot + existing holdings MV (portefeuille actions)
 * Targets apply to equityBudget — NOT to full wealth including reserve.
 * Final position after buy must respect maxWeight of equityBudget.
 */
export function allocate(selected, capital, profileId, markedHoldings = null) {
  const profile = getProfile(profileId);
  const spotCash = Math.max(0, Number(capital) || 0);
  const existingMv = markedHoldings?.marketValue || 0;
  const totalWealth = spotCash + existingMv;

  const reserveSpot = spotCash * profile.reserveRatio;
  const investableSpot = spotCash - reserveSpot;
  const equityBudget = investableSpot + existingMv;

  const heldMap = new Map((markedHoldings?.positions || []).map((p) => [p.symbol, p]));
  const emptyMeta = {
    reserveSpot,
    investableSpot,
    residualCash: investableSpot,
    equityBudget,
    diversificationLimited: false,
    diversificationNote: null,
    concentrationDefinition:
      'Poids du plus gros titre dans le portefeuille actions (hors réserve)',
  };

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
      targetWeightSum: 0,
      maxWeight: profile.maxWeight,
      maxWeightRespected: true,
      checks: { targetWeightSumOk: true, maxWeightOk: true, amountsReconciled: true },
      ...emptyMeta,
      residualCash: investableSpot,
    };
  }

  const tw = buildTargetWeights(selected, profile.maxWeight);
  const { weights, raw, leftover } = tw;
  const targetWeightSum = tw.targetWeightSum;

  const minForDiv = Math.min(
    profile.maxPositions,
    Math.max(3, Math.ceil(1 / profile.maxWeight - 1e-9))
  );
  const diversificationLimited = selected.length < minForDiv;
  const diversificationNote = diversificationLimited
    ? `DIVERSIFICATION LIMITÉE — ${selected.length} titre(s) éligible(s) (minimum indicatif ${minForDiv} pour le profil ${profile.label}). Aucun titre inventé. Reliquat éventuel conservé en cash.`
    : leftover > 1e-6
      ? `Reliquat de poids ${(leftover * 100).toFixed(1)} % non déployé (plafond maxWeight / manque de place) — conservé en cash.`
      : null;

  let remainingCash = investableSpot;
  const proposedBuys = [];
  const positions = selected.map((item, i) => {
    const weight = weights[i];
    const rawWeight = raw[i];
    const targetValue = equityBudget > 0 ? equityBudget * weight : 0;
    const held = heldMap.get(item.symbol);
    const heldValue = held?.marketValue || 0;

    // Cap purchase so post-trade weight in equityBudget <= maxWeight
    const maxPositionValue = equityBudget * profile.maxWeight;
    const roomToMax = Math.max(0, maxPositionValue - heldValue);
    const deficit = Math.max(0, Math.min(targetValue - heldValue, roomToMax));

    const price = item.feature.price;
    const buyBudget = Math.min(deficit, remainingCash);
    const buyShares = price > 0 ? Math.floor(buyBudget / price) : 0;
    const buyAmount = buyShares * price;
    remainingCash -= buyAmount;

    if (buyShares > 0) {
      proposedBuys.push({
        symbol: item.symbol,
        companyName: getCompanyName(item.symbol),
        action: held ? 'ADD' : 'BUY',
        shares: buyShares,
        amount: buyAmount,
        price,
      });
    }

    const finalShares = (held?.shares || 0) + buyShares;
    const finalAmount = heldValue + buyAmount;
    const weightInEquity = equityBudget > 0 ? finalAmount / equityBudget : 0;
    const weightInTotal = totalWealth > 0 ? finalAmount / totalWealth : 0;

    return {
      symbol: item.symbol,
      companyName: getCompanyName(item.symbol),
      score: item.score,
      scoreWeightRawPct: Math.round(rawWeight * 1000) / 10,
      weight: weightInEquity,
      weightPct: Math.round(weightInEquity * 1000) / 10,
      weightInTotalPct: Math.round(weightInTotal * 1000) / 10,
      targetWeight: weight,
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
      qualityLabel: item.qualityLabel || null,
      positives: item.positives,
      negatives: item.negatives,
      alreadyHeld: Boolean(held),
      totalReturn: item.totalReturn ?? null,
      annualizedReturn: item.annualizedReturn ?? null,
      priceCagr: item.priceCagr ?? item.annualizedReturn ?? null,
      avgAnnualReturn: item.avgAnnualReturn ?? item.feature?.avgAnnualReturn ?? null,
      annualYears: item.annualYears ?? item.feature?.annualYears ?? 0,
      returnDays: item.returnDays ?? null,
      returnBasis: item.returnBasis || 'PRICE_ONLY',
      dividendsIncluded: Boolean(item.dividendYield ?? item.feature?.dividendYield),
      dividendYield: item.dividendYield ?? item.feature?.dividendYield ?? null,
      explanation:
        weight < rawWeight - 1e-6
          ? `${item.symbol} a un score élevé, mais le poids est plafonné à ${(profile.maxWeight * 100).toFixed(0)} % (profil ${profile.label}) puis le surplus est redistribué.`
          : `Poids cible dérivé du score relatif, dans la limite de diversification du profil.`,
    };
  });

  for (const [sym, held] of heldMap) {
    if (positions.some((p) => p.symbol === sym)) continue;
    const wEq = equityBudget > 0 && held.marketValue != null ? held.marketValue / equityBudget : 0;
    const wTot = totalWealth > 0 && held.marketValue != null ? held.marketValue / totalWealth : 0;
    positions.push({
      symbol: sym,
      companyName: getCompanyName(sym),
      score: null,
      scoreWeightRawPct: null,
      weight: wEq,
      weightPct: Math.round(wEq * 1000) / 10,
      weightInTotalPct: Math.round(wTot * 1000) / 10,
      targetWeight: 0,
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
      qualityLabel: null,
      positives: [],
      negatives: ['Hors sélection automatique'],
      alreadyHeld: true,
      totalReturn: held.totalReturn ?? null,
      annualizedReturn: held.annualizedReturn ?? null,
      priceCagr: held.priceCagr ?? held.annualizedReturn ?? null,
      avgAnnualReturn: held.avgAnnualReturn ?? null,
      annualYears: held.annualYears ?? 0,
      returnDays: held.returnDays ?? null,
      returnBasis: held.returnBasis || 'PRICE_ONLY',
      dividendsIncluded: Boolean(held.dividendYield),
      dividendYield: held.dividendYield ?? null,
      explanation: 'Position détenue hors sélection courante — pas d’achat proposé.',
    });
  }

  const investedSpot = proposedBuys.reduce((a, p) => a + p.amount, 0);
  const residualCash = Math.max(0, remainingCash);
  const reserve = reserveSpot + residualCash;
  const topWeight = positions.reduce((m, p) => Math.max(m, p.weight || 0), 0);
  const maxTargetBreach = weights.some((w) => w > profile.maxWeight + 1e-9);
  const maxFinalBreach = positions.some(
    (p) => (p.weight || 0) > profile.maxWeight + 1e-6 && (p.buyShares || 0) > 0
  );
  const amountsReconciled = Math.abs(investedSpot + residualCash - investableSpot) < 1;

  // HHI / effective N on equity weights of positive positions
  const eqWeights = positions.filter((p) => p.amount > 0).map((p) => p.weight || 0);
  const hhi = eqWeights.reduce((s, w) => s + w * w, 0);
  const effectiveN = hhi > 0 ? 1 / hhi : 0;

  // Weighted observed annualized returns (prefer calendar geom. mean, else price CAGR)
  let wRet = 0;
  let wKnown = 0;
  for (const p of positions) {
    const r =
      p.avgAnnualReturn != null && Number.isFinite(p.avgAnnualReturn)
        ? p.avgAnnualReturn
        : p.annualizedReturn;
    if (p.amount > 0 && r != null && Number.isFinite(r)) {
      wRet += (p.weight || 0) * r;
      wKnown += p.weight || 0;
    }
  }
  const portfolioAnnualizedReturn =
    wKnown > 0.05 ? Math.round((wRet / wKnown) * 10000) / 10000 : null;

  return {
    positions,
    existing: markedHoldings?.positions || [],
    proposedBuys,
    reserve,
    reserveSpot,
    investableSpot,
    residualCash,
    invested: investedSpot,
    spotCash,
    existingMarketValue: existingMv,
    totalWealth,
    equityBudget,
    concentration: topWeight,
    concentrationDefinition:
      'Poids du plus gros titre dans le portefeuille actions (hors réserve)',
    hhi: Math.round(hhi * 10000) / 10000,
    effectiveN: Math.round(effectiveN * 100) / 100,
    portfolioAnnualizedReturn,
    portfolioReturnNote:
      portfolioAnnualizedReturn == null
        ? 'Rendement titres non calculable — historique quotidien insuffisant sur les lignes'
        : 'Moyenne pondérée des appréciations prix (moy. géom. annuelle si dispo, sinon CAGR) — hors dividendes, pas une prévision',
    positionCount: positions.filter((p) => p.shares > 0 || p.buyShares > 0).length,
    profile,
    targetWeightSum: Math.round(targetWeightSum * 10000) / 10000,
    maxWeight: profile.maxWeight,
    maxWeightRespected: !maxTargetBreach && !maxFinalBreach,
    diversificationLimited,
    diversificationNote,
    eligibleCount: selected.length,
    minForDiversification: minForDiv,
    weightLeftover: leftover,
    checks: {
      targetWeightSumOk: targetWeightSum <= 1 + 1e-6,
      maxWeightOk: !maxTargetBreach && !maxFinalBreach,
      amountsReconciled,
      reserveIntact: reserveSpot <= reserve + 1e-6,
    },
  };
}
