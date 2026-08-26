/**
 * Patrimonial simulation helpers.
 * Never invent market returns — rates are explicit user hypotheses unless noted.
 */

function truncYear(y, fallback) {
  const n = Math.trunc(Number(y));
  return Number.isFinite(n) ? n : fallback;
}

/** Normalize a cashflow schedule (calendar years). */
export function normalizeSchedule({
  initialApport = 0,
  spotAmount = 0,
  monthly = 0,
  planStartYear,
  spotYear,
  recurrentStartYear,
  horizonYears = 1,
  nowYear = new Date().getFullYear(),
} = {}) {
  const start = truncYear(planStartYear, nowYear);
  const horizon = Math.max(1, Math.trunc(Number(horizonYears) || 1));
  const endYear = start + horizon;
  let spotY = truncYear(spotYear, start);
  let recY = truncYear(recurrentStartYear, start);
  if (spotY < start) spotY = start;
  if (recY < start) recY = start;
  if (spotY > endYear) spotY = endYear;
  if (recY > endYear) recY = endYear;

  return {
    initialApport: Math.max(0, Number(initialApport) || 0),
    spotAmount: Math.max(0, Number(spotAmount) || 0),
    monthly: Math.max(0, Number(monthly) || 0),
    planStartYear: start,
    spotYear: spotY,
    recurrentStartYear: recY,
    horizonYears: horizon,
    endYear,
    spotOffsetYears: spotY - start,
    recurrentOffsetYears: recY - start,
  };
}

/** Legacy FV: lump sum at t0 + monthly from month 0. */
export function futureValue(capital, monthly, annualRate, years) {
  return futureValueScheduled({
    initialApport: 0,
    spotAmount: capital,
    monthly,
    annualRate,
    planStartYear: 2000,
    spotYear: 2000,
    recurrentStartYear: 2000,
    horizonYears: years,
  });
}

export function capitalContributed(capital, monthly, years) {
  return capitalContributedScheduled({
    initialApport: 0,
    spotAmount: capital,
    monthly,
    planStartYear: 2000,
    spotYear: 2000,
    recurrentStartYear: 2000,
    horizonYears: years,
  });
}

/**
 * Month-by-month FV with:
 * - apport initial at plan start (month 0)
 * - investissement spot at spotYear (January of that year)
 * - apports mensuels from recurrentStartYear through horizon end
 */
export function futureValueScheduled({
  initialApport = 0,
  spotAmount = 0,
  monthly = 0,
  annualRate = 0,
  planStartYear,
  spotYear,
  recurrentStartYear,
  horizonYears = 1,
} = {}) {
  const s = normalizeSchedule({
    initialApport,
    spotAmount,
    monthly,
    planStartYear,
    spotYear,
    recurrentStartYear,
    horizonYears,
  });
  const r = Number(annualRate) || 0;
  const monthlyRate = r / 12;
  const months = 12 * s.horizonYears;
  const spotMonth = s.spotOffsetYears * 12;
  const recMonth = s.recurrentOffsetYears * 12;

  let z = 0;
  for (let i = 0; i < months; i++) {
    if (i === 0) z += s.initialApport;
    if (i === spotMonth) z += s.spotAmount;
    if (i >= recMonth) z += s.monthly;
    z = z * (1 + monthlyRate);
  }
  return z;
}

/**
 * Attribute terminal FV to each cashflow source (same monthly compounding as FV).
 * Holdings assumed already held at plan start — grown over full horizon.
 * Never invents a rate: annualRate is an explicit hypothesis.
 */
