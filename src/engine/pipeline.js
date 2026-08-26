import { buildFeatures } from './features.js';
import { rankUniverse } from './predictor.js';
import { selectPortfolio, allocate } from './portfolio.js';
import { runStress } from './stress.js';
import { decide } from './decision.js';
import { evaluateQualityGate } from './qualityGate.js';
import { runBacktest } from './backtest.js';
import {
  buildProjectionsScheduled,
  futureValueScheduled,
  capitalContributedScheduled,
  normalizeSchedule,
} from './simulation.js';
import { getProfile } from './profiles.js';
import {
  normalizeHoldings,
  markHoldings,
  holdingsToPriceMap,
} from './holdings.js';

/**
 * Single synchronization / calculation entry point for the engine.
 * initialApport = apport initial au démarrage du plan
 * capital = investissement spot (cash actions) à l’année spotYear
 * monthly = apport mensuel récurrent à partir de recurrentStartYear
 * holdings = portefeuille déjà acheté [{symbol, shares, avgCost?}]
 * annualHistory = contexte HistoricalMarketData (indice annuel, jamais LIVE)
 */
export function runEngine({
  capital,
  monthly,
  years,
  annualRatePct,
  profileId,
  csvResult,
  holdings: holdingsInput = [],
  annualHistory = null,
  initialApport = 0,
  planStartYear,
  spotYear,
  recurrentStartYear,
}) {
  const rate = (Number(annualRatePct) || 0) / 100;
  const y = Math.max(1, Math.trunc(Number(years) || 1));
  const spotCash = Math.max(0, Number(capital) || 0);
  const m = Math.max(0, Number(monthly) || 0);
  const init = Math.max(0, Number(initialApport) || 0);
  const profile = getProfile(profileId);

  const schedule = normalizeSchedule({
    initialApport: init,
    spotAmount: spotCash,
    monthly: m,
    planStartYear,
    spotYear,
    recurrentStartYear,
    horizonYears: y,
  });

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

  // Allocation porte sur l’investissement spot (pas l’apport initial cash hors déploiement)
  const allocation = allocate(selection.selected, spotCash, profileId, marked);
  const hist = annualHistory?.ok ? annualHistory : null;

  const scheduleCommon = {
    initialApport: schedule.initialApport,
    spotAmount: schedule.spotAmount,
    monthly: schedule.monthly,
    planStartYear: schedule.planStartYear,
    spotYear: schedule.spotYear,
    recurrentStartYear: schedule.recurrentStartYear,
    horizonYears: schedule.horizonYears,
  };

  const stress = runStress({
    capital: spotCash + (marked.marketValue || 0),
    monthly: m,
    years: y,
    centralRate: rate,
    allocation,
    profileId,
    historicalCalibration: hist?.stressCalibration || null,
    schedule: scheduleCommon,
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
  if (!backtest.validated) {
    backtest.status =
      hist?.stockBacktestMessage ||
      'BACKTEST TITRES NON VALIDÉ — HISTORIQUE QUOTIDIEN INSUFFISANT';
  }

  const projections = buildProjectionsScheduled({
    ...scheduleCommon,
    annualRate: rate,
  });
  const finalValue = futureValueScheduled({ ...scheduleCommon, annualRate: rate });
  const contributed = capitalContributedScheduled(scheduleCommon);

  // Optional scenario using observed portfolio weighted return (never invent)
  const titlesRate = allocation.portfolioAnnualizedReturn;
  const finalValueTitles =
    titlesRate != null
      ? futureValueScheduled({ ...scheduleCommon, annualRate: titlesRate })
      : null;

  return {
    capital: spotCash,
    spotCash,
    initialApport: schedule.initialApport,
    monthly: m,
    years: y,
    rate,
    schedule,
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
    historicalMarketData: hist
      ? {
          ok: true,
          live: false,
          kind: 'ANNUAL_INDEX',
          seriesType: hist.seriesType || 'PRICE_INDEX',
          yearCount: hist.meta?.yearCount ?? hist.points?.length ?? 0,
          yearStart: hist.meta?.yearStart ?? null,
          yearEnd: hist.meta?.yearEnd ?? null,
          qualityCounts: hist.meta?.qualityCounts || null,
          missingIndexYears: hist.meta?.missingIndexYears || [],
          regimes: hist.regimes || [],
          benchmark: hist.benchmark || [],
          stressCalibration: hist.stressCalibration || null,
          stockBacktestValidated: false,
          stockBacktestMessage:
            hist.stockBacktestMessage ||
            'BACKTEST TITRES NON VALIDÉ — HISTORIQUE QUOTIDIEN INSUFFISANT',
          note: hist.meta?.note || null,
        }
      : {
          ok: false,
          live: false,
          kind: 'ANNUAL_INDEX',
          seriesType: 'PRICE_INDEX',
          stockBacktestValidated: false,
          stockBacktestMessage:
            'BACKTEST TITRES NON VALIDÉ — HISTORIQUE QUOTIDIEN INSUFFISANT',
          message: 'Historique annuel d’indice non chargé',
        },
    projections,
    finalValue,
    contributed,
    gain: finalValue - contributed,
    finalValueTitles,
    titlesRate,
    totalWealthNow: (() => {
      const yNow = new Date().getFullYear();
      let cashNow = 0;
      if (schedule.planStartYear <= yNow) cashNow += schedule.initialApport;
      if (schedule.spotYear <= yNow) cashNow += spotCash;
      return cashNow + (marked.marketValue || 0);
    })(),
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
      : 'Pas de LIVE BRVM — données historiques jusqu’à J-1.',
    engineVersion: '7.6.1',
  };
}
