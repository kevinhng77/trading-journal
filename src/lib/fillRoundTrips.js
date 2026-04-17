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
 * Completed round trips as time spans (first fill → last fill in that leg), for chart overlays.
 *
 * @param {object[] | undefined} fills
 * @param {(f: object) => number | null | undefined} fillToUnix
 * @returns {{ from: number, to: number, index: number }[]}
 */
export function completedRoundTripUnixSpans(fills, fillToUnix) {
  const sorted = [...(fills || [])].sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? "")));
  let pos = 0;
  /** @type {number[]} */
  let curUnix = [];
  /** @type {{ from: number, to: number, index: number }[]} */
  const out = [];
  let idx = 0;

  for (const f of sorted) {
    const delta = fillSignedQtyDelta(f);
    if (delta === 0) continue;
    const u = fillToUnix(f);
    if (u == null || !Number.isFinite(u)) continue;
    if (pos === 0) curUnix = [];
    curUnix.push(u);
    pos += delta;
    if (pos === 0 && curUnix.length) {
      out.push({ from: curUnix[0], to: curUnix[curUnix.length - 1], index: idx });
      idx += 1;
      curUnix = [];
    }
  }

  return out;
}
