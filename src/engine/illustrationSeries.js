/**
 * Build illustration series for charts.
 * Rates/dividends are explicit hypotheses or observed yields — never invent missing market data.
 */
import { normalizeSchedule, futureValueScheduled, capitalContributedScheduled } from './simulation.js';

function roundMoney(n) {
  return Math.round(Number(n) || 0);
}

/**
 * Portfolio dividend yield from allocation positions that have an observed dividendYield.
 * Returns null if insufficient coverage.
 */
export function portfolioDividendYield(allocation) {
  const positions = allocation?.positions || [];
  let w = 0;
  let known = 0;
  for (const p of positions) {
    const dy = p.dividendYield;
    const weight = p.weight || 0;
    if (weight > 0 && dy != null && Number.isFinite(dy) && dy >= 0) {
      w += weight * dy;
      known += weight;
    }
  }
  if (known < 0.05) return null;
  return w / known;
}

/**
 * Year-by-year series from plan start through horizon (calendar years on X).
 */
export function buildYearlyIllustration({
  schedule,
  annualRate = 0,
  titlesRate = null,
  holdingsMarketValue = 0,
  dividendYield = null,
} = {}) {
  const s = normalizeSchedule(schedule || {});
  const rate = Number(annualRate) || 0;
  const hold0 = Math.max(0, Number(holdingsMarketValue) || 0);
  const hasTitles = titlesRate != null && Number.isFinite(titlesRate);
  const hasDiv = dividendYield != null && Number.isFinite(dividendYield) && dividendYield > 0;

  const years = [];
  for (let elapsed = 1; elapsed <= s.horizonYears; elapsed++) {
    const calendarYear = s.planStartYear + elapsed - 1;
    const common = {
      initialApport: s.initialApport,
      spotAmount: s.spotAmount,
      monthly: s.monthly,
      planStartYear: s.planStartYear,
      spotYear: s.spotYear,
      recurrentStartYear: s.recurrentStartYear,
      horizonYears: elapsed,
    };

    const initialThisYear = calendarYear === s.planStartYear ? s.initialApport : 0;
    const spotThisYear = calendarYear === s.spotYear ? s.spotAmount : 0;
    const recurrentThisYear =
      calendarYear >= s.recurrentStartYear ? s.monthly * 12 : 0;

    // Dividend hypothesis only after spot year, on deployed equity approx (spot + holdings)
    let dividendEst = 0;
    if (hasDiv && calendarYear >= s.spotYear) {
      const equityBase = hold0 + s.spotAmount;
      dividendEst = equityBase * dividendYield;
    }

    const contributed = capitalContributedScheduled(common);
    const portfolioValue = futureValueScheduled({ ...common, annualRate: rate });
    const portfolioTitles = hasTitles
      ? futureValueScheduled({ ...common, annualRate: titlesRate })
      : null;

    // Holdings grown at hypothesis rate for elapsed years (separate stock path)
    const holdingsGrown = hold0 * (1 + rate) ** elapsed;

    years.push({
      year: calendarYear,
      elapsed,
      initialApport: roundMoney(initialThisYear),
      spot: roundMoney(spotThisYear),
      recurrent: roundMoney(recurrentThisYear),
      dividendEst: roundMoney(dividendEst),
      contributedCum: roundMoney(contributed),
      portfolioValue: roundMoney(portfolioValue),
      portfolioTitles: portfolioTitles == null ? null : roundMoney(portfolioTitles),
      holdingsGrown: roundMoney(holdingsGrown),
      gain: roundMoney(portfolioValue - contributed),
    });
  }

  const totalInitial = s.initialApport;
  const totalSpot = s.spotAmount;
  const totalRecurrent = Math.max(0, capitalContributedScheduled(s) - totalInitial - totalSpot);
  const totalDividendEst = years.reduce((a, y) => a + y.dividendEst, 0);

  return {
    schedule: s,
    rate,
    titlesRate: hasTitles ? titlesRate : null,
    dividendYield: hasDiv ? dividendYield : null,
    dividendNote: hasDiv
      ? 'Dividendes estimés = rendement dividende observé × (spot + holdings) — hypothèse, pas un cash réel'
      : 'Dividendes non illustrés — yield observé insuffisant sur l’allocation',
    years,
    xDomain: [s.planStartYear, s.planStartYear + s.horizonYears - 1],
    capitalStructure: [
      { name: 'Apport initial', value: roundMoney(totalInitial), key: 'initial' },
      { name: 'Investissement spot', value: roundMoney(totalSpot), key: 'spot' },
      { name: 'Apports récurrents', value: roundMoney(totalRecurrent), key: 'recurrent' },
    ].filter((x) => x.value > 0),
    totals: {
      contributed: roundMoney(capitalContributedScheduled(s)),
      dividendEst: roundMoney(totalDividendEst),
      holdingsNow: roundMoney(hold0),
    },
  };
}

/** Tick interval so X axis stays readable for long horizons. */
export function yearTickInterval(horizonYears) {
  const h = Math.max(1, Number(horizonYears) || 1);
  if (h <= 12) return 0; // every year
  if (h <= 25) return 1; // every 2
  if (h <= 40) return 4; // every 5
  if (h <= 80) return 9; // every 10
  return 19; // every 20
}

export function allocationPieRows(allocation) {
  const positions = (allocation?.positions || []).filter((p) => (p.weight || 0) > 0);
  return positions
    .map((p) => ({
      name: p.symbol,
      value: Math.round((p.weight || 0) * 1000) / 10,
      companyName: p.companyName || p.symbol,
    }))
    .sort((a, b) => b.value - a.value);
}

export function decisionPieRows(decisions) {
  const counts = {};
  for (const d of decisions || []) {
    const a = d.action || '—';
    counts[a] = (counts[a] || 0) + 1;
  }
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

export function reservePieRows(allocation) {
  const invested = Math.max(0, allocation?.invested || 0);
  const reserve = Math.max(0, allocation?.reserve || 0);
  const rows = [
    { name: 'Spot investi', value: Math.round(invested), key: 'invested' },
    { name: 'Réserve / cash', value: Math.round(reserve), key: 'reserve' },
  ];
  return rows.filter((r) => r.value > 0);
}
