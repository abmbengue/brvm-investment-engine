import { createCsvProvider } from './csvProvider.js';
import { DATA_MODES } from '../types.js';
import { assertProviderShape } from '../DataProvider.js';

/**
 * Bundled SAMPLE provider — must never be labeled LIVE.
 */
export function createSampleProvider(sampleUrl) {
  const csv = createCsvProvider('');

  async function load(provider) {
    try {
      const res = await fetch(provider.sampleUrl);
      if (!res.ok) {
        return {
          ok: false,
          available: false,
          rows: [],
          meta: await provider.getMetadata(),
          errors: [`SAMPLE HTTP ${res.status}`],
          warnings: [],
          csvCompat: null,
        };
      }
      const text = await res.text();
      csv.setText(text);
      const result = await csv.getQuotes();
      result.meta = {
        ...result.meta,
        sourceId: provider.id,
        sourceLabel: provider.label,
        mode: DATA_MODES.SAMPLE,
        live: false,
        note: 'Données SAMPLE de démonstration — pas un flux live BRVM.',
      };
      if (result.csvCompat) result.csvCompat.meta = result.meta;
      return result;
    } catch (e) {
      return {
        ok: false,
        available: false,
        rows: [],
        meta: await provider.getMetadata(),
        errors: [`SAMPLE indisponible: ${e.message}`],
        warnings: [],
        csvCompat: null,
      };
    }
  }

  const provider = {
    id: 'sample',
    label: 'SAMPLE bundlé',
    sampleUrl,

    isAvailable() {
      return Boolean(sampleUrl);
    },

    async getMetadata() {
      const base = await csv.getMetadata();
      return {
        ...base,
        sourceId: 'sample',
        sourceLabel: 'SAMPLE bundlé',
        mode: DATA_MODES.SAMPLE,
        live: false,
        note: 'Données SAMPLE de démonstration — pas un flux live BRVM.',
      };
    },

    getQuotes() {
      return load(provider);
    },

    getHistory() {
      return load(provider);
    },

    getFundamentals() {
      return load(provider);
    },
  };

  assertProviderShape(provider);
  return provider;
}
