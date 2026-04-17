const PREFIX = "tradingJournalTradeChartTrendlines:";

/** @typedef {number | string} ChartTime */

/**
 * @typedef {{ id: string, t1: ChartTime, p1: number, t2: ChartTime, p2: number }} TradeTrendline
 */

/**
 * @param {unknown} v
 * @returns {v is TradeTrendline}
 */
function isTrendline(v) {
  if (!v || typeof v !== "object") return false;
  const o = /** @type {{ id?: unknown, t1?: unknown, p1?: unknown, t2?: unknown, p2?: unknown }} */ (v);
  if (typeof o.id !== "string" || o.id.length === 0) return false;
  const t1 = o.t1;
  const t2 = o.t2;
  const t1ok = typeof t1 === "number" || typeof t1 === "string";
  const t2ok = typeof t2 === "number" || typeof t2 === "string";
  if (!t1ok || !t2ok) return false;
  return typeof o.p1 === "number" && Number.isFinite(o.p1) && typeof o.p2 === "number" && Number.isFinite(o.p2);
}

/**
 * @param {string} tradeId
 * @returns {TradeTrendline[]}
 */
export function loadTradeChartTrendlines(tradeId) {
  if (!tradeId) return [];
  try {
    const raw = localStorage.getItem(PREFIX + tradeId);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return p.filter(isTrendline);
  } catch {
    return [];
  }
}

/**
 * @param {string} tradeId
 * @param {TradeTrendline[]} lines
 */
export function saveTradeChartTrendlines(tradeId, lines) {
  if (!tradeId) return;
  try {
    if (!lines.length) {
      localStorage.removeItem(PREFIX + tradeId);
      return;
    }
    localStorage.setItem(PREFIX + tradeId, JSON.stringify(lines));
  } catch {
    /* ignore */
  }
}
