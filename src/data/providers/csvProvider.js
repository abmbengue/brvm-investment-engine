import { parseCsv } from '../../lib/csv.js';
import { DATA_MODES } from '../types.js';
import { normalizeDataset, toCsvCompat } from '../normalize.js';
import { assertProviderShape } from '../DataProvider.js';

/**
 * CSV user-upload provider.
 */
export function createCsvProvider(csvText) {
  const state = { text: csvText ?? '' };

  function parse() {
    if (!String(state.text || '').trim()) {
      return {
        ok: false,
        rows: [],
        symbols: [],
        importedRows: 0,
        rejectedRows: 0,
        duplicatesRemoved: 0,
        errors: ['CSV vide'],
        warnings: [],
        delimiter: ',',
      };
    }
    return parseCsv(state.text);
  }

  async function result(provider) {
    const parsed = parse();
    if (!parsed.ok) {
      const meta = await provider.getMetadata();
      meta.mode = DATA_MODES.NONE;
      return {
        ok: false,
        available: Boolean(String(state.text || '').trim()),
        rows: [],
        meta,
        errors: parsed.errors || ['CSV invalide'],
        warnings: parsed.warnings || [],
        csvCompat: parsed,
      };
    }

    const norm = normalizeDataset(parsed.rows);
    const meta = {
      sourceId: provider.id,
      sourceLabel: provider.label,
      mode: DATA_MODES.CSV,
      live: false,
      asOf: norm.rows.length ? norm.rows[norm.rows.length - 1].date : null,
      freshnessMinutes: null,
      retrievedAt: new Date().toISOString(),
      symbols: [...new Set(norm.rows.map((r) => r.symbol))].sort(),
      rowCount: norm.rows.length,
      note: 'Import CSV — pas un flux live.',
    };

    const csvCompat = toCsvCompat(norm.rows, meta, {
      rejected: norm.rejected,
      duplicatesRemoved: norm.duplicatesRemoved,
      errors: [...(parsed.errors || []), ...norm.errors],
      warnings: [...(parsed.warnings || []), ...norm.warnings],
      delimiter: parsed.delimiter,
    });

    return {
      ok: csvCompat.ok,
      available: true,
      rows: norm.rows,
      meta,
      errors: csvCompat.errors,
      warnings: csvCompat.warnings,
      csvCompat,
    };
  }

  const provider = {
    id: 'csv-upload',
    label: 'CSV utilisateur',

    isAvailable() {
      return Boolean(String(state.text || '').trim());
    },

    setText(text) {
      state.text = text ?? '';
    },

    async getMetadata() {
      const parsed = parse();
      const lastDate = parsed.rows.length ? parsed.rows[parsed.rows.length - 1].date : null;
      return {
        sourceId: 'csv-upload',
        sourceLabel: 'CSV utilisateur',
        mode: DATA_MODES.CSV,
        live: false,
        asOf: lastDate,
        freshnessMinutes: null,
        retrievedAt: new Date().toISOString(),
        symbols: parsed.symbols || [],
        rowCount: parsed.importedRows || 0,
        note: 'Import CSV — pas un flux live.',
      };
    },

    getQuotes() {
      return result(provider);
    },

    getHistory() {
      return result(provider);
    },

    getFundamentals() {
      return result(provider);
    },
  };

  assertProviderShape(provider);
  return provider;
}
