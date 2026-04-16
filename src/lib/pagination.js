/**
 * Compact page button list with ellipses (1 … 4 5 6 … 20).
 * @param {number} totalPages
 * @param {number} current 1-based
 * @returns {(number | "ellipsis")[]}
 */
export function visiblePageNumbers(totalPages, current) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const set = new Set([1, totalPages, current, current - 1, current + 1]);
  const sorted = [...set].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  /** @type {(number | "ellipsis")[]} */
  const out = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("ellipsis");
    out.push(p);
    prev = p;
  }
  return out;
}
