/**
 * Existing holdings entered by the user (already purchased).
 * Market value uses last known price when available — never invents prices.
 */

export function normalizeHolding(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const symbol = String(raw.symbol || '')
    .trim()
    .toUpperCase();
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

/**
 * Mark holdings to market using feature/price map.
 * @param {Array<{symbol:string,shares:number,avgCost:number|null}>} holdings
 * @param {Map<string, number>|Record<string, number>} priceBySymbol
 */
export function markHoldings(holdings, priceBySymbol) {
  const getPrice = (sym) => {
    if (!priceBySymbol) return null;
    if (priceBySymbol instanceof Map) return priceBySymbol.get(sym) ?? null;
    const v = priceBySymbol[sym];
    return Number.isFinite(v) && v > 0 ? v : null;
  };

  let marketValue = 0;
  let costBasis = 0;
  let pricedCount = 0;
  const positions = (holdings || []).map((h) => {
    const price = getPrice(h.symbol);
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
  };
}

export function holdingsToPriceMap(features) {
  const map = new Map();
  for (const f of features || []) {
    if (f.symbol && f.price > 0) map.set(f.symbol, f.price);
  }
  return map;
}
