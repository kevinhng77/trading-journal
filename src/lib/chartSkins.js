/** @typedef {'tos' | 'das'} ChartSkinId */

/** Thinkorswim-style dark chart (default). */
export const CHART_SKIN_TOS = {
  bg: "#131722",
  text: "#d1d4dc",
  grid: "rgba(42, 46, 57, 0.72)",
  border: "rgba(54, 60, 78, 0.88)",
  candleUp: "#ffffff",
  candleDown: "#e31937",
  candleBorderUp: "#9aa5b1",
  candleBorderDown: "#b71c1c",
  wickUp: "#cfd8e3",
  wickDown: "#ff5252",
  crosshair: "rgba(255, 255, 255, 0.2)",
  volumeUp: "rgba(8, 153, 129, 0.72)",
  volumeDown: "rgba(242, 54, 69, 0.72)",
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
