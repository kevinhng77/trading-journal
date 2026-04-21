import { compareFillsBySessionThenTime } from "./fillRoundTrips.js";

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
  return acc.sort(compareFillsBySessionThenTime);
}

/**
 * After each BOT/SOLD fill (chronological), cumulative realized FIFO P&amp;L plus mark-to-market
 * of any open inventory at that fill's price (Tradervue-style running P&amp;L steps).
 *
 * @param {object[]|undefined} fills
 * @param {(f: object) => number | null} getUnixForFill
 * @returns {{ time: number, value: number }[]}
 */
export function runningPnlAfterEachFill(fills, getUnixForFill) {
  const sorted = [...(fills || [])].sort(compareFillsBySessionThenTime);
  /** @type {{ time: number, value: number }[]} */
  const out = [];
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

    out.push({ time: u, value: Math.round((realized + unrealized) * 100) / 100 });
  }
  return out;
}
