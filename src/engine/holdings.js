/**
 * Existing holdings entered by the user (already purchased).
 * Market value uses the most recent close within ~3 days of asOf (J-1) — never invents prices.
 */

import { resolveSymbolInput } from '../data/companyNames.js';

export const MARKET_PRICE_MAX_AGE_DAYS = 3;

export function normalizeHolding(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const symbol = resolveSymbolInput(raw.symbol);
  const shares = Number(raw.shares);
  const avgCost = raw.avgCost === '' || raw.avgCost == null ? null : Number(raw.avgCost);
  if (!symbol || !Number.isFinite(shares) || shares <= 0) return null;
  return {
    symbol,
    shares: Math.floor(shares),
    avgCost: Number.isFinite(avgCost) && avgCost > 0 ? avgCost : null,
  };
}

export function normalizeHoldings(list) {
  const map = new Map();
  const rejected = [];
  for (const raw of list || []) {
    const h = normalizeHolding(raw);
    if (!h) {
      rejected.push(raw);
      continue;
    }
    const prev = map.get(h.symbol);
    if (!prev) {
      map.set(h.symbol, { ...h });
    } else {
      const totalShares = prev.shares + h.shares;
      let avgCost = prev.avgCost;
      if (prev.avgCost != null && h.avgCost != null) {
        avgCost = (prev.avgCost * prev.shares + h.avgCost * h.shares) / totalShares;
      } else if (h.avgCost != null) {
        avgCost = h.avgCost;
      }
      map.set(h.symbol, { symbol: h.symbol, shares: totalShares, avgCost });
    }
  }
  return {
    holdings: [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)),
    rejected,
  };
}

function parseDay(iso) {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? t : null;
}

