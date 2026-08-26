/** Risk profiles that actually change allocation / selection parameters. */
export const RISK_PROFILES = {
  prudent: {
    id: 'prudent',
    label: 'Prudent',
    maxPositions: 5,
    maxWeight: 0.18,
    reserveRatio: 0.25,
    minScore: 55,
    minLiquidity: 0.4,
    stressHaircut: 0.35,
    concentrationLimit: 0.45,
  },
  equilibre: {
    id: 'equilibre',
    label: 'Équilibré',
    maxPositions: 8,
    maxWeight: 0.22,
    reserveRatio: 0.15,
    minScore: 48,
    minLiquidity: 0.25,
    stressHaircut: 0.25,
    concentrationLimit: 0.55,
  },
  dynamique: {
    id: 'dynamique',
    label: 'Dynamique',
    maxPositions: 10,
    maxWeight: 0.28,
    reserveRatio: 0.08,
    minScore: 42,
    minLiquidity: 0.15,
    stressHaircut: 0.15,
    concentrationLimit: 0.7,
  },
};

export function getProfile(id) {
  return RISK_PROFILES[id] || RISK_PROFILES.equilibre;
}
