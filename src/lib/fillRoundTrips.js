/**
 * Detect completed share round-trips (flat → … → flat) in chronological fill order.
 * Used by the execution chart overlay; incomplete tails (still open) are not banded.
 */

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
  const sorted = [...(fills || [])].sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? "")));
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
