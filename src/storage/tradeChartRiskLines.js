const PREFIX = "tradingJournalTradeChartRiskLines:";

/**
 * @param {unknown} v
 * @returns {v is { id: string, price: number }}
 */
function isRiskLineRow(v) {
  if (!v || typeof v !== "object") return false;
  const o = /** @type {{ id?: unknown, price?: unknown }} */ (v);
  return typeof o.id === "string" && o.id.length > 0 && typeof o.price === "number" && Number.isFinite(o.price);
}

/**
 * @param {string} tradeId
 * @returns {{ id: string, price: number }[]}
 */
export function loadTradeChartRiskLines(tradeId) {
  if (!tradeId) return [];
  try {
    const raw = localStorage.getItem(PREFIX + tradeId);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return p.filter(isRiskLineRow);
  } catch {
    return [];
  }
}

/**
 * @param {string} tradeId
 * @param {{ id: string, price: number }[]} lines
 */
export function saveTradeChartRiskLines(tradeId, lines) {
  if (!tradeId) return;
  try {
    if (!lines.length) {
      localStorage.removeItem(PREFIX + tradeId);
      return;
    }
    localStorage.setItem(PREFIX + tradeId, JSON.stringify(lines));
  } catch {
    /* ignore quota / private mode */
  }
}
