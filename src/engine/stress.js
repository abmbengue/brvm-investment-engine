import { getProfile } from './profiles.js';
import { futureValue } from './simulation.js';

/**
 * Stress scenarios on projected portfolio value.
 */
export function runStress({ capital, monthly, years, centralRate, allocation, profileId }) {
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
    },
    {
      id: 'faible',
      label: 'Faible rendement',
      rate: Math.max(0, centralRate * 0.4),
      shock: -haircut * 0.5,
    },
    {
      id: 'central',
      label: 'Central',
      rate: centralRate,
      shock: 0,
    },
    {
      id: 'favorable',
      label: 'Favorable',
      rate: centralRate + 0.03,
      shock: haircut * 0.3,
    },
  ];

  return scenarios.map((s) => {
    const shockedCapital = Math.max(0, invested * (1 + s.shock) + reserve);
    const fv = futureValue(shockedCapital, monthly, Math.max(-0.5, s.rate), years);
    const positionScale =
      s.shock < -0.1 ? Math.max(0.4, 1 + s.shock) : 1;
    return {
      ...s,
      shockedCapital,
      futureValue: fv,
      recommendedPositionScale: Math.round(positionScale * 100) / 100,
      note:
        s.shock < -0.1
          ? 'Réduire la taille de position (risque marginal excessif)'
          : 'Taille de position maintenue',
    };
  });
}
