/** @typedef {'tos' | 'das'} ChartSkinId */

/**
 * Thinkorswim-style dark chart: charcoal pane, teal up / magenta down candles, subtle grid.
 */
export const CHART_SKIN_TOS = {
  bg: "#0b0e11",
  text: "#b8bcc8",
  grid: "rgba(36, 38, 44, 0.72)",
  border: "rgba(42, 46, 54, 0.88)",
  candleUp: "#00bfa5",
  candleDown: "#ff3b69",
  candleBorderUp: "#00bfa5",
  candleBorderDown: "#ff3b69",
  wickUp: "#00bfa5",
  wickDown: "#ff3b69",
  crosshair: "rgba(200, 206, 216, 0.32)",
  volumeUp: "rgba(0, 191, 165, 0.68)",
  volumeDown: "rgba(255, 59, 105, 0.68)",
};

/** DAS-style: black pane, green grid/axis, classic green/red candles, blue volume. */
export const CHART_SKIN_DAS = {
  bg: "#000000",
  text: "#00c853",
  grid: "rgba(0, 160, 80, 0.35)",
  border: "rgba(0, 120, 60, 0.55)",
  candleUp: "#00e676",
  candleDown: "#ff1744",
  candleBorderUp: "#69f0ae",
  candleBorderDown: "#ff5252",
  wickUp: "#b9f6ca",
  wickDown: "#ff8a80",
  crosshair: "rgba(255, 255, 255, 0.22)",
  volumeUp: "rgba(66, 165, 245, 0.72)",
  volumeDown: "rgba(30, 136, 229, 0.55)",
};

/** @param {unknown} v @returns {v is ChartSkinId} */
export function isChartSkinId(v) {
  return v === "tos" || v === "das";
}

/** @param {ChartSkinId} id */
export function chartSkinColors(id) {
  return id === "das" ? CHART_SKIN_DAS : CHART_SKIN_TOS;
}
