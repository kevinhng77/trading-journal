import { fillWallTimeToUnixSeconds } from "../api/alpacaBars";
import { loadFillTimeZone } from "./fillTimePrefs";
import { getActiveAccountId } from "./tradingAccounts";

const LEGACY_PREFIX = "tradingJournalTradeChartRiskLines:";
const PREFIX_BASE = "tradingJournalTradeChartRiskLines";

function storageKey(tradeId) {
  return `${PREFIX_BASE}:${getActiveAccountId()}:${tradeId}`;
}

/**
 * @param {unknown} t
 * @returns {boolean}
 */
function isChartTime(t) {
  return typeof t === "number" || (typeof t === "string" && t.length > 0) || (t && typeof t === "object" && "year" in t);
}

/**
 * Full segment: horizontal line from t1 to t2 at `price`.
 * @param {unknown} v
 * @returns {v is { id: string, t1: import("lightweight-charts").Time, t2: import("lightweight-charts").Time, price: number }}
 */
export function isRiskSegmentRow(v) {
  if (!v || typeof v !== "object") return false;
  const o = /** @type {{ id?: unknown, t1?: unknown, t2?: unknown, price?: unknown }} */ (v);
  if (typeof o.id !== "string" || !o.id) return false;
  if (typeof o.price !== "number" || !Number.isFinite(o.price)) return false;
  if (!isChartTime(o.t1) || !isChartTime(o.t2)) return false;
  return true;
}

/**
 * @param {string} tradeId
 * @returns {unknown[]}
 */
export function loadTradeChartRiskLinesRaw(tradeId) {
  if (!tradeId) return [];
  try {
    let raw = localStorage.getItem(storageKey(tradeId));
    if (!raw && getActiveAccountId() === "schwab") {
      raw = localStorage.getItem(LEGACY_PREFIX + tradeId);
      if (raw) localStorage.setItem(storageKey(tradeId), raw);
    }
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

/**
 * @param {object | null | undefined} trade
 * @returns {{ t1: number, t2: number }}
 */
export function defaultRiskSegmentTimesFromTrade(trade) {
  const date = trade?.date ? String(trade.date) : "";
  const fills = Array.isArray(trade?.fills) ? trade.fills : [];
  const tz = loadFillTimeZone();
  let tStart = NaN;
  let tEnd = NaN;
  for (const f of fills) {
    const u = fillWallTimeToUnixSeconds(date, f?.time, tz);
    if (!Number.isFinite(u)) continue;
    if (!Number.isFinite(tStart) || u < tStart) tStart = u;
    if (!Number.isFinite(tEnd) || u > tEnd) tEnd = u;
  }
  if (!Number.isFinite(tStart)) tStart = Math.floor(Date.now() / 1000) - 3600;
  if (!Number.isFinite(tEnd)) tEnd = tStart + 3600;
  if (tEnd <= tStart) tEnd = tStart + 60;
  return { t1: tStart, t2: tEnd };
}

/**
 * Normalize legacy price-only rows to full segments using fill times.
 * @param {unknown[]} lines
 * @param {object | null | undefined} trade
 * @returns {{ id: string, t1: import("lightweight-charts").Time, t2: import("lightweight-charts").Time, price: number }[]}
 */
export function migrateRiskLineRows(lines, trade) {
  if (!Array.isArray(lines)) return [];
  const { t1: fb, t2: fe } = defaultRiskSegmentTimesFromTrade(trade);
  /** @type {{ id: string, t1: import("lightweight-charts").Time, t2: import("lightweight-charts").Time, price: number }[]} */
  const out = [];
  for (const row of lines) {
    if (!row || typeof row !== "object") continue;
    const o = /** @type {{ id: string, t1?: unknown, t2?: unknown, price: number }} */ (row);
    if (typeof o.id !== "string" || !o.id || typeof o.price !== "number" || !Number.isFinite(o.price)) continue;
    if (isChartTime(o.t1) && isChartTime(o.t2)) {
      out.push({ id: o.id, t1: /** @type {import("lightweight-charts").Time} */ (o.t1), t2: /** @type {import("lightweight-charts").Time} */ (o.t2), price: o.price });
    } else {
      out.push({ id: o.id, t1: fb, t2: fe, price: o.price });
    }
  }
  return out;
}

/**
 * @param {string} tradeId
 * @param {{ id: string, t1: import("lightweight-charts").Time, t2: import("lightweight-charts").Time, price: number }[]} lines
 */
export function saveTradeChartRiskLines(tradeId, lines) {
  if (!tradeId) return;
  try {
    const clean = lines.filter(isRiskSegmentRow);
    const key = storageKey(tradeId);
    if (!clean.length) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(clean));
  } catch {
    /* ignore quota / private mode */
  }
}