export function futureValueBySource({
  initialApport = 0,
  spotAmount = 0,
  monthly = 0,
  annualRate = 0,
  planStartYear,
  spotYear,
  recurrentStartYear,
  horizonYears = 1,
  holdingsMarketValue = 0,
} = {}) {
  const s = normalizeSchedule({
    initialApport,
    spotAmount,
    monthly,
    planStartYear,
    spotYear,
    recurrentStartYear,
    horizonYears,
  });
  const r = Number(annualRate) || 0;
  const monthlyRate = r / 12;
  const months = 12 * s.horizonYears;
  const spotMonth = s.spotOffsetYears * 12;
  const recMonth = s.recurrentOffsetYears * 12;

  let initialGrown = 0;
  let spotGrown = 0;
  let recurrentGrown = 0;
  let holdingsGrown = Math.max(0, Number(holdingsMarketValue) || 0);
  let recurrentContributed = 0;

  for (let i = 0; i < months; i++) {
    if (i === 0) initialGrown += s.initialApport;
    if (i === spotMonth) spotGrown += s.spotAmount;
    if (i >= recMonth) {
      recurrentGrown += s.monthly;
      recurrentContributed += s.monthly;
    }
    initialGrown *= 1 + monthlyRate;
    spotGrown *= 1 + monthlyRate;
    recurrentGrown *= 1 + monthlyRate;
    holdingsGrown *= 1 + monthlyRate;
  }

  const hold0 = Math.max(0, Number(holdingsMarketValue) || 0);
  const bucket = (contributed, grown) => {
    const c = Math.max(0, Number(contributed) || 0);
    const g = Math.max(0, Number(grown) || 0);
    return {
      contributed: c,
      grown: g,
      appreciation: g - c,
    };
  };

  return {
    schedule: s,
    rate: r,
    initial: bucket(s.initialApport, initialGrown),
    spot: bucket(s.spotAmount, spotGrown),
    recurrent: bucket(recurrentContributed, recurrentGrown),
    holdings: bucket(hold0, holdingsGrown),
    totalGrown: initialGrown + spotGrown + recurrentGrown + holdingsGrown,
    planGrown: initialGrown + spotGrown + recurrentGrown,
  };
}

export function capitalContributedScheduled({
  initialApport = 0,
  spotAmount = 0,
  monthly = 0,
  planStartYear,
  spotYear,
  recurrentStartYear,
  horizonYears = 1,
} = {}) {
  const s = normalizeSchedule({
    initialApport,
    spotAmount,
    monthly,
    planStartYear,
    spotYear,
    recurrentStartYear,
    horizonYears,
  });
  const months = 12 * s.horizonYears;
  const recMonth = s.recurrentOffsetYears * 12;
  const recurrentMonths = Math.max(0, months - recMonth);
  return s.initialApport + s.spotAmount + s.monthly * recurrentMonths;
}

/** Projection table for selected horizons up to maxYears (from plan start). */
export function buildProjections(capital, monthly, centralRate, maxYears) {
  return buildProjectionsScheduled({
    initialApport: 0,
    spotAmount: capital,
    monthly,
    annualRate: centralRate,
    planStartYear: 2000,
    spotYear: 2000,
    recurrentStartYear: 2000,
    horizonYears: maxYears,
  });
}

export function buildProjectionsScheduled({
  initialApport = 0,
  spotAmount = 0,
  monthly = 0,
  annualRate = 0,
  planStartYear,
  spotYear,
  recurrentStartYear,
  horizonYears = 1,
} = {}) {
  const s = normalizeSchedule({
    initialApport,
    spotAmount,
    monthly,
    planStartYear,
    spotYear,
    recurrentStartYear,
    horizonYears,
  });
  const y = s.horizonYears;
  const base = [1, 5, 10, 20, 25, 30, 40, 50, 100];
  const pts = base.filter((x) => x <= y);
  if (!pts.includes(y)) pts.push(y);
  pts.sort((a, b) => a - b);

  const prudent = 0.05;
  const dynamic = 0.12;
  const central = Number(annualRate) || 0.09;

  return pts.map((t) => {
    const common = {
      initialApport: s.initialApport,
      spotAmount: s.spotAmount,
      monthly: s.monthly,
      planStartYear: s.planStartYear,
      spotYear: s.spotYear,
      recurrentStartYear: s.recurrentStartYear,
      horizonYears: t,
    };
    const contributed = capitalContributedScheduled(common);
    const prudentFv = futureValueScheduled({ ...common, annualRate: prudent });
    const centralFv = futureValueScheduled({ ...common, annualRate: central });
    const dynamicFv = futureValueScheduled({ ...common, annualRate: dynamic });
    return {
      years: t,
      endYear: s.planStartYear + t,
      contributed,
      prudent: prudentFv,
      central: centralFv,
      dynamic: dynamicFv,
      gainCentral: centralFv - contributed,
      deltaContributedVsCentral: centralFv - contributed,
      schedule: {
        planStartYear: s.planStartYear,
        spotYear: s.spotYear,
        recurrentStartYear: s.recurrentStartYear,
      },
    };
  });
}
