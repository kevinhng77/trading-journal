/**
 * Detect completed share round-trips (flat → … → flat) in chronological fill order.
 * Used to band rows in the trade detail fills table; incomplete tails (still open) are not banded.
 */

/** @param {object} f */
export function fillStableKey(f) {
  if (f?.id != null && String(f.id) !== "") return String(f.id);
  return `t:${f.time}|${f.side}|${f.quantity}|${f.price}`;
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
 * Maps each fill key → round-trip index (0, 1, …) for fills that belong to a **completed**
 * flat-to-flat leg. Fills after the last flat (open remainder) are omitted from the map.
 *
 * @param {object[] | undefined} fills
 * @returns {Map<string, number>}
 */
export function buildCompletedRoundTripIndexByFillKey(fills) {
  /** @type {Map<string, number>} */
  const out = new Map();
  const sorted = [...(fills || [])].sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? "")));

  let pos = 0;
  /** @type {string[]} */
  let curKeys = [];
  let rt = 0;

  for (const f of sorted) {
    const delta = fillSignedQtyDelta(f);
    if (delta === 0) continue;

    if (pos === 0) curKeys = [];
    curKeys.push(fillStableKey(f));
    pos += delta;

    if (pos === 0 && curKeys.length) {
      for (const k of curKeys) out.set(k, rt);
      rt += 1;
      curKeys = [];
    }
  }

  return out;
}
