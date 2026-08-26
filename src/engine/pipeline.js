import { buildFeatures } from './features.js';
import { rankUniverse } from './predictor.js';
import { selectPortfolio, allocate } from './portfolio.js';
import { runStress } from './stress.js';
import { decide } from './decision.js';
import { evaluateQualityGate } from './qualityGate.js';
import { runBacktest } from './backtest.js';
import { buildProjections, futureValue, capitalContributed } from './simulation.js';
import { getProfile } from './profiles.js';
import {
  normalizeHoldings,
  markHoldings,
  holdingsToPriceMap,
} from './holdings.js';

/**
 * Single synchronization / calculation entry point for the engine.
 * capital = cash disponible SPOT à investir maintenant
 * monthly = apport mensuel futur (simulation patrimoniale)
 * holdings = portefeuille déjà acheté [{symbol, shares, avgCost?}]
 */
export function runEngine({
  capital,
  monthly,
  years,
  annualRatePct,
  profileId,
  csvResult,
  holdings: holdingsInput = [],
}) {
  const rate = (Number(annualRatePct) || 0) / 100;
  const y = Math.max(1, Math.trunc(Number(years) || 1));
  const spotCash = Math.max(0, Number(capital) || 0);
  const m = Math.max(0, Number(monthly) || 0);
  const profile = getProfile(profileId);

  const rows = csvResult?.ok ? csvResult.rows : [];
  const features = rows.length ? buildFeatures(rows) : [];
  const ranked = features.length ? rankUniverse(features) : [];
  const qualityGate = evaluateQualityGate({
    csvResult,
    features,
    ranked,
    meta: csvResult?.meta || null,
  });

  const { holdings } = normalizeHoldings(holdingsInput);
  const priceMap = holdingsToPriceMap(features);
  const marked = markHoldings(holdings, priceMap);
  const heldSymbols = marked.symbols;

  const selection =
    qualityGate.status === 'BLOCKED'
      ? { profile, selected: [], rejected: [], filteredCount: 0 }
      : selectPortfolio(ranked, profileId, heldSymbols);

  const allocation = allocate(selection.selected, spotCash, profileId, marked);
  const stress = runStress({
    capital: spotCash + (marked.marketValue || 0),
    monthly: m,
    years: y,
    centralRate: rate,
    allocation,
    profileId,
  });
  const decisions = decide({
    ranked,
    allocation,
    qualityGate,
    profile,
    stress,
    heldSymbols,
  });
  const backtest = runBacktest(rows, profileId);
  // Patrimonial sim: spot cash + future monthly (holdings are separate stock positions)
  const projections = buildProjections(spotCash, m, rate, y);
  const finalValue = futureValue(spotCash, m, rate, y);
  const contributed = capitalContributed(spotCash, m, y);

  return {
    capital: spotCash,
    spotCash,
    monthly: m,
    years: y,
    rate,
    profile,
    features,
    ranked,
    selection,
    allocation,
    holdings: marked,
    stress,
    decisions,
    qualityGate,
    backtest,
    projections,
    finalValue,
    contributed,
    gain: finalValue - contributed,
    totalWealthNow: spotCash + (marked.marketValue || 0),
    dataStatus: csvResult?.ok
      ? {
          mode: csvResult.meta?.mode || 'CSV',
          live: Boolean(csvResult.meta?.live),
          rows: csvResult.importedRows,
          symbols: csvResult.symbols.length,
          delimiter: csvResult.delimiter,
          rejected: csvResult.rejectedRows,
          duplicates: csvResult.duplicatesRemoved,
          asOf: csvResult.meta?.asOf || null,
          sourceLabel: csvResult.meta?.sourceLabel || null,
        }
      : {
          mode: 'NONE',
          live: false,
          rows: 0,
          symbols: 0,
          message: 'Données temps réel non connectées. Importez un CSV ou chargez SAMPLE.',
        },
    liveStatusMessage: csvResult?.meta?.live
      ? `LIVE — ${csvResult.meta.sourceLabel}`
      : 'Données temps réel non connectées.',
  };
}
