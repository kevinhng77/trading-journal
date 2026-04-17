/** Warm the async chunk for {@link TradeExecutionChart} before opening a trade (idle / hover). */
export function prefetchTradeExecutionChart() {
  return import("../components/TradeExecutionChart.jsx");
}
