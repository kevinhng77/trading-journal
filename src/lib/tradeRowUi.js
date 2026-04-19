import {
  compareFillsBySessionThenTime,
  fillSignedQtyDelta,
  roundTripLegSummariesFromFills,
} from "./fillRoundTrips.js";

/** Net share position from fills (BOT/BUY +, SOLD/SELL −), session date then time. */
export function tradeNetSharePosition(trade) {
  const sorted = [...(trade?.fills ?? [])].sort(compareFillsBySessionThenTime);
  let pos = 0;
  for (const f of sorted) pos += fillSignedQtyDelta(f);
  return pos;
}

/**
 * True when fills leave a **non-flat** tail with a computed **avg entry** (open leg from
 * {@link roundTripLegSummariesFromFills}).
 * @param {object | null | undefined} trade
 */
export function tradeShowsOpenPositionRect(trade) {
  if (Math.abs(tradeNetSharePosition(trade)) < 1e-6) return false;
  const legs = roundTripLegSummariesFromFills(trade?.fills);
  const last = legs[legs.length - 1];
  if (!last?.isOpen) return false;
  return last.avgEntry != null && Number.isFinite(last.avgEntry);
}
