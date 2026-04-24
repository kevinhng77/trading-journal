import { compareFillsBySessionThenTime } from "./fillRoundTrips.js";
import { getNySessionUnixBounds } from "../api/alpacaBars.js";

/** Drop duplicate `fill.id` rows (same execution on two stored trades). */
function dedupeFillsById(fills) {
  const seen = new Set();
  const out = [];
  for (const f of fills ?? []) {
    const id = String(f?.id ?? "").trim();
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(f);
  }
  return out.sort(compareFillsBySessionThenTime);
}

/**
 * @param {object[]} trades
 * @param {string} symbolUpper
 * @param {string} calendarDay YYYY-MM-DD
 * @returns {object[]}
 */
export function collectFillsForSymbolOnCalendarDay(trades, symbolUpper, calendarDay) {
  const sym = String(symbolUpper ?? "")
    .trim()
    .toUpperCase();
  const day = String(calendarDay ?? "").trim().slice(0, 10);
  if (!sym || day.length !== 10) return [];
  const acc = [];
  for (const t of trades ?? []) {
    if (String(t?.symbol ?? "")
      .trim()
      .toUpperCase() !== sym) {
      continue;
    }
    for (const f of t?.fills ?? []) {
      const fd = String(f?.date ?? t?.date ?? "")
        .trim()
        .slice(0, 10);
      if (fd === day) acc.push(f);
    }
  }
  return dedupeFillsById(acc);
}

/**
 * Fills for `symbol` on any calendar day up to and including `calendarDay` (YYYY-MM-DD),
 * so running P&amp;L through a trade day includes prior-session entries (multiday positions).
 *
 * @param {object[]} trades
 * @param {string} symbolUpper
 * @param {string} calendarDay YYYY-MM-DD
 * @returns {object[]}
 */
export function collectFillsForSymbolOnOrBeforeCalendarDay(trades, symbolUpper, calendarDay) {
  const sym = String(symbolUpper ?? "")
    .trim()
    .toUpperCase();
  const day = String(calendarDay ?? "").trim().slice(0, 10);
  if (!sym || day.length !== 10) return [];
  const acc = [];
  for (const t of trades ?? []) {
    if (String(t?.symbol ?? "")
      .trim()
      .toUpperCase() !== sym) {
      continue;
    }
    for (const f of t?.fills ?? []) {
      const fd = String(f?.date ?? t?.date ?? "")
        .trim()
        .slice(0, 10);
      if (fd.length === 10 && fd <= day) acc.push(f);
    }
  }
  return dedupeFillsById(acc);
}

/**
 * All fills for `symbol` across every stored trade (chronological, de-duped by fill id).
 * @param {object[]} trades
 * @param {string} symbolUpper
 * @returns {object[]}
 */
