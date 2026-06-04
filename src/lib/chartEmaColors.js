/**
 * Thinkorswim MA colors (STI chart legend: 200 cyan, 100 orange, 50 red, 20 blue; short EMA magenta).
 * Well-known periods use fixed hues; others use stored prefs or a fallback cycle.
 */

/** @type {Record<number, string>} */
const TOS_EMA_BY_PERIOD = {
  8: "#ff5ca8",
  9: "#ff5ca8",
  10: "#ff5ca8",
  12: "#ff5ca8",
  20: "#2962ff",
  21: "#2962ff",
  34: "#ff9900",
  50: "#ff0000",
  55: "#ff0000",
  89: "#bc00ff",
  100: "#ffa500",
  144: "#bc00ff",
  200: "#00ffff",
};

/** Flexible-grid / extra studies when period is not in {@link TOS_EMA_BY_PERIOD}. */
export const TOS_EMA_FALLBACK_CYCLE = [
  "#ff5ca8",
  "#ff9900",
  "#00ffff",
  "#bc00ff",
  "#ffa500",
  "#ff0000",
  "#2962ff",
  "#ffff00",
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

/** @param {number} period @returns {string | undefined} */
export function tosEmaColorForPeriod(period) {
  const p = Math.trunc(Number(period));
  if (p > 0 && Object.prototype.hasOwnProperty.call(TOS_EMA_BY_PERIOD, p)) {
    return TOS_EMA_BY_PERIOD[p];
  }
  return undefined;
}
