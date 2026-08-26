/**
 * DataProvider contract (conceptual interface).
 * Implementations must NOT invent missing fundamentals.
 *
 * Required conceptual methods:
 * - getQuotes()
 * - getHistory()
 * - getFundamentals()
 * - getMetadata()
 * - isAvailable()
 */

/**
 * @typedef {Object} DataProvider
 * @property {string} id
 * @property {string} label
 * @property {() => Promise<boolean>|boolean} isAvailable
 * @property {() => Promise<import('./types.js').ProviderResult>} getQuotes
 * @property {(symbol?: string) => Promise<import('./types.js').ProviderResult>} getHistory
 * @property {(symbol?: string) => Promise<import('./types.js').ProviderResult>} getFundamentals
 * @property {() => Promise<import('./types.js').DataMetadata>|import('./types.js').DataMetadata} getMetadata
 */

export function assertProviderShape(provider) {
  const required = ['id', 'label', 'isAvailable', 'getQuotes', 'getHistory', 'getFundamentals', 'getMetadata'];
  for (const key of required) {
    if (provider == null || provider[key] === undefined) {
      throw new Error(`DataProvider incomplete: missing ${key}`);
    }
  }
  return true;
}