export function collectFillsForSymbolAllJournal(trades, symbolUpper) {
  const sym = String(symbolUpper ?? "")
    .trim()
    .toUpperCase();
  if (!sym) return [];
  const acc = [];
  for (const t of trades ?? []) {
    if (String(t?.symbol ?? "")
      .trim()
      .toUpperCase() !== sym) {
      continue;
    }
    for (const f of t?.fills ?? []) acc.push(f);
  }
  return dedupeFillsById(acc);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pad running P&amp;L points to the NY **extended** session window so the chart spans the full day.
 * Prepends $0 at session start when the first fill is after open; appends flat tail through session end.
 *
 * @param {{ time: number, value: number }[]} points
 * @param {string} calendarDayIso
 * @returns {{ time: number, value: number }[]}
 */
export function extendRunningPnlWithSessionBookends(points, calendarDayIso) {
  const day = String(calendarDayIso ?? "").trim().slice(0, 10);
  if (!ISO_DAY.test(day) || !points?.length) return points ?? [];
  const b = getNySessionUnixBounds(day);
  const t0 = b.extendedOpen;
  const t1 = b.extendedClose;
  const sorted = [...points].filter((p) => p && Number.isFinite(p.time)).sort((a, c) => a.time - c.time);
  if (!sorted.length) return [];
  const out = [];
  if (sorted[0].time > t0) out.push({ time: t0, value: 0 });
  out.push(...sorted);
  const last = sorted[sorted.length - 1];
  if (last.time < t1) out.push({ time: t1, value: last.value });
  return out;
}

/**
 * Sort by time, merge duplicate timestamps (keep last value).
 * @param {{ time: number, value: number }[]} points
 */
export function dedupeAscendingTimeLastValue(points) {
  const sorted = [...(points ?? [])]
    .filter((p) => p && Number.isFinite(p.time) && Number.isFinite(p.value))
    .sort((a, b) => a.time - b.time);
  /** @type {{ time: number, value: number }[]} */
  const out = [];
  for (const p of sorted) {
    if (out.length && out[out.length - 1].time === p.time) {
      out[out.length - 1] = { time: p.time, value: p.value };
    } else {
      out.push({ time: p.time, value: p.value });
    }
  }
  return out;
}

/**
 * lightweight-charts BaselineSeries needs at least two points to draw a segment reliably.
 * @param {{ time: number, value: number }[]} points
 */
export function padSinglePointForChart(points) {
  const p = dedupeAscendingTimeLastValue(points);
  if (p.length === 0) return [];
  if (p.length >= 2) return p;
  const only = p[0];
  return [only, { time: only.time + 120, value: only.value }];
}

/**
 * @typedef {{ time: number, value: number, kind: "buy"|"sell", id?: string }} RunningPnlFillMarker
 */

/**
 * After each BOT/SOLD fill (chronological), cumulative realized FIFO P&amp;L plus mark-to-market
 * of any open inventory at that fill's price (Tradervue-style running P&amp;L steps).
 *
 * @param {object[]|undefined} fills
 * @param {(f: object) => number | null} getUnixForFill
 * @returns {{ points: { time: number, value: number }[], fillMarkers: RunningPnlFillMarker[] }}
 */
export function runningPnlSeriesFromFills(fills, getUnixForFill) {
  const sorted = [...(fills || [])].sort(compareFillsBySessionThenTime);
  /** @type {{ time: number, value: number }[]} */
  const out = [];
  /** @type {RunningPnlFillMarker[]} */
  const fillMarkers = [];
  /** @type {{ q: number, p: number }[]} */
  const longLots = [];
  /** @type {{ q: number, p: number }[]} */
  const shortLots = [];
  let realized = 0;

  for (const f of sorted) {
    const side = String(f?.side || "").toUpperCase();
    const q = Math.abs(Number(f?.quantity));
    const px = Number(f?.price);
    const u = getUnixForFill(f);
    if (u == null || !Number.isFinite(u)) continue;
    if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(px)) continue;

    if (side !== "BOT" && side !== "BUY" && side !== "SOLD" && side !== "SLD" && side !== "SELL") continue;

    const fee = (Number(f?.commission) || 0) + (Number(f?.miscFees) || 0);
    if (Number.isFinite(fee)) realized -= fee;

    if (side === "BOT" || side === "BUY") {
      let rem = q;
      while (rem > 0 && shortLots.length) {
        const s = shortLots[0];
        const t = Math.min(rem, s.q);
        realized += t * (s.p - px);
        s.q -= t;
        rem -= t;
        if (s.q <= 1e-9) shortLots.shift();
      }
      if (rem > 0) longLots.push({ q: rem, p: px });
    } else {
      let rem = q;
      while (rem > 0 && longLots.length) {
        const L = longLots[0];
        const t = Math.min(rem, L.q);
        realized += t * (px - L.p);
        L.q -= t;
        rem -= t;
        if (L.q <= 1e-9) longLots.shift();
      }
      if (rem > 0) shortLots.push({ q: rem, p: px });
    }

    let unrealized = 0;
    for (const L of longLots) unrealized += L.q * (px - L.p);
    for (const S of shortLots) unrealized += S.q * (S.p - px);

    const value = Math.round((realized + unrealized) * 100) / 100;
    out.push({ time: u, value });
    const kind = side === "BOT" || side === "BUY" ? "buy" : "sell";
    const idRaw = String(f?.id ?? "").trim();
    fillMarkers.push(idRaw ? { time: u, value, kind, id: idRaw } : { time: u, value, kind });
  }
  return { points: out, fillMarkers };
}

/**
 * Same steps as {@link runningPnlSeriesFromFills} but returns only the line points.
 *
 * @param {object[]|undefined} fills
 * @param {(f: object) => number | null} getUnixForFill
 * @returns {{ time: number, value: number }[]}
 */
export function runningPnlAfterEachFill(fills, getUnixForFill) {
  return runningPnlSeriesFromFills(fills, getUnixForFill).points;
}
