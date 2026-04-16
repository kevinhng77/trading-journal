/**
 * Thinkorswim-style EMA colors on a dark chart: white (short) → magenta → orange → cyan → steel (long).
 * Used for rendering; well-known periods map to fixed hues, others use stored prefs or a fallback cycle.
 */

/** @type {Record<number, string>} */
const TOS_EMA_BY_PERIOD = {
  8: "#f5f5f5",
  9: "#f5f5f5",
  10: "#ff5ca8",
  12: "#eeeeee",
  20: "#f44336",
  21: "#f44336",
  34: "#ffb74d",
  50: "#ffa726",
  55: "#ff9800",
  89: "#4dd0e1",
  100: "#26c6da",
  144: "#5c7fa3",
  200: "#2962ff",
};

/** When period is not in {@link TOS_EMA_BY_PERIOD}, cycle these (TOS-like order). */
export const TOS_EMA_FALLBACK_CYCLE = [
  "#f5f5f5",
  "#ff5ca8",
  "#ffb74d",
  "#26c6da",
  "#5c7fa3",
  "#ab47bc",
  "#81c784",
  "#90caf9",
];

/**
 * @param {number} period
 * @param {number} enabledOrdinal index among enabled MA lines (for fallback cycle)
 * @param {string} [storedColor] from user prefs
 * @returns {string} hex color
 */
export function resolveChartEmaColor(period, enabledOrdinal, storedColor) {
  const p = Math.trunc(Number(period));
  if (p > 0 && Object.prototype.hasOwnProperty.call(TOS_EMA_BY_PERIOD, p)) {
    return TOS_EMA_BY_PERIOD[p];
  }
  const s = typeof storedColor === "string" ? storedColor.trim() : "";
  if (/^#[0-9a-fA-F]{6}$/.test(s) || /^#[0-9a-fA-F]{3}$/.test(s)) {
    return s;
  }
  const i = Math.max(0, enabledOrdinal);
  return TOS_EMA_FALLBACK_CYCLE[i % TOS_EMA_FALLBACK_CYCLE.length];
}
