import { buildFeatures } from './features.js';
import { rankUniverse } from './predictor.js';
import { selectPortfolio, allocate } from './portfolio.js';
import { runStress } from './stress.js';
import { decide } from './decision.js';
import { evaluateQualityGate } from './qualityGate.js';
import { runBacktest } from './backtest.js';
import { buildProjections, futureValue, capitalContributed } from './simulation.js';
import { getProfile } from './profiles.js';

/**
 * Single synchronization / calculation entry point for the engine.
 */
export function runEngine({
  capital,
  monthly,
  years,
  annualRatePct,
  profileId,
  csvResult,
}) {
  const rate = (Number(annualRatePct) || 0) / 100;
  const y = Math.max(1, Math.trunc(Number(years) || 1));
  const c = Math.max(0, Number(capital) || 0);
  const m = Math.max(0, Number(monthly) || 0);
  const profile = getProfile(profileId);

  const rows = csvResult?.ok ? csvResult.rows : [];
  const features = rows.length ? buildFeatures(rows) : [];
  const ranked = features.length ? rankUniverse(features) : [];
  const qualityGate = evaluateQualityGate({ csvResult, features, ranked });

  const selection =
    qualityGate.status === 'BLOCKED'
      ? { profile, selected: [], rejected: [], filteredCount: 0 }
      : selectPortfolio(ranked, profileId);

  const allocation = allocate(selection.selected, c, profileId);
  const stress = runStress({
    capital: c,
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
  });
  const backtest = runBacktest(rows, profileId);
  const projections = buildProjections(c, m, rate, y);
  const finalValue = futureValue(c, m, rate, y);
  const contributed = capitalContributed(c, m, y);

  return {
    capital: c,
    monthly: m,
    years: y,
    rate,
    profile,
    features,
    ranked,
    selection,
    allocation,
    stress,
    decisions,
    qualityGate,
    backtest,
    projections,
    finalValue,
    contributed,
    gain: finalValue - contributed,
    dataStatus: csvResult?.ok
      ? {
          mode: 'CSV',
          live: false,
          rows: csvResult.importedRows,
          symbols: csvResult.symbols.length,
          delimiter: csvResult.delimiter,
          rejected: csvResult.rejectedRows,
          duplicates: csvResult.duplicatesRemoved,
        }
      : {
          mode: 'NONE',
          live: false,
          rows: 0,
          symbols: 0,
          message: 'Aucune source autorisée connectée — importez un CSV',
        },
  };
}
