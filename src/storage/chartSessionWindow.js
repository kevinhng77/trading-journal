const STORAGE_KEY = "tj-chart-session-window";

/** @typedef {"full" | "extended" | "regular"} ChartSessionWindow */

/** Default: extended US equity hours (premarket + regular + after-hours). */
export const DEFAULT_CHART_SESSION_WINDOW = /** @type {const} */ ("extended");

/**
 * @returns {ChartSessionWindow}
 */
export function loadChartSessionWindow() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "full" || v === "extended" || v === "regular") return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_CHART_SESSION_WINDOW;
}

/** @param {ChartSessionWindow} mode */
export function saveChartSessionWindow(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
