/**
 * Detect completed share round-trips (flat → … → flat) in chronological fill order.
 * Used by the execution chart overlay; incomplete tails (still open) are not banded.
 */

import { inferOpeningSide } from "./tradeSide.js";

/** Chronological order using session date then wall time (multiday-safe). */
export function compareFillsBySessionThenTime(a, b) {
  const c = String(a?.date ?? "").localeCompare(String(b?.date ?? ""));
  if (c !== 0) return c;
  return String(a?.time ?? "").localeCompare(String(b?.time ?? ""));
}

function sessionDatesFromFills(fills) {
  const uniq = [...new Set(fills.map((f) => String(f.date ?? "").trim()).filter(Boolean))].sort();
  if (!uniq.length) return { entryDate: null, exitDate: null, isMultidayLeg: false };
  return {
    entryDate: uniq[0],
    exitDate: uniq[uniq.length - 1],
    isMultidayLeg: uniq.length > 1,
  };
}

/** @param {object} f @returns {number} signed share delta (BOT +, SOLD -), 0 if unknown */
export function fillSignedQtyDelta(f) {
  const q = Math.abs(Number(f?.quantity));
  if (!q || Number.isNaN(q)) return 0;
  const side = String(f?.side || "").toUpperCase();
  if (side === "BOT" || side === "BUY") return q;
  if (side === "SOLD" || side === "SLD" || side === "SELL") return -q;
  return 0;
}

/**
 * FIFO realized PnL (USD) for fills that start and end flat, including per-fill commission/misc
 * when present. Handles long and short legs.
 * @param {object[]} fillsChrono fills in chronological order for one closed round trip
 */
export function roundTripFifoRealizedPnlUsd(fillsChrono) {
  /** @type {{ q: number, p: number }[]} */
  const longLots = [];
  /** @type {{ q: number, p: number }[]} */
  const shortLots = [];
  let realized = 0;

  for (const f of fillsChrono) {
    const side = String(f?.side || "").toUpperCase();
    const q = Math.abs(Number(f?.quantity));
    if (!Number.isFinite(q) || q <= 0) continue;
    const px = Number(f?.price);
    if (!Number.isFinite(px)) continue;
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
    } else if (side === "SOLD" || side === "SLD" || side === "SELL") {
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
  }

  return Math.round(realized * 100) / 100;
}

/**
 * Completed round trips as time spans (first fill → last fill in that leg), for chart overlays.
 *
 * @param {object[] | undefined} fills
 * @param {(f: object) => number | null | undefined} fillToUnix
 * @returns {{ from: number, to: number, index: number, pnl: number }[]}
 */
export function completedRoundTripUnixSpans(fills, fillToUnix) {
  const sorted = [...(fills || [])].sort(compareFillsBySessionThenTime);
  let pos = 0;
  /** @type {object[]} */
  let curFills = [];
  /** @type {{ from: number, to: number, index: number, pnl: number }[]} */
  const out = [];
  let idx = 0;

  for (const f of sorted) {
    const delta = fillSignedQtyDelta(f);
    if (delta === 0) continue;
    const u = fillToUnix(f);
    if (u == null || !Number.isFinite(u)) continue;
    if (pos === 0) curFills = [];
    curFills.push(f);
    pos += delta;
    if (pos === 0 && curFills.length) {
      const u0 = fillToUnix(curFills[0]);
      const u1 = fillToUnix(curFills[curFills.length - 1]);
      const pnl = Number.isFinite(u0) && Number.isFinite(u1) ? roundTripFifoRealizedPnlUsd(curFills) : 0;
      out.push({
        from: /** @type {number} */ (u0),
        to: /** @type {number} */ (u1),
        index: idx,
        pnl: Number.isFinite(pnl) ? pnl : 0,
      });
      idx += 1;
      curFills = [];
    }
  }

  return out;
}

/**
 * VWAP of shares added vs reduced within one chronological fill list (one flat→flat leg
 * or an open tail). Handles scale-in/out and same-fill flips (e.g. long → short).
 * @param {object[]} fillsChrono
 * @returns {{ avgEntry: number|null, avgExit: number|null, shareSize: number }}
 */
