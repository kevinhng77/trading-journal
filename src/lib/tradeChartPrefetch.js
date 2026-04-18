/** @type {Promise<unknown> | null} */
let chartChunkPromise = null;

/** Warm the async chunk for {@link TradeExecutionChart} before opening a trade (idle / hover). */
export function prefetchTradeExecutionChart() {
  chartChunkPromise ??= import("../components/TradeExecutionChart.jsx");
  return chartChunkPromise;
}