/** Calendar day difference (asOf - date), null if unparsable. */
export function calendarAgeDays(dateIso, asOfIso) {
  const a = parseDay(dateIso);
  const b = parseDay(asOfIso);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * Most recent close with date <= asOf and age <= maxAgeDays.
 * Never invents a price. Returns fresh:false when none in window.
 */
export function resolveRecentClose(
  series,
  asOf,
  maxAgeDays = MARKET_PRICE_MAX_AGE_DAYS
) {
  const empty = {
    price: null,
    priceDate: null,
    ageDays: null,
    fresh: false,
    reason: 'MISSING',
  };
  if (!asOf || !Array.isArray(series) || !series.length) return empty;

  let best = null;
  for (const bar of series) {
    const d = bar?.date;
    const close = Number(bar?.close);
    if (!d || String(d) > String(asOf)) continue;
    if (!Number.isFinite(close) || close <= 0) continue;
    const age = calendarAgeDays(d, asOf);
    if (age == null || age < 0 || age > maxAgeDays) continue;
    if (!best || String(d) >= String(best.date)) {
      best = { date: d, close, age };
    }
  }

  if (!best) {
    // Diagnose: last bar overall (may be stale)
    const sorted = [...series].filter((b) => b?.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const last = sorted[sorted.length - 1];
    const lastAge = last ? calendarAgeDays(last.date, asOf) : null;
    return {
      price: null,
      priceDate: last?.date || null,
      ageDays: lastAge,
      fresh: false,
      reason: last && lastAge != null && lastAge > maxAgeDays ? 'STALE' : 'MISSING',
    };
  }

  return {
    price: best.close,
    priceDate: best.date,
    ageDays: best.age,
    fresh: true,
    reason: null,
  };
}

function normalizePriceEntry(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return { price: raw, priceDate: null, ageDays: null, fresh: true, reason: null };
  }
  if (typeof raw === 'object') {
    const price = Number(raw.price);
    if (!Number.isFinite(price) || price <= 0 || raw.fresh === false) return {
      price: null,
      priceDate: raw.priceDate ?? null,
      ageDays: raw.ageDays ?? null,
      fresh: false,
      reason: raw.reason || 'STALE',
    };
    return {
      price,
      priceDate: raw.priceDate ?? null,
      ageDays: raw.ageDays ?? null,
      fresh: raw.fresh !== false,
      reason: raw.reason ?? null,
    };
  }
  return null;
}

/**
 * Mark holdings to market using feature/price map.
 * Accepts Map/Record of number or { price, priceDate, ageDays, fresh }.
 */
export function markHoldings(holdings, priceBySymbol) {
  const getEntry = (sym) => {
    if (!priceBySymbol) return null;
    const raw =
      priceBySymbol instanceof Map ? priceBySymbol.get(sym) : priceBySymbol[sym];
    return normalizePriceEntry(raw);
  };

  let marketValue = 0;
  let costBasis = 0;
  let pricedCount = 0;
  const positions = (holdings || []).map((h) => {
    const entry = getEntry(h.symbol);
    const price = entry?.fresh ? entry.price : null;
    const mtm = price != null ? price * h.shares : null;
    const cost = h.avgCost != null ? h.avgCost * h.shares : null;
    const pnl = mtm != null && cost != null ? mtm - cost : null;
    if (mtm != null) {
      marketValue += mtm;
      pricedCount += 1;
    }
    if (cost != null) costBasis += cost;
    return {
      ...h,
      price,
      priceDate: entry?.priceDate ?? null,
      priceAgeDays: entry?.ageDays ?? null,
      priceFresh: Boolean(entry?.fresh && price != null),
      priceReason: entry?.reason ?? (price == null ? 'MISSING' : null),
      marketValue: mtm,
      costBasis: cost,
      pnl,
      priced: price != null,
    };
  });

  return {
    positions,
    marketValue,
    costBasis: costBasis || null,
    pnl: costBasis ? marketValue - costBasis : null,
    pricedCount,
    positionCount: positions.length,
    symbols: positions.map((p) => p.symbol),
    pricePolicy: {
      maxAgeDays: MARKET_PRICE_MAX_AGE_DAYS,
      note: `Cours = dernier close ≤ asOf et ≤ ${MARKET_PRICE_MAX_AGE_DAYS} j — le plus récent, jamais inventé`,
    },
  };
}

/**
 * Attach observed price-return / yield stats from features onto marked holdings.
 * Never invents missing CAGR or dividends.
 */
export function attachFeatureStats(marked, features) {
  const bySym = new Map();
  for (const f of features || []) {
    if (f?.symbol) bySym.set(String(f.symbol).toUpperCase(), f);
  }
  const positions = (marked?.positions || []).map((p) => {
    const f = bySym.get(String(p.symbol).toUpperCase());
    return {
      ...p,
      totalReturn: f?.totalReturn ?? null,
      annualizedReturn: f?.annualizedReturn ?? null,
      priceCagr: f?.priceCagr ?? f?.annualizedReturn ?? null,
      avgAnnualReturn: f?.avgAnnualReturn ?? null,
      annualYears: f?.annualYears ?? 0,
      returnDays: f?.returnDays ?? null,
      returnBasis: f?.returnBasis || 'PRICE_ONLY',
      dividendsIncluded: Boolean(f?.dividendYield != null && f.dividendYield > 0),
      dividendYield: f?.dividendYield ?? null,
    };
  });
  return {
    ...marked,
    positions,
    returnNote:
      'Appréciation = prix seulement (CAGR / moy. géom. annuelle). Dividendes INTERNAL absents — jamais inventés.',
  };
}

/**
 * Build price map from features (only fresh market prices within policy window).
 */
export function holdingsToPriceMap(features) {
  const map = new Map();
  for (const f of features || []) {
    if (!f?.symbol) continue;
    if (f.priceFresh === false || f.price == null || !(f.price > 0)) {
      map.set(f.symbol, {
        price: null,
        priceDate: f.priceDate ?? f.lastDate ?? null,
        ageDays: f.priceAgeDays ?? null,
        fresh: false,
        reason: f.priceReason || 'STALE',
      });
      continue;
    }
    map.set(f.symbol, {
      price: f.price,
      priceDate: f.priceDate ?? f.lastDate ?? null,
      ageDays: f.priceAgeDays ?? null,
      fresh: true,
      reason: null,
    });
  }
  return map;
}
