import { DATA_MODES } from '../types.js';
import { assertProviderShape } from '../DataProvider.js';

/**
 * Official BRVM market data requires a subscription contract.
 * This stub never pretends to be live.
 */
export function createBrvmOfficialStubProvider() {
  async function unavailable(provider, op) {
    const meta = await provider.getMetadata();
    return {
      ok: false,
      available: false,
      rows: [],
      meta,
      errors: [
        `Source BRVM officielle indisponible (${op}) — contrat / API autorisée non configurée.`,
      ],
      warnings: [],
      csvCompat: null,
    };
  }

  const provider = {
    id: 'brvm-official',
    label: 'BRVM officiel (contrat requis)',

    isAvailable() {
      return false;
    },

    async getMetadata() {
      return {
        sourceId: 'brvm-official',
        sourceLabel: 'BRVM officiel (contrat requis)',
        mode: DATA_MODES.NONE,
        live: false,
        asOf: null,
        freshnessMinutes: null,
        retrievedAt: new Date().toISOString(),
        symbols: [],
        rowCount: 0,
        note:
          'Flux BRVM réel réservé aux souscripteurs (contrat). Aucune clé/API publique connectée dans cette version.',
      };
    },

    getQuotes() {
      return unavailable(provider, 'getQuotes');
    },

    getHistory() {
      return unavailable(provider, 'getHistory');
    },

    getFundamentals() {
      return unavailable(provider, 'getFundamentals');
    },
  };

  assertProviderShape(provider);
  return provider;
}
