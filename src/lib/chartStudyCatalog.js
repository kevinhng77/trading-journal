/** @typedef {'trend' | 'volume' | 'oscillators'} StudyCategoryId */

/**
 * @typedef {object} CatalogStudy
 * @property {string} id
 * @property {string} name
 * @property {StudyCategoryId} category
 * @property {string} [description]
 * @property {'ready' | 'soon'} status
 * @property {'ema' | 'sma' | 'vwap'} [study]
 * @property {number} [period]
 */

/** @type {{ id: StudyCategoryId; label: string }[]} */
export const INDICATOR_CATEGORIES = [
  { id: "trend", label: "Trend" },
  { id: "volume", label: "Volume" },
  { id: "oscillators", label: "Oscillators" },
];

/** Built-in studies (more can be wired over time). */
export const CATALOG_STUDIES = /** @type {CatalogStudy[]} */ ([
  { id: "ema-9", name: "EMA 9", category: "trend", status: "ready", study: "ema", period: 9, description: "Exponential moving average" },
  { id: "ema-20", name: "EMA 20", category: "trend", status: "ready", study: "ema", period: 20 },
  { id: "ema-21", name: "EMA 21", category: "trend", status: "ready", study: "ema", period: 21 },
  { id: "ema-50", name: "EMA 50", category: "trend", status: "ready", study: "ema", period: 50 },
  { id: "ema-200", name: "EMA 200", category: "trend", status: "ready", study: "ema", period: 200 },
  { id: "sma-20", name: "SMA 20", category: "trend", status: "ready", study: "sma", period: 20 },
  { id: "sma-50", name: "SMA 50", category: "trend", status: "ready", study: "sma", period: 50 },
  { id: "sma-200", name: "SMA 200", category: "trend", status: "ready", study: "sma", period: 200 },
  { id: "vwap", name: "VWAP", category: "volume", status: "ready", study: "vwap", description: "Volume-weighted average price (session)" },
  { id: "rsi", name: "RSI", category: "oscillators", status: "soon", description: "Separate pane — coming later" },
  { id: "macd", name: "MACD", category: "oscillators", status: "soon" },
  { id: "bb", name: "Bollinger Bands", category: "oscillators", status: "soon" },
  { id: "stoch", name: "Stochastic", category: "oscillators", status: "soon" },
  { id: "atr", name: "ATR", category: "oscillators", status: "soon" },
]);
