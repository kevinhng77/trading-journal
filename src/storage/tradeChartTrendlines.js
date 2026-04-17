const PREFIX = "tradingJournalTradeChartTrendlines:";

/** @typedef {number | string} ChartTime */

/**
 * Numbered chart note anchor (one click). Legacy rows were two-point "trendlines"; those migrate to
 * `{ id, t: t1, p: p1 }` so the on-chart number stays where the old label was drawn.
 * @typedef {{ id: string, t: ChartTime, p: number }} TradeChartNumberMarker
 */

/**
 * @param {unknown} v
 * @returns {v is TradeChartNumberMarker}
 */
function isNumberMarker(v) {
  if (!v || typeof v !== "object") return false;
  const o = /** @type {{ id?: unknown, t?: unknown, p?: unknown }} */ (v);
  if (typeof o.id !== "string" || o.id.length === 0) return false;
  const tok = typeof o.t === "number" || typeof o.t === "string";
  return tok && typeof o.p === "number" && Number.isFinite(o.p);
}

/**
 * @param {unknown} v
 * @returns {TradeChartNumberMarker | null}
 */
function migrateLegacyTrendline(v) {
  if (!v || typeof v !== "object") return null;
  const o = /** @type {{ id?: unknown, t1?: unknown, p1?: unknown, t2?: unknown, p2?: unknown }} */ (v);
  if (typeof o.id !== "string" || o.id.length === 0) return null;
  const t1 = o.t1;
  const t2 = o.t2;
  const t1ok = typeof t1 === "number" || typeof t1 === "string";
  const t2ok = typeof t2 === "number" || typeof t2 === "string";
  if (!t1ok || !t2ok) return null;
  if (typeof o.p1 !== "number" || !Number.isFinite(o.p1)) return null;
  if (typeof o.p2 !== "number" || !Number.isFinite(o.p2)) return null;
  return { id: o.id, t: t1, p: o.p1 };
}

/**
 * @param {unknown} v
 * @returns {TradeChartNumberMarker | null}
 */
function normalizeMarkerRow(v) {
  if (isNumberMarker(v)) return { id: v.id, t: v.t, p: v.p };
  return migrateLegacyTrendline(v);
}

/**
 * @param {string} tradeId
 * @returns {TradeChartNumberMarker[]}
 */
export function loadTradeChartTrendlines(tradeId) {
  if (!tradeId) return [];
  try {
    const raw = localStorage.getItem(PREFIX + tradeId);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return p.map(normalizeMarkerRow).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * @param {string} tradeId
 * @param {TradeChartNumberMarker[]} markers
 */
export function saveTradeChartTrendlines(tradeId, markers) {
  if (!tradeId) return;
  try {
    if (!markers.length) {
      localStorage.removeItem(PREFIX + tradeId);
      return;
    }
    localStorage.setItem(PREFIX + tradeId, JSON.stringify(markers));
  } catch {
    /* ignore */
  }
}
