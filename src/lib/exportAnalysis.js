/**
 * Professional CSV export for allocation / decisions / portfolio.
 * Always stamps data mode, asOf, and Pas LIVE BRVM.
 */

import { getCompanyName } from '../data/companyNames.js';

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function stampMeta(result) {
  const ds = result?.dataStatus || {};
  return {
    data_mode: ds.mode || 'NONE',
    asOf: ds.asOf || '',
    live: 'NON',
    live_policy: 'Pas LIVE BRVM',
    asOf_policy: 'J-1',
    exported_at: new Date().toISOString(),
    engine_version: result?.engineVersion || '',
    disclaimer: 'Simulation analytique — ne constitue pas un ordre de bourse',
  };
}

export function buildAllocationExportRows(result) {
  const meta = stampMeta(result);
  return (result?.allocation?.positions || []).map((p) => ({
    ...meta,
    symbol: p.symbol,
    companyName: p.companyName || getCompanyName(p.symbol),
    decision: p.buyShares > 0 ? (p.alreadyHeld ? 'ADD' : 'BUY') : p.alreadyHeld ? 'HOLD' : '—',
    weight_actuel_pct: p.weightPct,
    weight_cible_pct: p.targetWeightPct,
    ecart_pct: Math.round(((p.weightPct || 0) - (p.targetWeightPct || 0)) * 10) / 10,
    montant_actuel: p.amount,
    montant_cible: Math.round(p.targetAmount || 0),
    montant_achat_propose: p.buyAmount || 0,
    shares: p.shares,
    buy_shares: p.buyShares || 0,
    score: p.score ?? '',
    confidence: p.confidence != null ? Math.round(p.confidence * 100) : '',
    data_quality_pct: p.dataQuality != null ? Math.round(p.dataQuality * 100) : '',
    rendement_annuel_observe:
      p.annualizedReturn != null ? Math.round(p.annualizedReturn * 10000) / 100 : '',
    moy_annuelle_geom_pct:
      p.avgAnnualReturn != null ? Math.round(p.avgAnnualReturn * 10000) / 100 : '',
    annees_calendaires: p.annualYears ?? '',
    rendement_periode_observe:
      p.totalReturn != null ? Math.round(p.totalReturn * 10000) / 100 : '',
    base_rendement: 'PRICE_ONLY',
    dividende_inclus: 'NON',
  }));
}

export function buildDecisionsExportRows(result) {
  const meta = stampMeta(result);
  const bySym = new Map((result?.allocation?.positions || []).map((p) => [p.symbol, p]));
  return (result?.decisions || []).map((d) => {
    const p = bySym.get(d.symbol);
    return {
      ...meta,
      symbol: d.symbol,
      companyName: d.companyName || getCompanyName(d.symbol),
      action: d.action,
      score: d.score ?? '',
      confidence_pct: d.confidence != null ? Math.round(d.confidence * 100) : '',
      data_quality_pct: d.dataQuality != null ? Math.round(d.dataQuality * 100) : '',
      rendement_annuel_observe:
        d.annualizedReturn != null ? Math.round(d.annualizedReturn * 10000) / 100 : '',
      risk: d.risk || '',
      justification: d.justification || '',
      invalidation: d.invalidation || '',
      weight_actuel_pct: p?.weightPct ?? '',
      weight_cible_pct: p?.targetWeightPct ?? '',
      ecart_pct:
        p != null
          ? Math.round(((p.weightPct || 0) - (p.targetWeightPct || 0)) * 10) / 10
          : '',
    };
  });
}

export function buildPortfolioExportRows(result) {
  const meta = stampMeta(result);
  const rows = [];
  rows.push({
    ...meta,
    section: 'CASH',
    symbol: 'APPORT_INITIAL',
    companyName: 'Apport initial',
    shares: '',
    avg_cost: '',
    price: '',
    market_value: result?.initialApport ?? 0,
    weight_pct: '',
    target_weight_pct: '',
    ecart_pct: '',
    pnl: '',
  });
  rows.push({
    ...meta,
    section: 'CASH',
    symbol: 'CASH_SPOT',
    companyName: 'Investissement spot',
    shares: '',
    avg_cost: '',
    price: '',
    market_value: result?.spotCash ?? result?.capital ?? 0,
    weight_pct: '',
    target_weight_pct: '',
    ecart_pct: '',
    pnl: '',
  });
  for (const h of result?.holdings?.positions || []) {
    const alloc = (result?.allocation?.positions || []).find((p) => p.symbol === h.symbol);
    rows.push({
      ...meta,
      section: 'HOLDING',
      symbol: h.symbol,
      companyName: getCompanyName(h.symbol),
      shares: h.shares,
      avg_cost: h.avgCost ?? '',
      price: h.price ?? '',
      market_value: h.marketValue ?? '',
      weight_pct: alloc?.weightPct ?? '',
      target_weight_pct: alloc?.targetWeightPct ?? '',
      ecart_pct:
        alloc != null
          ? Math.round(((alloc.weightPct || 0) - (alloc.targetWeightPct || 0)) * 10) / 10
          : '',
      pnl: h.pnl ?? '',
      moy_annuelle_geom_pct:
        h.avgAnnualReturn != null ? Math.round(h.avgAnnualReturn * 10000) / 100 : '',
      cagr_prix_pct:
        h.annualizedReturn != null ? Math.round(h.annualizedReturn * 10000) / 100 : '',
      dividend_yield_pct:
        h.dividendYield != null ? Math.round(h.dividendYield * 10000) / 100 : '',
      base_rendement: 'PRICE_ONLY',
    });
  }
  return rows;
}

export function exportAnalysisCsv(result, kind = 'decisions') {
  let headers;
  let rows;
  if (kind === 'allocation') {
    rows = buildAllocationExportRows(result);
    headers = Object.keys(rows[0] || stampMeta(result));
  } else if (kind === 'portfolio') {
    rows = buildPortfolioExportRows(result);
    headers = Object.keys(rows[0] || stampMeta(result));
  } else {
    rows = buildDecisionsExportRows(result);
    headers = Object.keys(rows[0] || stampMeta(result));
  }
  if (!rows.length) {
    rows = [{ ...stampMeta(result), note: 'Aucune ligne à exporter' }];
    headers = Object.keys(rows[0]);
  }
  const csv = toCsv(headers, rows);
  const mode = result?.dataStatus?.mode || 'NONE';
  const asOf = result?.dataStatus?.asOf || 'na';
  const filename = `brvm-${kind}-${mode}-asOf-${asOf}-pas-LIVE.csv`.replace(/[^\w.-]+/g, '_');
  return { csv, filename, rowCount: rows.length };
}

export function downloadTextFile(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
