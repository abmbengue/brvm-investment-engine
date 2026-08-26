/**
 * Future official/authorized daily stock history schema.
 * Not populated by the annual index series — never invent daily bars from annual points.
 *
 * Required columns for a validated stock backtest:
 * date,symbol,open,high,low,close,volume
 */

export const FUTURE_DAILY_SCHEMA = Object.freeze({
  kind: 'DAILY_BARS',
  columns: Object.freeze([
    'date',
    'symbol',
    'open',
    'high',
    'low',
    'close',
    'volume',
  ]),
  stockBacktestValidated: false,
  stockBacktestMessage:
    'BACKTEST TITRES NON VALIDÉ — HISTORIQUE QUOTIDIEN INSUFFISANT',
  note:
    'Schéma préparé pour un futur dataset quotidien officiel/autorisé. Absent aujourd’hui.',
});
