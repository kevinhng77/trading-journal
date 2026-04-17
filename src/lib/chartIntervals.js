/** Preset row on the execution chart (Alpaca timeframes). */
export const CHART_INTERVAL_PRESETS = [
  { id: "1", label: "1m" },
  { id: "2", label: "2m" },
  { id: "5", label: "5m" },
  { id: "15", label: "15m" },
  { id: "60", label: "1h" },
  { id: "D", label: "1d" },
  { id: "W", label: "1w" },
  { id: "MAX", label: "Max" },
];

/** @deprecated No “+” menu; kept empty for older imports. */
export const CHART_INTERVAL_EXTRAS = [];

const ALPACA_TIMEFRAME = /** @type {Record<string, string>} */ ({
  "1": "1Min",
  "2": "2Min",
  "3": "3Min",
  "5": "5Min",
  "15": "15Min",
  "30": "30Min",
  "60": "1Hour",
  "120": "2Hour",
  "240": "4Hour",
  D: "1Day",
  W: "1Week",
  MAX: "1Min",
});

/** @param {string} interval */
export function chartIntervalToAlpacaTimeframe(interval) {
  const k = String(interval ?? "");
  return ALPACA_TIMEFRAME[k] || "1Min";
}

/** Daily or weekly — no session VWAP / volume histogram treatment like intraday. */
export function isDailyLikeInterval(interval) {
  const i = String(interval ?? "");
  return i === "D" || i === "W";
}

/** Bar length in seconds for intraday fill → bar snap (unused when daily-like). */
export function barPeriodSecondsForInterval(interval) {
  const i = String(interval);
  switch (i) {
    case "MAX":
      return 60;
    case "2":
      return 120;
    case "3":
      return 180;
    case "5":
      return 300;
    case "15":
      return 900;
    case "30":
      return 1800;
    case "60":
      return 3600;
    case "120":
      return 7200;
    case "240":
      return 14400;
    case "D":
      return 86400;
    case "W":
      return 604800;
    default:
      return 60;
  }
}

/**
 * Key into lookback / max-bar tables in `chartHistoryQuery`.
 * @param {string} interval
 */
export function intervalHistoryKey(interval) {
  const i = String(interval);
  if (i === "D") return "D";
  if (i === "W") return "W";
  if (i === "MAX") return "MAX";
  const n = Number(i);
  if (n === 60) return 60;
  if (n === 15) return 15;
  if (n === 5) return 5;
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 30) return 30;
  if (n === 120) return 120;
  if (n === 240) return 240;
  return 1;
}

const VALID_PRESET_IDS = new Set(CHART_INTERVAL_PRESETS.map((p) => p.id));

/** @param {string} interval */
export function sanitizeChartInterval(interval) {
  const s = String(interval ?? "");
  return VALID_PRESET_IDS.has(s) ? s : "1";
}

/** Toolbar / symbol strip label. */
export function formatChartIntervalLabel(interval) {
  const i = String(interval);
  const row = [...CHART_INTERVAL_PRESETS, ...CHART_INTERVAL_EXTRAS].find((b) => b.id === i);
  if (row) return row.label;
  return "1m";
}
