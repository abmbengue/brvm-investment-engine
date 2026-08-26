/**
 * Common market data types for all providers.
 * Absent fields stay null — never invent values.
 */

/** @typedef {'LIVE'|'CSV'|'SAMPLE'|'NONE'|'BLOCKED'} DataMode */

/**
 * @typedef {Object} NormalizedBar
 * @property {string} date YYYY-MM-DD
 * @property {string} symbol
 * @property {number} close
 * @property {number} volume
 * @property {number|null} [pe]
 * @property {number|null} [dividendYield]
 * @property {number|null} [roe]
 * @property {number|null} [revenueGrowth]
 * @property {number|null} [debtEquity]
 * @property {number|null} [marketCap]
 * @property {number|null} [sharesOutstanding]
 */

/**
 * @typedef {Object} DataMetadata
 * @property {string} sourceId
 * @property {string} sourceLabel
 * @property {DataMode} mode
 * @property {boolean} live
 * @property {string|null} asOf ISO timestamp or date of last observation
 * @property {number|null} freshnessMinutes age in minutes if known
 * @property {string} retrievedAt ISO timestamp of local retrieval
 * @property {string[]} symbols
 * @property {number} rowCount
 * @property {string|null} note
 */

/**
 * @typedef {Object} ProviderResult
 * @property {boolean} ok
 * @property {boolean} available
 * @property {NormalizedBar[]} rows
 * @property {DataMetadata} meta
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {object|null} [csvCompat] legacy parseCsv-shaped object for pipeline
 */

export const DATA_MODES = Object.freeze({
  LIVE: 'LIVE',
  CSV: 'CSV',
  SAMPLE: 'SAMPLE',
  INTERNAL: 'INTERNAL',
  NONE: 'NONE',
  BLOCKED: 'BLOCKED',
});
