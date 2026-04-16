/** Stable id for list rows and URLs (matches one aggregate per date+symbol). */
export function stableTradeId(trade) {
  return trade.id ?? `legacy-${trade.date}-${trade.symbol}`;
}

export function findTradeByParam(trades, paramId) {
  if (!paramId) return null;
  let decoded = paramId;
  try {
    decoded = decodeURIComponent(paramId);
  } catch {
    /* keep raw */
  }
  return trades.find((t) => stableTradeId(t) === decoded) ?? null;
}

export function sortedTradesForNav(trades) {
  return [...trades].sort((a, b) => {
    const c = b.date.localeCompare(a.date);
    return c !== 0 ? c : String(a.symbol).localeCompare(String(b.symbol));
  });
}

export function neighborTradeIds(trades, currentId) {
  const list = sortedTradesForNav(trades);
  const ids = list.map((t) => stableTradeId(t));
  const i = ids.indexOf(currentId);
  if (i < 0) return { prev: null, next: null };
  return {
    prev: i < ids.length - 1 ? ids[i + 1] : null,
    next: i > 0 ? ids[i - 1] : null,
  };
}
