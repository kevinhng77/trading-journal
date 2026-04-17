const STORAGE_KEY = "tradingJournalChartIndicators";

/** Max EMA lines per chart (performance / UI). */
export const MAX_EMA_LINES = 24;

import { TOS_EMA_FALLBACK_CYCLE } from "../lib/chartEmaColors";

/** @typedef {'triangle' | 'circle' | 'square' | 'diamond'} MarkerShape */
/** @typedef {'color' | 'size' | 'both'} MarkerSizingMode */
/** @typedef {{ buy: string, sell: string, size: number, shape: MarkerShape, sizingMode: MarkerSizingMode }} MarkerPrefs */
/** @typedef {{ enabled: boolean, winColor: string, lossColor: string, flatColor: string, alpha: number }} RoundTripShadingPrefs */
/** Line style: 0 solid, 1 dotted, 2 dashed (lightweight-charts subset). */
/** @typedef {{ id: string, kind?: 'ema'|'sma', enabled: boolean, period: number, color: string, width: number, lineStyle?: 0|1|2 }} MaLinePrefs */
/** @typedef {{ enabled: boolean, color: string, width: number, lineStyle?: 0|1|2 }} VwapPrefs */
/** @typedef {{ version: number, markers: MarkerPrefs, roundTripShading: RoundTripShadingPrefs, emaLines: MaLinePrefs[], vwap: VwapPrefs }} ChartIndicatorPrefs */

export const DEFAULT_VWAP = /** @type {VwapPrefs} */ ({
  enabled: false,
  color: "#ffeb3b",
  width: 1,
  lineStyle: 0,
});

export const DEFAULT_ROUND_TRIP_SHADING = /** @type {RoundTripShadingPrefs} */ ({
  enabled: true,
  winColor: "#4abe78",
  lossColor: "#e66c6c",
  flatColor: "#82a5d2",
  alpha: 0.1,
});

export const DEFAULT_CHART_INDICATOR_PREFS = /** @type {ChartIndicatorPrefs} */ ({
  version: 7,
  markers: {
    /* Buys: vivid emerald that still reads on white TOS-up candles; sells: soft rose (not same as candle down red) */
    buy: "#2ecd75",
    sell: "#f87171",
    size: 12,
    shape: "triangle",
    sizingMode: "color",
  },
  roundTripShading: { ...DEFAULT_ROUND_TRIP_SHADING },
  emaLines: [
    { id: "ema10", kind: "ema", enabled: true, period: 10, color: "#ff5ca8", width: 1, lineStyle: 0 },
    { id: "ema20", kind: "ema", enabled: true, period: 20, color: "#f44336", width: 1, lineStyle: 0 },
    { id: "ema50", kind: "ema", enabled: true, period: 50, color: "#ffa726", width: 1, lineStyle: 0 },
    { id: "ema100", kind: "ema", enabled: true, period: 100, color: "#26c6da", width: 1, lineStyle: 0 },
    { id: "ema200", kind: "ema", enabled: true, period: 200, color: "#2962ff", width: 1, lineStyle: 0 },
  ],
  vwap: { ...DEFAULT_VWAP },
});

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function lineKind(raw) {
  const k = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw).kind : undefined;
  if (k === "sma") return "sma";
  return "ema";
}

/** @param {unknown} v @param {0|1|2} fallback */
function sanitizeLineStyle(v, fallback) {
  const n = Number(v);
  if (n === 1 || n === 2) return /** @type {0|1|2} */ (n);
  return fallback;
}

function sanitizeMaLine(raw, fallback) {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const r = /** @type {Record<string, unknown>} */ (raw);
  return {
    id: typeof r.id === "string" ? r.id : fallback.id,
    kind: lineKind(r),
    enabled: Boolean(r.enabled),
    period: clamp(Number(r.period) || fallback.period, 1, 500),
    color: typeof r.color === "string" ? r.color : fallback.color,
    width: clamp(Number(r.width) || fallback.width, 1, 4),
    lineStyle: sanitizeLineStyle(r.lineStyle, fallback.lineStyle ?? 0),
  };
}

function sanitizeVwap(raw) {
  const base = { ...DEFAULT_VWAP };
  if (!raw || typeof raw !== "object") return base;
  const v = /** @type {Record<string, unknown>} */ (raw);
  if (typeof v.enabled === "boolean") base.enabled = v.enabled;
  if (typeof v.color === "string") base.color = v.color;
  if (typeof v.width === "number") base.width = clamp(v.width, 1, 4);
  base.lineStyle = sanitizeLineStyle(v.lineStyle, base.lineStyle ?? 0);
  return base;
}

/** @param {unknown} v */
function sanitizeMarkerShape(v) {
  const s = String(v ?? "").toLowerCase();
  if (s === "circle" || s === "square" || s === "diamond") return /** @type {MarkerShape} */ (s);
  return /** @type {MarkerShape} */ ("triangle");
}

/** @param {unknown} v */
function sanitizeMarkerSizingMode(v) {
  const s = String(v ?? "").toLowerCase();
  if (s === "size" || s === "both") return /** @type {MarkerSizingMode} */ (s);
  return /** @type {MarkerSizingMode} */ ("color");
}

/**
 * @param {unknown} raw
 * @param {RoundTripShadingPrefs} fallback
 */
