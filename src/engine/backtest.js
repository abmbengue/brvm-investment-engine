/**
 * Walk-forward backtest skeleton.
 * No look-ahead: train on past, validate, then out-of-sample.
 * Never invent performance — return NON VALIDÉ if data insufficient.
 */

import { buildFeatures } from './features.js';
import { rankUniverse } from './predictor.js';

const MIN_DATES = 30;
const MIN_SYMBOLS = 3;

function uniqueDates(rows) {
  return [...new Set(rows.map((r) => r.date))].sort();
}

function sliceRows(rows, startDate, endDate) {
  return rows.filter((r) => r.date >= startDate && r.date <= endDate);
}

function periodReturn(rows, symbols) {
  // Equal-weight buy&hold within period using first/last close — no look-ahead beyond period
  let sum = 0;
  let n = 0;
  for (const sym of symbols) {
    const series = rows.filter((r) => r.symbol === sym).sort((a, b) => a.date.localeCompare(b.date));
    if (series.length < 2) continue;
    const a = series[0].close;
    const b = series[series.length - 1].close;
    if (a > 0) {
      sum += (b - a) / a;
      n += 1;
    }
  }
  return n ? sum / n : null;
}

export function runBacktest(rows, profileId = 'equilibre') {
  const empty = {
    status: 'BACKTEST TITRES NON VALIDÉ — HISTORIQUE QUOTIDIEN INSUFFISANT',
    validated: false,
    metrics: null,
    splits: null,
  };

  if (!rows || rows.length < MIN_DATES) return empty;
  const dates = uniqueDates(rows);
  if (dates.length < MIN_DATES) return empty;
  const symbols = [...new Set(rows.map((r) => r.symbol))];
  if (symbols.length < MIN_SYMBOLS) return empty;

  // 60% train / 20% validation / 20% OOS by time
  const iTrain = Math.floor(dates.length * 0.6);
  const iVal = Math.floor(dates.length * 0.8);
  if (iTrain < 10 || iVal - iTrain < 5 || dates.length - iVal < 5) return empty;

  const trainDates = dates.slice(0, iTrain);
  const valDates = dates.slice(iTrain, iVal);
  const oosDates = dates.slice(iVal);

  const trainRows = sliceRows(rows, trainDates[0], trainDates[trainDates.length - 1]);
  const valRows = sliceRows(rows, valDates[0], valDates[valDates.length - 1]);
  const oosRows = sliceRows(rows, oosDates[0], oosDates[oosDates.length - 1]);

  // Select from train only (anti look-ahead)
  const trainFeat = buildFeatures(trainRows);
  const ranked = rankUniverse(trainFeat).slice(0, 5);
  const picked = ranked.map((r) => r.symbol);
  if (!picked.length) return empty;

  const trainRet = periodReturn(trainRows, picked);
  const valRet = periodReturn(valRows, picked);
  const oosRet = periodReturn(oosRows, picked);

  // Simple max drawdown on OOS equal-weight
  const oosDatesList = uniqueDates(oosRows);
  let equity = 1;
  let peak = 1;
  let mdd = 0;
  const rets = [];
  for (let i = 1; i < oosDatesList.length; i++) {
    const d0 = oosDatesList[i - 1];
    const d1 = oosDatesList[i];
    const dayRows = oosRows.filter((r) => r.date === d0 || r.date === d1);
    const r = periodReturn(dayRows, picked);
    if (r === null) continue;
    rets.push(r);
    equity *= 1 + r;
    peak = Math.max(peak, equity);
    mdd = Math.min(mdd, equity / peak - 1);
  }

  const vol =
    rets.length > 1
      ? Math.sqrt(rets.reduce((s, x) => s + x * x, 0) / rets.length) * Math.sqrt(252)
      : null;

  const years =
    (new Date(oosDates[oosDates.length - 1]) - new Date(oosDates[0])) / (365.25 * 24 * 3600 * 1000);
  const ann =
    oosRet !== null && years > 0 ? Math.pow(1 + oosRet, 1 / Math.max(years, 1 / 12)) - 1 : null;

  return {
    status: 'VALIDÉ (échantillon)',
    validated: true,
    splits: {
      train: `${trainDates[0]} → ${trainDates[trainDates.length - 1]} (${trainDates.length} j)`,
      validation: `${valDates[0]} → ${valDates[valDates.length - 1]} (${valDates.length} j)`,
      oos: `${oosDates[0]} → ${oosDates[oosDates.length - 1]} (${oosDates.length} j)`,
    },
    selectedFromTrain: picked,
    metrics: {
      rendementCumuleOOS: oosRet,
      rendementAnnualiseOOS: ann,
      volatilite: vol,
      maxDrawdown: mdd,
      rendementTrain: trainRet,
      rendementValidation: valRet,
      transactions: picked.length,
      turnover: null,
      frais: null,
      dividendes: null,
      benchmark: null,
      note: 'Frais, dividendes et benchmark non disponibles dans le CSV — non inventés.',
    },
    profileId,
  };
}
