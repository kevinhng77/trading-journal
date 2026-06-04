/**
 * Thinkorswim-style MA colors on a dark chart (STI / flexible-grid layouts):
 * short blue → red → gold → cyan on long; purple for mid; orange for fast alt periods.
 * Used for rendering; well-known periods map to fixed hues, others use stored prefs or a fallback cycle.
 */

/** @type {Record<number, string>} */
const TOS_EMA_BY_PERIOD = {
  8: "#ff4d4d",
  9: "#ff4d4d",
  10: "#4169e1",
  12: "#ff4d4d",
  20: "#3366ff",
  21: "#3366ff",
  34: "#ff9900",
  50: "#ffd700",
  55: "#ffd700",
  89: "#00ffff",
  100: "#ffcc00",
  144: "#bc00ff",
  200: "#00ffff",
};

/** When period is not in {@link TOS_EMA_BY_PERIOD}, cycle these (TOS flexible-grid order). */
export const TOS_EMA_FALLBACK_CYCLE = [
  "#ff9900",
  "#00ffff",
  "#bc00ff",
  "#4169e1",
  "#ffcc00",
  "#ff4d4d",
  "#ffd700",
  "#3366ff",
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
