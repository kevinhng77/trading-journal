import { roundTripLegSummariesFromFills } from "./fillRoundTrips.js";
import { stableTradeId } from "../storage/tradeLookup.js";

/**
 * Parse HH:mm or HH:mm:ss on an ISO calendar date (local).
 * @param {string} isoDate YYYY-MM-DD
 * @param {string} timeStr
 * @returns {number} epoch ms or NaN
 */
function fillInstantMs(isoDate, timeStr) {
  const raw = String(timeStr ?? "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = m[3] !== undefined ? Number(m[3]) : 0;
  if ([h, min, sec].some((n) => Number.isNaN(n))) return NaN;
  const iso = `${isoDate}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return new Date(iso).getTime();
}

/**
 * @param {object} trade
 * @returns {string | null} `SYMBOL|long|shareSize` for open tail, else null
 */
function getOpenLegPairKey(trade) {
  const legs = roundTripLegSummariesFromFills(trade?.fills);
  const open = legs.find((l) => l.isOpen);
  if (!open?.openingSide) return null;
  const sym = String(trade?.symbol ?? "").trim().toUpperCase();
  if (!sym) return null;
  return `${sym}|${open.openingSide}|${open.shareSize}`;
}

/**
 * Seconds between first and last fill on the trade session date.
 * @param {object} trade
 * @returns {number | null}
 */
export function getTradeDurationSeconds(trade) {
  const fills = trade?.fills;
  const date = String(trade?.date ?? "").trim();
  if (!fills?.length || !date) return null;
  const sorted = [...fills].sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? "")));
  const t0 = fillInstantMs(date, sorted[0]?.time);
  const t1 = fillInstantMs(date, sorted[sorted.length - 1]?.time);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null;
  return Math.max(0, Math.round((t1 - t0) / 1000));
}

/** Fine-grained hold duration (e.g. Reports “session length” chart). */
export const REPORT_DURATION_OPTIONS = [
  { value: "all", label: "All" },
  { value: "lt1m", label: "Under 1 minute" },
  { value: "1to5m", label: "1–5 minutes" },
  { value: "5to30m", label: "5–30 minutes" },
  { value: "30to120m", label: "30 minutes – 2 hours" },
  { value: "gte120m", label: "2 hours+" },
];

/** Reports / Journal: session type only. */
export const REPORTS_DURATION_OPTIONS = [
  { value: "all", label: "All" },
  { value: "intraday", label: "Intraday" },
  { value: "multiday", label: "Multiday" },
];

/**
 * Multiday when:
 * - fills use more than one `fill.date`, or
 * - an open FIFO leg’s fills span multiple session dates, or
 * - another stored row has the same symbol, same open-leg side, same open-leg share size (paired swing / split import).
 *
 * @param {object} trade
 * @param {object[]|undefined} [allTrades] same cohort used for filters (e.g. all rows before duration filter)
 */
export function tradeIsMultiday(trade, allTrades) {
  const fills = trade?.fills;
  if (!Array.isArray(fills) || fills.length === 0) return false;

  const dates = new Set();
  for (const f of fills) {
    if (f.date) dates.add(f.date);
  }
  if (dates.size > 1) return true;

  const legs = roundTripLegSummariesFromFills(fills);
  if (legs.some((l) => l.isOpen && l.isMultidayLeg)) return true;

  const pairKey = getOpenLegPairKey(trade);
  if (!pairKey || !Array.isArray(allTrades) || allTrades.length < 2) return false;
  const id = stableTradeId(trade);
  for (const o of allTrades) {
    if (stableTradeId(o) === id) continue;
    if (getOpenLegPairKey(o) === pairKey) return true;
  }
  return false;
}

/**
 * @param {object} trade
 * @param {string} bucket
 * @param {object[]|undefined} [allTrades] pass for multiday/intraday pairing (see {@link tradeIsMultiday})
 */
export function tradeMatchesDurationBucket(trade, bucket, allTrades) {
  const key = String(bucket ?? "all");
  if (!key || key === "all") return true;
  if (key === "intraday") return !tradeIsMultiday(trade, allTrades);
  if (key === "multiday") return tradeIsMultiday(trade, allTrades);
  const sec = getTradeDurationSeconds(trade);
  if (sec === null) return false;
  switch (key) {
    case "lt1m":
      return sec < 60;
    case "1to5m":
      return sec >= 60 && sec < 300;
    case "5to30m":
      return sec >= 300 && sec < 1800;
    case "30to120m":
      return sec >= 1800 && sec < 7200;
    case "gte120m":
      return sec >= 7200;
    default:
      return true;
  }
}
