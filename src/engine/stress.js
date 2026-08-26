import { getProfile } from './profiles.js';
import { futureValue, futureValueScheduled } from './simulation.js';

/**
 * Stress scenarios on projected portfolio value.
 * Optional historicalCalibration adds observed annual PRICE_INDEX scenarios (never invented).
 */
export function runStress({
  capital,
  monthly,
  years,
  centralRate,
  allocation,
  profileId,
  historicalCalibration = null,
  schedule = null,
}) {
  const profile = getProfile(profileId);
  const haircut = profile.stressHaircut;
  const invested = allocation?.invested ?? 0;
  const reserve = allocation?.reserve ?? Math.max(0, capital);

  const scenarios = [
    {
      id: 'baissier',
      label: 'Marché baissier',
      rate: Math.max(-0.15, centralRate - 0.2),
      shock: -haircut - 0.15,
      source: 'PROFILE',
    },
    {
      id: 'faible',
      label: 'Faible rendement',
      rate: Math.max(0, centralRate * 0.4),
      shock: -haircut * 0.5,
      source: 'PROFILE',
    },
    {
      id: 'central',
      label: 'Central',
      rate: centralRate,
      shock: 0,
      source: 'PROFILE',
    },
    {
      id: 'favorable',
      label: 'Favorable',
      rate: centralRate + 0.03,
      shock: haircut * 0.3,
      source: 'PROFILE',
    },
  ];

  if (historicalCalibration?.ok && Array.isArray(historicalCalibration.scenarios)) {
    for (const h of historicalCalibration.scenarios) {
      scenarios.push({
        id: h.id,
        label: `${h.label} [indice annuel]`,
        rate: h.rate,
        shock: Math.min(0, h.rate),
        source: 'ANNUAL_PRICE_INDEX',
        seriesType: historicalCalibration.seriesType || 'PRICE_INDEX',
      });
    }
  }

  return scenarios.map((s) => {
    const shockedCapital = Math.max(0, invested * (1 + s.shock) + reserve);
    const rate = Math.max(-0.5, s.rate);
    let fv;
    if (schedule) {
      fv = futureValueScheduled({
        ...schedule,
        spotAmount: shockedCapital,
        initialApport: schedule.initialApport || 0,
        monthly: schedule.monthly ?? monthly,
        annualRate: rate,
        horizonYears: schedule.horizonYears ?? years,
      });
    } else {
      fv = futureValue(shockedCapital, monthly, rate, years);
    }
    const positionScale = s.shock < -0.1 ? Math.max(0.4, 1 + s.shock) : 1;
    return {
      ...s,
      shockedCapital,
      futureValue: fv,
      recommendedPositionScale: Math.round(positionScale * 100) / 100,
      note:
        s.source === 'ANNUAL_PRICE_INDEX'
          ? 'Calibré sur rendement annuel d’indice (PRICE_INDEX) — pas LIVE, pas backtest titres'
          : s.shock < -0.1
            ? 'Réduire la taille de position (risque marginal excessif)'
            : 'Taille de position maintenue',
    };
  });
}
