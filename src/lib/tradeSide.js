/**
 * Opening direction from execution order: first fill that moves position away from flat.
 * @param {unknown} trade
 * @returns {"long" | "short" | null}
 */
export function inferOpeningSide(trade) {
  const fills = trade?.fills;
  if (!fills?.length) return null;
  const sorted = [...fills].sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? "")));
  let pos = 0;
  for (const f of sorted) {
    const q = Number(f.quantity);
    if (!q || Number.isNaN(q)) continue;
    const side = String(f.side || "").toUpperCase();
    const delta = side === "BOT" ? q : side === "SOLD" ? -q : 0;
    if (delta === 0) continue;
    if (pos === 0) {
      return delta > 0 ? "long" : "short";
    }
    pos += delta;
  }
  return null;
}