function sanitizeRoundTripShading(raw, fallback) {
  const base = { ...fallback };
  if (!raw || typeof raw !== "object") return base;
  const r = /** @type {Record<string, unknown>} */ (raw);
  if (typeof r.enabled === "boolean") base.enabled = r.enabled;
  if (typeof r.winColor === "string") base.winColor = r.winColor;
  if (typeof r.lossColor === "string") base.lossColor = r.lossColor;
  if (typeof r.flatColor === "string") base.flatColor = r.flatColor;
  if (typeof r.alpha === "number" && Number.isFinite(r.alpha)) base.alpha = clamp(r.alpha, 0.04, 0.22);
  return base;
}

/**
 * @param {string} hex
 * @param {number} alpha 0..1
 */
export function chartHexToRgba(hex, alpha) {
  let h = String(hex ?? "").trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = parseInt(h, 16);
  if (!Number.isFinite(n) || h.length !== 6) return `rgba(148, 163, 184, ${clamp(alpha, 0, 1)})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

/** @param {unknown} data */
export function normalizeChartIndicatorPrefs(data) {
  const base = structuredClone(DEFAULT_CHART_INDICATOR_PREFS);
  if (!data || typeof data !== "object") return base;

  const o = /** @type {Record<string, unknown>} */ (data);
  if (o.markers && typeof o.markers === "object") {
    const m = /** @type {Record<string, unknown>} */ (o.markers);
    if (typeof m.buy === "string") base.markers.buy = m.buy;
    if (typeof m.sell === "string") base.markers.sell = m.sell;
    if (typeof m.size === "number") base.markers.size = clamp(m.size, 5, 28);
    base.markers.shape = sanitizeMarkerShape(m.shape);
    base.markers.sizingMode = sanitizeMarkerSizingMode(m.sizingMode);
  }

  base.roundTripShading = sanitizeRoundTripShading(o.roundTripShading, base.roundTripShading);

  if (o.vwap && typeof o.vwap === "object") {
    base.vwap = sanitizeVwap(o.vwap);
  }

  if (!("emaLines" in o) || o.emaLines === undefined) {
    return base;
  }
  if (!Array.isArray(o.emaLines)) {
    return base;
  }
  if (o.emaLines.length === 0) {
    base.emaLines = [];
    return base;
  }

  const capped = o.emaLines.slice(0, MAX_EMA_LINES);
  const usedIds = new Set();
  base.emaLines = capped.map((raw, i) => {
    const r = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
    let id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : "";
    if (!id || usedIds.has(id)) {
      id = `ema-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`;
    }
    usedIds.add(id);
    const fallback = {
      id,
      kind: /** @type {'ema'} */ ("ema"),
      enabled: true,
      period: 20,
      color: "#94a3b8",
      width: 1,
      lineStyle: /** @type {0} */ (0),
    };
    return sanitizeMaLine({ ...r, id }, fallback);
  });

  const prevVersion = typeof o.version === "number" ? o.version : 0;
  if (prevVersion < 6 && base.emaLines.length > 0) {
    const periods = new Set(base.emaLines.map((l) => l.period));
    for (const seed of DEFAULT_CHART_INDICATOR_PREFS.emaLines) {
      if (!periods.has(seed.period)) {
        base.emaLines.push(structuredClone(seed));
      }
    }
    base.emaLines.sort((a, b) => a.period - b.period);
  }

  base.version = 7;
  return base;
}

/**
 * @param {MaLinePrefs[]} existingLines
 * @param {'ema'|'sma'} [kind]
 */
export function createEmaLineDraft(existingLines, kind = "ema") {
  const periods = new Set(
    existingLines.filter((e) => (e.kind ?? "ema") === kind).map((e) => e.period),
  );
  const candidates = [9, 21, 34, 55, 89, 100, 200];
  let period = 9;
  for (const c of candidates) {
    if (!periods.has(c)) {
      period = c;
      break;
    }
  }
  if (periods.has(period)) {
    let p = 5;
    while (periods.has(p) && p < 500) p += 1;
    period = p;
  }
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? `ma-${crypto.randomUUID()}`
      : `ma-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const color = TOS_EMA_FALLBACK_CYCLE[existingLines.length % TOS_EMA_FALLBACK_CYCLE.length];
  return { id, kind, enabled: true, period, color, width: 1, lineStyle: 0 };
}

/**
 * Enable an existing MA line or append one (same kind + period).
 * @param {ChartIndicatorPrefs} prefs
 * @param {'ema'|'sma'} kind
 * @param {number} period
 */
export function addOrEnableMaLine(prefs, kind, period) {
  const lines = prefs.emaLines.map((x) => ({ ...x, kind: x.kind ?? "ema" }));
  const idx = lines.findIndex((l) => (l.kind ?? "ema") === kind && l.period === period);
  if (idx >= 0) {
    const next = [...lines];
    next[idx] = { ...next[idx], enabled: true };
    return { ...prefs, emaLines: next };
  }
  if (lines.length >= MAX_EMA_LINES) return prefs;
  const draft = createEmaLineDraft(lines, kind);
  draft.period = period;
  return { ...prefs, emaLines: [...lines, draft] };
}

/**
 * @param {ChartIndicatorPrefs} prefs
 * @param {boolean} [enabled]
 */
export function setVwapEnabled(prefs, enabled = true) {
  return { ...prefs, vwap: { ...prefs.vwap, enabled } };
}

export function loadChartIndicatorPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_CHART_INDICATOR_PREFS);
    return normalizeChartIndicatorPrefs(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_CHART_INDICATOR_PREFS);
  }
}

/** @param {ChartIndicatorPrefs} prefs */
export function saveChartIndicatorPrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function resetChartIndicatorPrefs() {
  return structuredClone(DEFAULT_CHART_INDICATOR_PREFS);
}