function roundTripEntryExitMetrics(fillsChrono) {
  let pos = 0;
  let openNotional = 0;
  let openQty = 0;
  let closeNotional = 0;
  let closeQty = 0;
  let maxAbs = 0;

  for (const f of fillsChrono) {
    const p = Number(f.price);
    const q = Math.abs(Number(f.quantity));
    const side = String(f.side || "").toUpperCase();
    const delta =
      side === "BOT" || side === "BUY"
        ? q
        : side === "SOLD" || side === "SLD" || side === "SELL"
          ? -q
          : 0;
    if (!Number.isFinite(p) || delta === 0) continue;

    let rem = delta;

    if (pos !== 0 && rem !== 0 && Math.sign(rem) !== Math.sign(pos)) {
      const closeAmount = Math.min(Math.abs(pos), Math.abs(rem));
      closeNotional += closeAmount * p;
      closeQty += closeAmount;
      pos += Math.sign(rem) * closeAmount;
      rem -= Math.sign(rem) * closeAmount;
    }

    if (rem !== 0) {
      openNotional += Math.abs(rem) * p;
      openQty += Math.abs(rem);
      pos += rem;
    }

    maxAbs = Math.max(maxAbs, Math.abs(pos));
  }

  return {
    avgEntry: openQty > 0 ? openNotional / openQty : null,
    avgExit: closeQty > 0 ? closeNotional / closeQty : null,
    shareSize: maxAbs,
  };
}

/**
 * One row per completed round trip (flat → flat), plus a final row if the position
 * is still open. Used on the trade detail snapshot.
 *
 * @param {object[] | undefined} fills
 * @returns {{ legIndex: number, isOpen: boolean, openingSide: "long"|"short"|null, avgEntry: number|null, avgExit: number|null, shareSize: number, pnl: number|null, entryDate: string|null, exitDate: string|null, isMultidayLeg: boolean }[]}
 */
export function roundTripLegSummariesFromFills(fills) {
  const sorted = [...(fills || [])].sort(compareFillsBySessionThenTime);
  let pos = 0;
  /** @type {object[]} */
  let cur = [];
  /** @type {object[]} */
  const out = [];
  let legIndex = 0;

  for (const f of sorted) {
    const delta = fillSignedQtyDelta(f);
    if (delta === 0) continue;
    if (pos === 0) cur = [];
    cur.push(f);
    pos += delta;
    if (pos === 0 && cur.length) {
      const m = roundTripEntryExitMetrics(cur);
      const pnl = roundTripFifoRealizedPnlUsd(cur);
      const { entryDate, exitDate, isMultidayLeg } = sessionDatesFromFills(cur);
      out.push({
        legIndex: legIndex++,
        isOpen: false,
        openingSide: inferOpeningSide({ fills: cur }),
        avgEntry: m.avgEntry != null ? Math.round(m.avgEntry * 1e6) / 1e6 : null,
        avgExit: m.avgExit != null ? Math.round(m.avgExit * 1e6) / 1e6 : null,
        shareSize: Math.round(m.shareSize),
        pnl: Number.isFinite(pnl) ? pnl : null,
        entryDate,
        exitDate,
        isMultidayLeg,
      });
      cur = [];
    }
  }

  if (cur.length > 0) {
    const m = roundTripEntryExitMetrics(cur);
    const { entryDate, exitDate, isMultidayLeg } = sessionDatesFromFills(cur);
    out.push({
      legIndex: legIndex++,
      isOpen: true,
      openingSide: inferOpeningSide({ fills: cur }),
      avgEntry: m.avgEntry != null ? Math.round(m.avgEntry * 1e6) / 1e6 : null,
      avgExit: m.avgExit != null ? Math.round(m.avgExit * 1e6) / 1e6 : null,
      shareSize: Math.round(m.shareSize),
      pnl: null,
      entryDate,
      exitDate,
      isMultidayLeg,
    });
  }

  return out;
}
