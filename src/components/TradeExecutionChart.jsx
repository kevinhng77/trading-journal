import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  TickMarkType,
} from "lightweight-charts";
import { createExecutionMarkersSeriesPrimitive } from "../chart/softTriangleMarkersPrimitive";
import {
  alpacaBarToLightweight,
  alpacaBarToVolumeHistogram,
  chartHistoryQuery,
  chartIntervalToAlpacaTimeframe,
  fetchBarsWithFeedFallback,
  fillWallTimeToUnixSeconds,
  getNySessionUnixBounds,
  isDailyInterval,
  snapUnixToNearestBarTime,
  tradeExecutionDefaultIntradayWindowNy,
} from "../api/alpacaBars";
import { emaLineDataFromBars, smaLineDataFromBars } from "../lib/ema";
import { vwapLineDataFromAlpacaBars } from "../lib/vwapFromBars";
import { DEFAULT_CHART_INDICATOR_PREFS, chartHexToRgba } from "../storage/chartIndicatorPrefs";
import { chartSkinColors } from "../lib/chartSkins";
import { resolveChartEmaColor } from "../lib/chartEmaColors";
import {
  CHART_INTERVAL_PRESETS,
  barPeriodSecondsForInterval,
  sanitizeChartInterval,
} from "../lib/chartIntervals";
import ChartIndicatorLegend from "./ChartIndicatorLegend";
import { completedRoundTripUnixSpans } from "../lib/fillRoundTrips";

/** @param {number | undefined} ls */
function prefsLineStyleToLw(ls) {
  if (ls === 1) return LineStyle.Dotted;
  if (ls === 2) return LineStyle.Dashed;
  return LineStyle.Solid;
}

/**
 * LW multiplies LineSeries `lineWidth` by the pane pixel ratio, so prefs `1` often draws ~2px on retina.
 * Scale so on-screen stroke tracks prefs 1–4 more closely (thinner default look).
 * @param {number} prefsWidth
 * @param {number} pixelRatio
 */
function lineWidthForLwLineSeries(prefsWidth, pixelRatio) {
  const w = Math.min(4, Math.max(1, Math.round(Number(prefsWidth) || 1)));
  const pr = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const scaled = w / pr;
  return Math.min(4, Math.max(0.5, scaled));
}

/** US session calendar for business-day objects from lightweight-charts. */
const CHART_BUSINESS_DAY_TZ = "America/New_York";

const FILL_ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {import("lightweight-charts").Time} t
 * @param {boolean} daily
 * @param {string} displayTz IANA (Fill times control)
 */
function formatCrosshairTimeLabel(t, daily, displayTz) {
  if (t == null) return "";
  const tz = displayTz || CHART_BUSINESS_DAY_TZ;
  if (typeof t === "number") {
    return formatInTimeZone(new Date(t * 1000), tz, daily ? "yyyy-MM-dd" : "HH:mm");
  }
  if (typeof t === "string") {
    return daily ? t : formatInTimeZone(parseISO(`${t}T12:00:00`), tz, "MMM d");
  }
  if (t && typeof t === "object" && "year" in t) {
    const y = /** @type {{ year: number; month: number; day: number }} */ (t);
    const inst = fromZonedTime(
      `${y.year}-${String(y.month).padStart(2, "0")}-${String(y.day).padStart(2, "0")}T12:00:00`,
      CHART_BUSINESS_DAY_TZ,
    );
    return formatInTimeZone(inst, tz, daily ? "yyyy-MM-dd" : "MMM d");
  }
  return "";
}

/**
 * Axis tick labels: match Fill times TZ; day/month ticks use session calendar then convert.
 * @param {string} displayTz
 * @param {boolean} daily
 * @returns {import("lightweight-charts").TickMarkFormatter}
 */
function createChartTickMarkFormatter(displayTz, daily) {
  const tz = displayTz || CHART_BUSINESS_DAY_TZ;
  return (time, tickMarkType) => {
    if (daily) return null;
    if (typeof time === "number") {
      const d = new Date(time * 1000);
      switch (tickMarkType) {
        case TickMarkType.Year:
          return formatInTimeZone(d, tz, "yyyy");
        case TickMarkType.Month:
          return formatInTimeZone(d, tz, "MMM");
        case TickMarkType.DayOfMonth:
          return formatInTimeZone(d, tz, "MMM d");
        case TickMarkType.Time:
        case TickMarkType.TimeWithSeconds:
          return formatInTimeZone(d, tz, "HH:mm");
        default:
          return null;
      }
    }
    if (time && typeof time === "object" && "year" in time) {
      const y = /** @type {{ year: number; month: number; day: number }} */ (time);
      const inst = fromZonedTime(
        `${y.year}-${String(y.month).padStart(2, "0")}-${String(y.day).padStart(2, "0")}T12:00:00`,
        CHART_BUSINESS_DAY_TZ,
      );
      switch (tickMarkType) {
        case TickMarkType.Year:
          return formatInTimeZone(inst, tz, "yyyy");
        case TickMarkType.Month:
          return formatInTimeZone(inst, tz, "MMM");
        case TickMarkType.DayOfMonth:
          return formatInTimeZone(inst, tz, "MMM d");
        default:
          return null;
      }
    }
    return null;
  };
}

/**
 * Snap fill unix time to the bar open for this timeframe when that bar exists (same idea as
 * floorToMinuteUtcSeconds in the reference Alpaca chart); otherwise fall back to nearest bar.
 * @param {number[]} barTimesAsc
 * @param {Set<number>} barTimeSet
 * @param {number} targetUnix
 * @param {number} periodSec
 */
function snapToBarPeriodOpen(barTimesAsc, barTimeSet, targetUnix, periodSec) {
  const floored = Math.floor(targetUnix / periodSec) * periodSec;
  if (barTimeSet.has(floored)) return floored;
  return snapUnixToNearestBarTime(barTimesAsc, targetUnix);
}

/**
 * Keep marker Y on the visible candle when fill and OHLC disagree slightly (feeds / rounding).
 * @param {number} fillPrice
 * @param {{ low: number, high: number } | undefined} bar
 */
function clampPriceToBarRange(fillPrice, bar) {
  if (!bar || !Number.isFinite(bar.low) || !Number.isFinite(bar.high)) return fillPrice;
  return Math.min(bar.high, Math.max(bar.low, fillPrice));
}

/**
 * 0..1 strength for color only (log spread). `null` → neutral tint (no qty / no span).
 * @param {number | undefined} qty
 * @param {number} qMin
 * @param {number} qMax
 * @returns {number | null}
 */
function executionQuantityStrengthOrNull(qty, qMin, qMax) {
  if (!Number.isFinite(qMin) || !Number.isFinite(qMax) || qMax <= 0) return null;
  const q = Math.abs(Number(qty));
  if (!Number.isFinite(q) || q <= 0) return null;
  if (!(qMax > qMin)) return 0.5;
  const lo = Math.log10(qMin + 1);
  const hi = Math.log10(qMax + 1);
  const t = (Math.log10(q + 1) - lo) / (hi - lo);
  return Math.min(1, Math.max(0, t));
}

/**
 * @param {number | undefined} qty
 * @param {number} qMin
 * @param {number} qMax
 * @param {number} markerBaseSize
 */
function executionQuantityToMarkerPixelSize(qty, qMin, qMax, markerBaseSize) {
  let b = Number(markerBaseSize);
  if (!Number.isFinite(b) || b < 4) b = 12;
  b = Math.min(28, Math.max(5, b));
  const minS = Math.max(5, b * 0.72);
  const maxS = Math.min(30, b * 1.38);
  const u = executionQuantityStrengthOrNull(qty, qMin, qMax);
  if (u === null) return b;
  return minS + u * (maxS - minS);
}

/** @param {string} hex */
function hexToRgb(hex) {
  let h = String(hex ?? "").trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = parseInt(h, 16);
  if (!Number.isFinite(n) || h.length !== 6) return { r: 80, g: 200, b: 120 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function clampByte(n) {
  return Math.min(255, Math.max(0, Math.round(n)));
}

/** @param {{ r: number, g: number, b: number }} c */
function rgbToHex(c) {
  return `#${clampByte(c.r).toString(16).padStart(2, "0")}${clampByte(c.g).toString(16).padStart(2, "0")}${clampByte(c.b).toString(16).padStart(2, "0")}`;
}

/** @param {{ r: number, g: number, b: number }} a @param {{ r: number, g: number, b: number }} b @param {number} t */
function blendRgb(a, b, t) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

/** Dark pane-ish anchor so small fills read softer. */
const MARKER_SIZE_BLEND_BG = { r: 20, g: 22, b: 30 };

/** Slight lift toward white so large fills read brighter on dark charts. */
const MARKER_SIZE_HIGHLIGHT = { r: 255, g: 255, b: 255 };

/**
 * Brighter / more vivid fill for larger qty; small stays washed (triangle size from prefs only).
 * @param {string} baseHex marker pref color
 * @param {number | undefined} qty
 * @param {number} qMin
 * @param {number} qMax
 */
function executionQuantityToMarkerFill(baseHex, qty, qMin, qMax) {
  const base = hexToRgb(baseHex);
  const u = executionQuantityStrengthOrNull(qty, qMin, qMax);
  const uBlend = u === null ? 0.5 : u;
  const washed = blendRgb(base, MARKER_SIZE_BLEND_BG, 0.64);
  const vivid = blendRgb(base, MARKER_SIZE_HIGHLIGHT, 0.22);
  return rgbToHex(blendRgb(washed, vivid, uBlend));
}

/**
 * @param {{ buy: string, sell: string, size: number, sizingMode?: string }} markerPrefs
 * @param {{ simpleSolid?: boolean }} [markerOptions] DAS-style: solid triangle colors, fixed size
 */
function collectExecutionMarkers(
  fills,
  tradeDate,
  fillTimeZone,
  barTimesAsc,
  daily,
  dailyMarkerTime,
  chartInterval,
  lwBarsByTime,
  markerPrefs,
  markerOptions,
) {
  if (!fills?.length) return [];
  const simpleSolid = markerOptions?.simpleSolid === true;

  const periodSec = barPeriodSecondsForInterval(chartInterval);
  const barTimeSet = new Set(barTimesAsc);

  /** @type {Array<{ time: import('lightweight-charts').Time, price: number, isBuy: boolean, quantity?: number }>} */
  const out = [];
  for (const f of fills) {
    const side = String(f.side || "").toUpperCase();
    const isBuy = side === "BOT";
    const isSell = side === "SOLD";
    if (!isBuy && !isSell) continue;

    const price = Number(f.price);
    if (Number.isNaN(price)) continue;

    let time;
    if (daily) {
      time = dailyMarkerTime ?? tradeDate;
    } else {
      const u = fillWallTimeToUnixSeconds(tradeDate, f.time, fillTimeZone);
      time = snapToBarPeriodOpen(barTimesAsc, barTimeSet, u, periodSec);
    }

    const bar = !daily && typeof time === "number" ? lwBarsByTime.get(time) : undefined;
    const displayPrice = clampPriceToBarRange(price, bar);

    const qAbs = Math.abs(Number(f.quantity));
    /** @type {{ time: import('lightweight-charts').Time, price: number, isBuy: boolean, quantity?: number }} */
    const row = { time, price: displayPrice, isBuy };
    if (Number.isFinite(qAbs) && qAbs > 0) row.quantity = qAbs;
    out.push(row);
  }

  out.sort((a, b) => {
    if (a.time === b.time) return 0;
    if (typeof a.time === "string") return String(a.time).localeCompare(String(b.time));
    return a.time - b.time;
  });

  const qtyList = out.map((m) => m.quantity).filter((q) => typeof q === "number" && q > 0 && Number.isFinite(q));
  const qMin = qtyList.length ? Math.min(...qtyList) : NaN;
  const qMax = qtyList.length ? Math.max(...qtyList) : NaN;

  const { buy: buyHex, sell: sellHex, size: markerBaseSize, sizingMode = "color" } = markerPrefs;

  return out.map((m) => {
    const { quantity, ...rest } = m;
    const baseHex = m.isBuy ? buyHex : sellHex;
    const useColor = sizingMode === "color" || sizingMode === "both";
    const useSize = sizingMode === "size" || sizingMode === "both";
    /** @type {{ time: import('lightweight-charts').Time, price: number, isBuy: boolean, fill?: string, size?: number }} */
    const row = { ...rest };
    if (simpleSolid) {
      row.fill = baseHex;
      row.size = markerBaseSize;
    } else {
      if (useColor) {
        row.fill = executionQuantityToMarkerFill(baseHex, quantity, qMin, qMax);
      } else {
        row.fill = baseHex;
      }
      if (useSize) {
        row.size = executionQuantityToMarkerPixelSize(quantity, qMin, qMax, markerBaseSize);
      }
    }
    return row;
  });
}

/** Sort and drop duplicate times (string or number) — required for lightweight-charts. */
function dedupeBarsByTime(lwBars) {
  const seen = new Set();
  const out = [];
  for (const b of lwBars) {
    const k = b.time;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(b);
  }
  return out.sort((a, b) => {
    if (typeof a.time === "string") return String(a.time).localeCompare(String(b.time));
    return a.time - b.time;
  });
}

/**
 * One pass: dedupe by bar time, keep candles + volume aligned (intraday).
 * @param {{ up: string, down: string }} [volumeColors]
 */
function barsToCandlesAndVolume(bars, daily, volumeColors) {
  if (daily) {
    const raw = bars.map((b) => alpacaBarToLightweight(b, true));
    return { lwBars: dedupeBarsByTime(raw), volBars: [] };
  }
  const merged = new Map();
  for (const b of bars) {
    const lw = alpacaBarToLightweight(b, false);
    const key = lw.time;
    if (!merged.has(key)) {
      merged.set(key, {
        lw,
        vol: alpacaBarToVolumeHistogram(b, false, volumeColors),
      });
    }
  }
  const arr = [...merged.values()].sort((a, b) => a.lw.time - b.lw.time);
  return {
    lwBars: arr.map((x) => x.lw),
    volBars: arr.map((x) => x.vol),
  };
}

export default function TradeExecutionChart({
  symbol,
  tradeDate,
  fills,
  chartInterval,
  /** @param {string} id */
  onChartIntervalChange,
  fillTimeZone,
  indicatorPrefs = DEFAULT_CHART_INDICATOR_PREFS,
  onPatchEma,
  onPatchVwap,
  onPatchMarkers,
  onPatchRoundTripShading,
  onRemoveEmaLine,
  /** @type {{ id: string, t1: import("lightweight-charts").Time, t2: import("lightweight-charts").Time, price: number }[]} */
  riskLines = [],
  /** @param {{ t1: import("lightweight-charts").Time, t2: import("lightweight-charts").Time, price: number }} seg */
  onAddRiskLine,
  riskLineMarkMode = false,
  /** Numbered note anchors: one chart click each — `{ id, t, p }` (time + price). */
  trendlines = [],
  /** @param {(prev: { id: string, t: number | string, p: number }[]) => { id: string, t: number | string, p: number }[]} updater */
  onTrendlinesChange,
  /** When true, chart clicks add the next numbered marker (linked to notes in the trade panel). */
  trendlineDrawMode = false,
  /** Shown on the right side of the bottom interval bar (e.g. screenshot / playbook actions). */
  chartIntervalBarEnd = null,
  /** When set, chart context menu includes an entry that opens the indicators catalog (trade detail). */
  onOpenIndicatorsCatalog = null,
  /** When set, context menu + caller toolbar can hide all MAs, VWAP, executions, and round-trip shading at once. */
  onClearAllIndicators = null,
  /** @type {'tos'|'das'} */
  chartSkinId = "tos",
}) {
  const containerRef = useRef(null);
  const trendlineSvgRef = useRef(/** @type {SVGSVGElement | null} */ (null));
  /** @type {import("react").MutableRefObject<{ chart: any; series: any } | null>} */
  const trendlineChartSeriesRef = useRef(null);
  const roundTripShadeRef = useRef(null);
  const sessionShadeRef = useRef(null);
  const crosshairTimeRef = useRef(null);
  const crosshairHLineRef = useRef(null);
  const crosshairPriceRef = useRef(null);
  const resetChartViewRef = useRef(() => {});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bars, setBars] = useState([]);
  const [legendRows, setLegendRows] = useState([]);
  const [emaLegendOpen, setEmaLegendOpen] = useState(false);
  const [chartContextMenu, setChartContextMenu] = useState(/** @type {{ x: number, y: number } | null} */ (null));

  const riskLinesRef = useRef(riskLines);
  riskLinesRef.current = riskLines;
  const riskLineMarkModeRef = useRef(riskLineMarkMode);
  riskLineMarkModeRef.current = riskLineMarkMode;
  const onAddRiskLineRef = useRef(onAddRiskLine);
  onAddRiskLineRef.current = onAddRiskLine;

  const riskSegmentDraftRef = useRef(/** @type {{ t1: import("lightweight-charts").Time, price: number } | null} */ (null));
  const riskSegmentPreviewRef = useRef(/** @type {{ t2: import("lightweight-charts").Time } | null} */ (null));

  const trendlinesRef = useRef(trendlines);
  trendlinesRef.current = trendlines;
  const trendlineDrawModeRef = useRef(trendlineDrawMode);
  trendlineDrawModeRef.current = trendlineDrawMode;
  const onTrendlinesChangeRef = useRef(onTrendlinesChange);
  /** Crosshair position while placing numbered notes (preview only). */
  const previewPointRef = useRef(/** @type {{ t: number | string, p: number } | null} */ (null));
  /** @type {import("react").MutableRefObject<{ paintTrendlines: () => void } | null>} */
  const chartTrendRef = useRef(null);

  useEffect(() => {
    onTrendlinesChangeRef.current = onTrendlinesChange;
  }, [onTrendlinesChange]);

  useEffect(() => {
    if (!trendlineDrawMode) {
      previewPointRef.current = null;
      requestAnimationFrame(() => chartTrendRef.current?.paintTrendlines?.());
    }
  }, [trendlineDrawMode]);

  useEffect(() => {
    if (!riskLineMarkMode) {
      riskSegmentDraftRef.current = null;
      riskSegmentPreviewRef.current = null;
      requestAnimationFrame(() => chartTrendRef.current?.paintTrendlines?.());
    }
  }, [riskLineMarkMode]);

  useEffect(() => {
    requestAnimationFrame(() => chartTrendRef.current?.paintTrendlines?.());
  }, [trendlines]);

  useEffect(() => {
    if (typeof onChartIntervalChange !== "function") return;
    const fixed = sanitizeChartInterval(chartInterval);
    if (fixed !== String(chartInterval)) onChartIntervalChange(fixed);
  }, [chartInterval, onChartIntervalChange]);

  useEffect(() => {
    if (!chartContextMenu) return;
    function onPointerDown(e) {
      const el = /** @type {HTMLElement | null} */ (e.target);
      if (el?.closest?.(".trade-chart-context-menu")) return;
      setChartContextMenu(null);
    }
    function onKey(e) {
      if (e.key === "Escape") setChartContextMenu(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [chartContextMenu]);

  /** Earliest / latest fill session date so multi-session trades request and frame enough history. */
  const chartFillSpan = useMemo(() => {
    const list = Array.isArray(fills) ? fills : [];
    let minD = "";
    let maxD = "";
    for (const f of list) {
      const d = String(f?.date ?? "").trim().slice(0, 10);
      if (!FILL_ISO_DAY.test(d)) continue;
      if (!minD || d < minD) minD = d;
      if (!maxD || d > maxD) maxD = d;
    }
    if (!minD || !maxD) return null;
    return { start: minD, end: maxD };
  }, [fills]);

  useEffect(() => {
    let cancelled = false;
    const timeframe = chartIntervalToAlpacaTimeframe(chartInterval);
    const spanOpts = chartFillSpan ? { fillSpanStart: chartFillSpan.start, fillSpanEnd: chartFillSpan.end } : {};
    const { start, end, maxTotalBars } = chartHistoryQuery(tradeDate, chartInterval, spanOpts);

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { bars: raw } = await fetchBarsWithFeedFallback({
          symbol,
          timeframe,
          start,
          end,
          maxTotalBars,
          tradeIsoDate: tradeDate,
          chartInterval,
        });
        if (!cancelled) {
          setBars(raw);
        }
      } catch (e) {
        if (!cancelled) {
          setBars([]);
          setError(e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [symbol, tradeDate, chartInterval, chartFillSpan]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || loading || error || !bars.length) return;

    const daily = isDailyInterval(chartInterval);
    const skin = chartSkinColors(chartSkinId);
    const { lwBars, volBars } = barsToCandlesAndVolume(bars, daily, {
      up: skin.volumeUp,
      down: skin.volumeDown,
    });

    if (!lwBars.length) return;

    const barTimesAsc = daily
      ? []
      : lwBars.map((b) => b.time).filter((t) => typeof t === "number");

    const dailyHighlightDay = chartFillSpan?.end ?? tradeDate;
    const dailyMarkerTime = daily
      ? lwBars.find((b) => b.time === dailyHighlightDay)?.time ??
          lwBars.find((b) => b.time === tradeDate)?.time ??
          lwBars[lwBars.length - 1]?.time ??
          tradeDate
      : undefined;

    /** @type {Map<number, { low: number, high: number }>} */
    const lwBarsByTime = new Map();
    if (!daily) {
      for (const b of lwBars) {
        if (typeof b.time === "number" && Number.isFinite(b.low) && Number.isFinite(b.high)) {
          lwBarsByTime.set(b.time, { low: b.low, high: b.high });
        }
      }
    }

    const sessionLayer = sessionShadeRef.current;
    const displayTz = fillTimeZone || CHART_BUSINESS_DAY_TZ;
    const linePxRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: skin.bg },
        textColor: skin.text,
        attributionLogo: false,
      },
      localization: {
        timeFormatter: (t) => formatCrosshairTimeLabel(t, daily, displayTz) || "—",
      },
      grid: {
        vertLines: { color: skin.grid },
        horzLines: { color: skin.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        // Built-in time-axis label can disagree with cursor X when hovering the volume strip (separate price scale).
        // LargeDashed + width 1 matches LW internals (6px dash, 6px gap); custom horz line uses the same pattern.
        vertLine: {
          labelVisible: false,
          color: skin.crosshair,
          width: 1,
          style: LineStyle.LargeDashed,
        },
        /* Library horz is drawn under our HTML session/round-trip overlays; draw our own in subscribeCrosshairMove. */
        horzLine: { visible: false, labelVisible: false, color: skin.crosshair },
      },
      rightPriceScale: { borderColor: skin.border },
      timeScale: {
        borderColor: skin.border,
        timeVisible: !daily,
        secondsVisible: false,
        rightOffset: 8,
        tickMarkFormatter: createChartTickMarkFormatter(displayTz, daily),
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      width: el.clientWidth,
      height: el.clientHeight,
    });

    if (!daily && volBars.length) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volumeSeries.setData(volBars);
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.78, bottom: 0 },
      });
    }

    chart.priceScale("right").applyOptions(
      daily
        ? { scaleMargins: { top: 0.05, bottom: 0.05 } }
        : { scaleMargins: { top: 0.05, bottom: 0.28 } },
    );

    const series = chart.addSeries(CandlestickSeries, {
      upColor: skin.candleUp,
      downColor: skin.candleDown,
      borderUpColor: skin.candleBorderUp,
      borderDownColor: skin.candleBorderDown,
      borderVisible: true,
      wickUpColor: skin.wickUp,
      wickDownColor: skin.wickDown,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      priceScaleId: "right",
    });
    series.setData(lwBars);
    trendlineChartSeriesRef.current = { chart, series };

    /** @param {number} span */
    function nicePriceStepForSpan(span) {
      if (!Number.isFinite(span) || span <= 0) return 0.01;
      const target = span / 50;
      const pow10 = Math.pow(10, Math.floor(Math.log10(Math.max(target, 1e-12))));
      const m = target / pow10;
      const f = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
      return f * pow10;
    }

    /** @param {number} price */
    function snapPriceToHorizontalGrid(price) {
      try {
        const c0 = series.priceToCoordinate(price);
        if (c0 == null || !Number.isFinite(c0)) return price;
        const rawUp = series.coordinateToPrice(c0 - 36);
        const rawDn = series.coordinateToPrice(c0 + 36);
        const pUp = typeof rawUp === "number" ? rawUp : NaN;
        const pDn = typeof rawDn === "number" ? rawDn : NaN;
        if (!Number.isFinite(pUp) || !Number.isFinite(pDn)) return price;
        const span = Math.abs(pUp - pDn);
        const step = nicePriceStepForSpan(span);
        if (!(step > 0)) return price;
        return Math.round(price / step) * step;
      } catch {
        return price;
      }
    }

    /** @param {number} y */
    function priceFromSeriesY(y) {
      const raw = series.coordinateToPrice(y);
      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      if (
        raw &&
        typeof raw === "object" &&
        "close" in raw &&
        typeof /** @type {{ close?: unknown }} */ (raw).close === "number"
      ) {
        return /** @type {{ close: number }} */ (raw).close;
      }
      return NaN;
    }

    /** @param {import("lightweight-charts").MouseEventParams} param */
    function timeFromChartClick(param) {
      if (param.time != null && param.time !== undefined) return param.time;
      if (!param.point || typeof param.point.x !== "number") return null;
      return chart.timeScale().coordinateToTime(param.point.x);
    }

    function paintTrendlines() {
      const svg = trendlineSvgRef.current;
      const cs = trendlineChartSeriesRef.current;
      if (!svg || !cs?.chart || !cs?.series) return;
      const { chart: ch, series: se } = cs;
      const host = svg.parentElement;
      const w = host?.clientWidth ?? svg.clientWidth;
      const h = host?.clientHeight ?? svg.clientHeight;
      if (w < 2 || h < 2) return;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const ns = "http://www.w3.org/2000/svg";

      const markers = trendlinesRef.current ?? [];
      for (let i = 0; i < markers.length; i += 1) {
        const M = markers[i];
        const row = /** @type {{ id: string, t?: unknown, p?: unknown, t1?: unknown, p1?: unknown }} */ (M);
        const t = row.t != null ? row.t : row.t1;
        const rawP = typeof row.p === "number" && Number.isFinite(row.p) ? row.p : row.p1;
        const p = typeof rawP === "number" && Number.isFinite(rawP) ? rawP : NaN;
        if (t == null || !Number.isFinite(p)) continue;
        const cx = ch.timeScale().timeToCoordinate(t);
        const cy = se.priceToCoordinate(p);
        if (cx == null || cy == null) continue;
        const disc = document.createElementNS(ns, "circle");
        disc.setAttribute("cx", String(cx));
        disc.setAttribute("cy", String(cy));
        disc.setAttribute("r", "7");
        disc.setAttribute("fill", "rgba(51, 65, 85, 0.88)");
        disc.setAttribute("stroke", "rgba(148, 163, 184, 0.45)");
        disc.setAttribute("stroke-width", "1");
        disc.setAttribute("pointer-events", "none");
        svg.appendChild(disc);
        const tx = document.createElementNS(ns, "text");
        tx.setAttribute("x", String(cx));
        tx.setAttribute("y", String(cy));
        tx.setAttribute("fill", "rgba(226, 232, 240, 0.92)");
        tx.setAttribute("font-size", "10");
        tx.setAttribute("font-weight", "600");
        tx.setAttribute("font-family", "system-ui, sans-serif");
        tx.setAttribute("text-anchor", "middle");
        tx.setAttribute("dominant-baseline", "central");
        tx.textContent = String(i + 1);
        tx.setAttribute("pointer-events", "none");
        svg.appendChild(tx);
      }

      const preview = previewPointRef.current;
      if (trendlineDrawModeRef.current && preview) {
        const cx = ch.timeScale().timeToCoordinate(preview.t);
        const cy = se.priceToCoordinate(preview.p);
        if (cx != null && cy != null) {
          const ghostN = markers.length + 1;
          const c = document.createElementNS(ns, "circle");
          c.setAttribute("cx", String(cx));
          c.setAttribute("cy", String(cy));
          c.setAttribute("r", "7");
          c.setAttribute("fill", "rgba(51, 65, 85, 0.35)");
          c.setAttribute("stroke", "rgba(148, 163, 184, 0.4)");
          c.setAttribute("stroke-width", "1");
          c.setAttribute("stroke-dasharray", "3 2");
          c.setAttribute("pointer-events", "none");
          svg.appendChild(c);
          const gtx = document.createElementNS(ns, "text");
          gtx.setAttribute("x", String(cx));
          gtx.setAttribute("y", String(cy));
          gtx.setAttribute("fill", "rgba(226, 232, 240, 0.65)");
          gtx.setAttribute("font-size", "10");
          gtx.setAttribute("font-weight", "600");
          gtx.setAttribute("font-family", "system-ui, sans-serif");
          gtx.setAttribute("text-anchor", "middle");
          gtx.setAttribute("dominant-baseline", "central");
          gtx.textContent = String(ghostN);
          gtx.setAttribute("pointer-events", "none");
          svg.appendChild(gtx);
        }
      }

      const riskStroke = "#38bdf8";
      const risks = riskLinesRef.current ?? [];
      for (let ri = 0; ri < risks.length; ri += 1) {
        const R = risks[ri];
        if (!R || R.t1 == null || R.t2 == null || !Number.isFinite(R.price)) continue;
        const x1 = ch.timeScale().timeToCoordinate(R.t1);
        const x2 = ch.timeScale().timeToCoordinate(R.t2);
        const y = se.priceToCoordinate(R.price);
        if (x1 == null || x2 == null || y == null) continue;
        const xa = Math.min(x1, x2);
        const xb = Math.max(x1, x2);
        const ln = document.createElementNS(ns, "line");
        ln.setAttribute("x1", String(xa));
        ln.setAttribute("x2", String(xb));
        ln.setAttribute("y1", String(y));
        ln.setAttribute("y2", String(y));
        ln.setAttribute("stroke", riskStroke);
        ln.setAttribute("stroke-width", "2");
        ln.setAttribute("pointer-events", "none");
        svg.appendChild(ln);
      }

      const rDraft = riskSegmentDraftRef.current;
      const rPrev = riskSegmentPreviewRef.current;
      if (rDraft && rPrev && Number.isFinite(rDraft.price)) {
        const x1 = ch.timeScale().timeToCoordinate(rDraft.t1);
        const x2 = ch.timeScale().timeToCoordinate(rPrev.t2);
        const y = se.priceToCoordinate(rDraft.price);
        if (x1 != null && x2 != null && y != null) {
          const pl = document.createElementNS(ns, "line");
          pl.setAttribute("x1", String(x1));
          pl.setAttribute("x2", String(x2));
          pl.setAttribute("y1", String(y));
          pl.setAttribute("y2", String(y));
          pl.setAttribute("stroke", "rgba(56, 189, 248, 0.65)");
          pl.setAttribute("stroke-width", "2");
          pl.setAttribute("stroke-dasharray", "5 4");
          pl.setAttribute("pointer-events", "none");
          svg.appendChild(pl);
        }
      } else if (rDraft && Number.isFinite(rDraft.price)) {
        const cx = ch.timeScale().timeToCoordinate(rDraft.t1);
        const cy = se.priceToCoordinate(rDraft.price);
        if (cx != null && cy != null) {
          const c = document.createElementNS(ns, "circle");
          c.setAttribute("cx", String(cx));
          c.setAttribute("cy", String(cy));
          c.setAttribute("r", "5");
          c.setAttribute("fill", "rgba(56, 189, 248, 0.35)");
          c.setAttribute("stroke", riskStroke);
          c.setAttribute("stroke-width", "2");
          c.setAttribute("pointer-events", "none");
          svg.appendChild(c);
        }
      }
    }

    chartTrendRef.current = { paintTrendlines };

    function sortChartTimes(tA, tB) {
      const c1 = chart.timeScale().timeToCoordinate(tA);
      const c2 = chart.timeScale().timeToCoordinate(tB);
      if (c1 == null || c2 == null) return [tA, tB];
      return c1 <= c2 ? [tA, tB] : [tB, tA];
    }

    let riskDocListeners = false;
    function detachRiskDrag() {
      if (!riskDocListeners) return;
      document.removeEventListener("pointermove", onRiskPointerMove);
      document.removeEventListener("pointerup", onRiskPointerUp);
      document.removeEventListener("pointercancel", onRiskPointerUp);
      riskDocListeners = false;
    }
    function onRiskPointerMove(e) {
      if (!riskSegmentDraftRef.current) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = chart.timeScale().coordinateToTime(x);
      if (t == null) return;
      riskSegmentPreviewRef.current = { t2: t };
      paintTrendlines();
    }
    function onRiskPointerUp(e) {
      detachRiskDrag();
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const draft = riskSegmentDraftRef.current;
      const prev = riskSegmentPreviewRef.current;
      riskSegmentDraftRef.current = null;
      riskSegmentPreviewRef.current = null;
      if (!draft || !prev || typeof onAddRiskLineRef.current !== "function") {
        paintTrendlines();
        return;
      }
      const [t1, t2] = sortChartTimes(draft.t1, prev.t2);
      const xc1 = chart.timeScale().timeToCoordinate(t1);
      const xc2 = chart.timeScale().timeToCoordinate(t2);
      if (xc1 != null && xc2 != null && Math.abs(xc2 - xc1) < 2) {
        paintTrendlines();
        return;
      }
      onAddRiskLineRef.current({ t1, t2, price: draft.price });
      paintTrendlines();
    }
    function onRiskPointerDown(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!riskLineMarkModeRef.current || trendlineDrawModeRef.current) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > el.clientWidth || y > el.clientHeight) return;
      const t = chart.timeScale().coordinateToTime(x);
      const py = priceFromSeriesY(y);
      if (t == null || !Number.isFinite(py)) return;
      const price = snapPriceToHorizontalGrid(py);
      riskSegmentDraftRef.current = { t1: t, price };
      riskSegmentPreviewRef.current = { t2: t };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      document.addEventListener("pointermove", onRiskPointerMove);
      document.addEventListener("pointerup", onRiskPointerUp);
      document.addEventListener("pointercancel", onRiskPointerUp);
      riskDocListeners = true;
      paintTrendlines();
      e.preventDefault();
      e.stopPropagation();
    }
    el.addEventListener("pointerdown", onRiskPointerDown);

    /** @param {import("lightweight-charts").MouseEventParams} param */
    function onChartClick(param) {
      if (typeof param.paneIndex === "number" && param.paneIndex !== 0) return;

      if (trendlineDrawModeRef.current && typeof onTrendlinesChangeRef.current === "function") {
        const t = timeFromChartClick(param);
        if (t == null || !param.point || typeof param.point.y !== "number") return;
        const p = priceFromSeriesY(param.point.y);
        if (!Number.isFinite(p)) return;
        const id =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `note-${Date.now()}`;
        onTrendlinesChangeRef.current((prev) => [...(prev ?? []), { id, t, p }]);
        paintTrendlines();
        return;
      }
    }
    chart.subscribeClick(onChartClick);

    /** @type {Map<string, { time: import('lightweight-charts').Time, value: number }[]>} */
    const lineDataById = new Map();
    /** @type {{ ma: (typeof indicatorPrefs.emaLines)[0], line: import('lightweight-charts').ISeriesApi<'Line'>, displayColor: string }[]} */
    const overlayBindings = [];
    let emaOrdinal = 0;

    for (const ma of indicatorPrefs.emaLines) {
      if (!ma.enabled) continue;
      const k = ma.kind ?? "ema";
      const lineData = k === "sma" ? smaLineDataFromBars(lwBars, ma.period) : emaLineDataFromBars(lwBars, ma.period);
      if (!lineData.length) continue;
      lineDataById.set(ma.id, lineData);
      const displayColor = resolveChartEmaColor(ma.period, emaOrdinal, ma.color);
      emaOrdinal += 1;
      const line = chart.addSeries(LineSeries, {
        color: displayColor,
        lineWidth: lineWidthForLwLineSeries(ma.width, linePxRatio),
        lineStyle: prefsLineStyleToLw(ma.lineStyle),
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        priceScaleId: "right",
      });
      line.setData(lineData);
      overlayBindings.push({ ma, line, displayColor });
    }

    /** @type {import('lightweight-charts').ISeriesApi<'Line'> | null} */
    let vwapSeries = null;
    if (!daily && indicatorPrefs.vwap?.enabled) {
      const vwapData = vwapLineDataFromAlpacaBars(bars);
      if (vwapData.length) {
        lineDataById.set("__vwap__", vwapData);
        vwapSeries = chart.addSeries(LineSeries, {
          color: indicatorPrefs.vwap.color,
          lineWidth: lineWidthForLwLineSeries(indicatorPrefs.vwap.width, linePxRatio),
          lineStyle: prefsLineStyleToLw(indicatorPrefs.vwap.lineStyle),
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          priceScaleId: "right",
        });
        vwapSeries.setData(vwapData);
      }
    }

    function updateLegend(param) {
      const useLast =
        !param ||
        param.point === undefined ||
        param.time === undefined ||
        param.time === null;
      /** @type {{ id: string, label: string, period: number | null, color: string, value: number | null, study: 'ma'|'vwap', enabled?: boolean }[]} */
      const rows = [];
      for (let i = 0; i < indicatorPrefs.emaLines.length; i++) {
        const ma = indicatorPrefs.emaLines[i];
        const binding = overlayBindings.find((b) => b.ma.id === ma.id);
        const displayColor = resolveChartEmaColor(ma.period, i, ma.color);
        let value = null;
        if (binding) {
          const line = binding.line;
          if (useLast) {
            const d = lineDataById.get(ma.id);
            const last = d?.length ? d[d.length - 1] : null;
            value = last?.value ?? null;
          } else {
            const pt = param.seriesData?.get(line);
            value =
              pt && typeof pt === "object" && "value" in pt && typeof pt.value === "number"
                ? pt.value
                : null;
          }
        }
        const kind = ma.kind ?? "ema";
        rows.push({
          id: ma.id,
          label: `${kind.toUpperCase()} ${ma.period}`,
          period: ma.period,
          color: displayColor,
          value,
          study: "ma",
          enabled: ma.enabled,
        });
      }
      if (!daily) {
        let value = null;
        if (vwapSeries) {
          if (useLast) {
            const d = lineDataById.get("__vwap__");
            const last = d?.length ? d[d.length - 1] : null;
            value = last?.value ?? null;
          } else {
            const pt = param.seriesData?.get(vwapSeries);
            value =
              pt && typeof pt === "object" && "value" in pt && typeof pt.value === "number"
                ? pt.value
                : null;
          }
        }
        rows.push({
          id: "__vwap__",
          label: "VWAP",
          period: null,
          color: indicatorPrefs.vwap.color,
          value,
          study: "vwap",
          enabled: indicatorPrefs.vwap.enabled,
        });
      }
      setLegendRows(rows);
    }

    function updateCrosshairTimeLabel(param) {
      const el = crosshairTimeRef.current;
      if (!el) return;
      if (!param?.point || typeof param.point.x !== "number") {
        el.style.display = "none";
        return;
      }
      const t = chart.timeScale().coordinateToTime(param.point.x);
      if (t == null) {
        el.style.display = "none";
        return;
      }
      const text = formatCrosshairTimeLabel(t, daily, displayTz);
      if (!text) {
        el.style.display = "none";
        return;
      }
      el.textContent = text;
      el.style.display = "block";
      el.style.left = `${param.point.x}px`;
    }

    function updateCrosshairHorizontalGuide(param) {
      const hLine = crosshairHLineRef.current;
      const pEl = crosshairPriceRef.current;
      if (!hLine || !pEl) return;
      if (!param?.point || typeof param.point.y !== "number") {
        hLine.style.display = "none";
        pEl.style.display = "none";
        return;
      }
      const y = param.point.y;
      hLine.style.display = "block";
      hLine.style.top = `${y}px`;
      const raw = series.coordinateToPrice(y);
      if (raw != null && Number.isFinite(Number(raw))) {
        pEl.textContent = series.priceFormatter().format(Number(raw));
        pEl.style.display = "block";
        pEl.style.top = `${y}px`;
      } else {
        pEl.style.display = "none";
      }
    }

    function onCrosshairMove(param) {
      updateLegend(param);
      updateCrosshairTimeLabel(param);
      updateCrosshairHorizontalGuide(param);
      if (trendlineDrawModeRef.current && param?.point && typeof param.point.x === "number" && typeof param.point.y === "number") {
        const t2 = chart.timeScale().coordinateToTime(param.point.x);
        const p2 = priceFromSeriesY(param.point.y);
        if (t2 != null && Number.isFinite(p2)) {
          previewPointRef.current = { t: t2, p: p2 };
          paintTrendlines();
        }
      } else {
        previewPointRef.current = null;
        if (trendlineDrawModeRef.current) paintTrendlines();
      }
    }

    chart.subscribeCrosshairMove(onCrosshairMove);
    onCrosshairMove();

    const execMarkers = collectExecutionMarkers(
      fills ?? [],
      tradeDate,
      fillTimeZone,
      barTimesAsc,
      daily,
      dailyMarkerTime,
      chartInterval,
      lwBarsByTime,
      indicatorPrefs.markers,
      { simpleSolid: chartSkinId === "das" },
    );
    /** @type {import('lightweight-charts').ISeriesPrimitive<import('lightweight-charts').Time> | null} */
    let markersPrimitive = null;
    if (execMarkers.length && indicatorPrefs.markers.enabled !== false) {
      markersPrimitive = createExecutionMarkersSeriesPrimitive(series, execMarkers, {
        buy: indicatorPrefs.markers.buy,
        sell: indicatorPrefs.markers.sell,
        size: indicatorPrefs.markers.size,
        shape: indicatorPrefs.markers.shape,
      });
      series.attachPrimitive(markersPrimitive);
    }

    /**
     * Intraday: multi-session trades zoom to all loaded bars between first and last fill session (plus pad).
     * Otherwise: NY 6:30am–1:00pm on the trade date (not zoomed to executions only).
     * @returns {boolean} true if visible range was applied
     */
    function applyIntradayDefaultVisibleRange() {
      if (daily || barTimesAsc.length < 2) return false;
      const periodSec = barPeriodSecondsForInterval(chartInterval);
      const pad = periodSec * 2;
      const tz = CHART_BUSINESS_DAY_TZ;

      if (
        chartFillSpan &&
        chartFillSpan.start &&
        chartFillSpan.end &&
        chartFillSpan.start < chartFillSpan.end
      ) {
        let spanMin = Infinity;
        let spanMax = -Infinity;
        for (const t of barTimesAsc) {
          if (typeof t !== "number") continue;
          const d = formatInTimeZone(new Date(t * 1000), tz, "yyyy-MM-dd");
          if (d < chartFillSpan.start || d > chartFillSpan.end) continue;
          spanMin = Math.min(spanMin, t);
          spanMax = Math.max(spanMax, t);
        }
        if (Number.isFinite(spanMin) && Number.isFinite(spanMax) && spanMin <= spanMax) {
          const from = spanMin - pad;
          const to = spanMax + pad;
          if (from < to) {
            try {
              chart.timeScale().setVisibleRange({ from, to });
              return true;
            } catch {
              return false;
            }
          }
        }
      }

      const { from: winFrom, to: winTo } = tradeExecutionDefaultIntradayWindowNy(tradeDate);
      let dayFirst = Infinity;
      let dayLast = -Infinity;
      for (const t of barTimesAsc) {
        if (typeof t !== "number") continue;
        const d = formatInTimeZone(new Date(t * 1000), tz, "yyyy-MM-dd");
        if (d !== tradeDate) continue;
        dayFirst = Math.min(dayFirst, t);
        dayLast = Math.max(dayLast, t);
      }
      if (!Number.isFinite(dayFirst) || !Number.isFinite(dayLast)) return false;
      const from = Math.min(winFrom, dayFirst - pad);
      const to = Math.max(winTo, dayLast + pad);
      if (!(from < to)) return false;
      try {
        chart.timeScale().setVisibleRange({ from, to });
        return true;
      } catch {
        return false;
      }
    }

    const bounds = getNySessionUnixBounds(tradeDate);
    const prevIso = format(subDays(parseISO(tradeDate), 1), "yyyy-MM-dd");
    const prevBounds = getNySessionUnixBounds(prevIso);
    function paintSessionBands() {
      const wrap = sessionLayer;
      const rtWrap = roundTripShadeRef.current;
      if (wrap) wrap.innerHTML = "";
      if (rtWrap) rtWrap.innerHTML = "";
      if (daily) return;
      const ts = chart.timeScale();
      /**
       * lightweight-charts only maps times inside the loaded / visible logical range; session edges
       * (e.g. 04:00) often fall between bars and return null. Clamp to the current visible range first.
       * @param {HTMLElement} targetEl
       * @param {string} className
       */
      /**
       * @param {HTMLElement} targetEl
       * @param {string} className
       * @param {number} t0
       * @param {number} t1
       * @param {{ background?: string } | undefined} [bandStyle]
       */
      function appendTimeBand(targetEl, className, t0, t1, bandStyle) {
        const tLo = Math.min(t0, t1);
        const tHi = Math.max(t0, t1);
        const vr = ts.getVisibleRange();
        let a = tLo;
        let b = tHi;
        if (vr && typeof vr.from === "number" && typeof vr.to === "number") {
          const vf = vr.from;
          const vt = vr.to;
          if (tHi < vf || tLo > vt) return;
          a = Math.max(tLo, vf);
          b = Math.min(tHi, vt);
        }
        let x0 = ts.timeToCoordinate(/** @type {import("lightweight-charts").Time} */ (a));
        let x1 = ts.timeToCoordinate(/** @type {import("lightweight-charts").Time} */ (b));
        if (x0 == null || x1 == null) {
          const asc = barTimesAsc;
          if (!asc.length) return;
          /** @param {number} unix */
          const closestBarTime = (unix) => {
            let lo = 0;
            let hi = asc.length - 1;
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              if (asc[mid] === unix) return unix;
              if (asc[mid] < unix) lo = mid + 1;
              else hi = mid - 1;
            }
            const i = Math.min(Math.max(0, lo), asc.length - 1);
            const j = Math.max(0, i - 1);
            return Math.abs(asc[i] - unix) <= Math.abs(asc[j] - unix) ? asc[i] : asc[j];
          };
          if (x0 == null) x0 = ts.timeToCoordinate(/** @type {import("lightweight-charts").Time} */ (closestBarTime(a)));
          if (x1 == null) x1 = ts.timeToCoordinate(/** @type {import("lightweight-charts").Time} */ (closestBarTime(b)));
        }
        if (x0 == null || x1 == null) return;
        const left = Math.min(x0, x1);
        const w = Math.abs(x1 - x0);
        if (w < 1) return;
        const d = document.createElement("div");
        d.className = className;
        d.style.left = `${left}px`;
        d.style.width = `${w}px`;
        if (bandStyle?.background) d.style.background = bandStyle.background;
        targetEl.appendChild(d);
      }
      if (wrap) {
        appendTimeBand(wrap, "trade-chart-session-band", prevBounds.dayOpen, prevBounds.regularOpen);
        appendTimeBand(wrap, "trade-chart-session-band", prevBounds.regularClose, prevBounds.dayClose);
        appendTimeBand(wrap, "trade-chart-session-band", bounds.dayOpen, bounds.regularOpen);
        appendTimeBand(wrap, "trade-chart-session-band", bounds.regularClose, bounds.dayClose);
      }
      const rtPrefs = indicatorPrefs.roundTripShading;
      if (rtWrap && fills?.length && rtPrefs?.enabled) {
        const periodSec = barPeriodSecondsForInterval(chartInterval);
        const pad = periodSec;
        const alpha = typeof rtPrefs.alpha === "number" ? rtPrefs.alpha : 0.1;
        const spans = completedRoundTripUnixSpans(fills, (f) =>
          fillWallTimeToUnixSeconds(String(f.date ?? tradeDate).trim() || tradeDate, f.time, fillTimeZone),
        );
        for (const sp of spans) {
          const pnl = Number(sp.pnl);
          const hex =
            !Number.isFinite(pnl) || pnl === 0
              ? rtPrefs.flatColor
              : pnl > 0
                ? rtPrefs.winColor
                : rtPrefs.lossColor;
          appendTimeBand(rtWrap, "trade-chart-roundtrip-band", sp.from - pad, sp.to + pad, {
            background: chartHexToRgba(hex, alpha),
          });
        }
      }
    }

    const onTsChange = () =>
      requestAnimationFrame(() => {
        paintSessionBands();
        paintTrendlines();
      });
    chart.timeScale().subscribeVisibleTimeRangeChange(onTsChange);

    function applyDefaultTimeRange() {
      try {
        if (!daily && applyIntradayDefaultVisibleRange()) return;
        chart.timeScale().fitContent();
      } catch {
        try {
          chart.timeScale().fitContent();
        } catch {
          /* ignore */
        }
      }
    }

    function resetChartView() {
      applyDefaultTimeRange();
      chart.priceScale("right").applyOptions({ autoScale: true });
      if (!daily && volBars.length) {
        try {
          chart.priceScale("volume").applyOptions({ autoScale: true });
        } catch {
          /* no volume scale */
        }
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(paintSessionBands);
      });
    }

    resetChartViewRef.current = resetChartView;

    function onWinKeyDown(e) {
      if (!e.altKey) return;
      if (e.key !== "r" && e.key !== "R") return;
      if (e.repeat) return;
      const t = /** @type {HTMLElement | null} */ (e.target);
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
        return;
      }
      e.preventDefault();
      resetChartView();
    }
    window.addEventListener("keydown", onWinKeyDown);

    requestAnimationFrame(() => {
      applyDefaultTimeRange();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          paintSessionBands();
          paintTrendlines();
        });
      });
    });

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
      paintSessionBands();
      requestAnimationFrame(() => paintTrendlines());
    });
    ro.observe(el);

    return () => {
      chartTrendRef.current = null;
      trendlineChartSeriesRef.current = null;
      previewPointRef.current = null;
      riskSegmentDraftRef.current = null;
      riskSegmentPreviewRef.current = null;
      detachRiskDrag();
      el.removeEventListener("pointerdown", onRiskPointerDown);
      chart.unsubscribeClick(onChartClick);
      resetChartViewRef.current = () => {};
      window.removeEventListener("keydown", onWinKeyDown);
      setChartContextMenu(null);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onTsChange);
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      if (crosshairTimeRef.current) {
        crosshairTimeRef.current.style.display = "none";
      }
      if (crosshairHLineRef.current) {
        crosshairHLineRef.current.style.display = "none";
      }
      if (crosshairPriceRef.current) {
        crosshairPriceRef.current.style.display = "none";
      }
      if (markersPrimitive) {
        series.detachPrimitive(markersPrimitive);
      }
      if (sessionLayer) sessionLayer.innerHTML = "";
      if (roundTripShadeRef.current) roundTripShadeRef.current.innerHTML = "";
      ro.disconnect();
      chart.remove();
    };
  }, [
    loading,
    error,
    bars,
    fills,
    tradeDate,
    fillTimeZone,
    chartInterval,
    indicatorPrefs,
    onPatchMarkers,
    onPatchRoundTripShading,
    onRemoveEmaLine,
    chartFillSpan,
    chartSkinId,
  ]);

  useEffect(() => {
    requestAnimationFrame(() => chartTrendRef.current?.paintTrendlines?.());
  }, [riskLines]);

  const menuPos =
    chartContextMenu &&
    (() => {
      const menuW = 240;
      const itemCount =
        1 +
        (typeof onOpenIndicatorsCatalog === "function" ? 1 : 0) +
        (typeof onClearAllIndicators === "function" ? 1 : 0);
      const menuH = itemCount * 44;
      const x = Math.max(6, Math.min(chartContextMenu.x, window.innerWidth - menuW - 6));
      const y = Math.max(6, Math.min(chartContextMenu.y, window.innerHeight - menuH - 6));
      return { left: x, top: y };
    })();

  const intervalBar =
    typeof onChartIntervalChange === "function" ? (
      <div className="trade-chart-interval-bar" role="toolbar" aria-label="Chart interval">
        <div className="trade-chart-interval-bar-left">
          {CHART_INTERVAL_PRESETS.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`trade-chart-interval-btn ${chartInterval === b.id ? "is-active" : ""}`}
              onClick={() => onChartIntervalChange(b.id)}
              aria-pressed={chartInterval === b.id}
              title={
                b.id === "MAX"
                  ? "Daily (1Day) bars — up to 5 calendar years before the trade (same date window as 1d, widest daily history)"
                  : undefined
              }
            >
              {b.label}
            </button>
          ))}
        </div>
        {chartIntervalBarEnd ? (
          <div className="trade-chart-interval-bar-end" aria-label="Chart capture">
            {chartIntervalBarEnd}
          </div>
        ) : null}
      </div>
    ) : null;

  /** @type {import("react").ReactNode} */
  let stackBody;
  if (loading) {
    stackBody = (
      <div className="trade-execution-chart trade-execution-chart--state" ref={containerRef}>
        <p className="trade-execution-chart-msg">Loading chart history…</p>
      </div>
    );
  } else if (error) {
    const status = error.status;
    const isAuth = status === 401 || status === 403;
    stackBody = (
      <div className="trade-execution-chart trade-execution-chart--state" ref={containerRef}>
        <p className="trade-execution-chart-msg trade-execution-chart-msg--error">
          {isAuth
            ? "Could not load chart data. Run npm run dev and add ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY to .env (Market Data subscription may be required for SIP / extended hours)."
            : error.message || "Could not load chart data."}
        </p>
      </div>
    );
  } else if (!bars.length) {
    stackBody = (
      <div className="trade-execution-chart trade-execution-chart--state" ref={containerRef}>
        <p className="trade-execution-chart-msg">
          No bars for this symbol and date. It may be delisted, wrong ticker, or outside Alpaca history.
        </p>
      </div>
    );
  } else {
    stackBody = (
      <>
        <div
          className={`trade-execution-chart-host${riskLineMarkMode ? " trade-execution-chart-host--risk-mark" : ""}${
            trendlineDrawMode ? " trade-execution-chart-host--numbered-notes" : ""
          }`}
          onContextMenu={(e) => {
            e.preventDefault();
            setChartContextMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          <div className="trade-execution-chart trade-execution-chart-canvas" ref={containerRef} />
          <svg
            ref={trendlineSvgRef}
            className="trade-chart-trendlines-overlay"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          />
          <div ref={crosshairHLineRef} className="trade-chart-crosshair-hline" aria-hidden>
            <svg className="trade-chart-crosshair-hline-svg" preserveAspectRatio="none" aria-hidden>
              <line
                x1="0"
                y1="1"
                x2="100%"
                y2="1"
                className="trade-chart-crosshair-hline-line"
                vectorEffect="nonScalingStroke"
              />
            </svg>
          </div>
          <div ref={crosshairPriceRef} className="trade-chart-crosshair-price" aria-hidden />
          <div ref={crosshairTimeRef} className="trade-chart-crosshair-time" aria-hidden />
          <div ref={roundTripShadeRef} className="trade-chart-roundtrip-shades" aria-hidden />
          <div ref={sessionShadeRef} className="trade-chart-session-shades" aria-hidden />
          <div className="trade-execution-chart-legend-slot">
            <button
              type="button"
              className={`trade-chart-ema-legend-toggle trade-chart-ema-legend-toggle--icon-only ${emaLegendOpen ? "is-open" : ""}`}
              onClick={() => setEmaLegendOpen((o) => !o)}
              aria-expanded={emaLegendOpen}
              aria-label={emaLegendOpen ? "Hide indicator list" : "Show indicator list"}
              title={emaLegendOpen ? "Hide indicator list" : "Show indicator list"}
            >
              <svg className="trade-chart-ema-legend-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                <path
                  fill="currentColor"
                  d="M5 17h2v-6H5v6zm4 0h2V7H9v10zm4 0h2v-4h-2v4zm4 0h2v-8h-2v8z"
                  opacity="0.92"
                />
                <path fill="currentColor" d="M4 19h16v2H4v-2z" opacity="0.55" />
              </svg>
            </button>
            {emaLegendOpen ? (
              <ChartIndicatorLegend
                rows={legendRows}
                prefs={indicatorPrefs}
                onPatchEma={onPatchEma}
                onPatchVwap={onPatchVwap}
                onPatchMarkers={onPatchMarkers}
                onPatchRoundTripShading={onPatchRoundTripShading}
                onRemoveEma={onRemoveEmaLine}
                fillsCount={fills?.length ?? 0}
              />
            ) : null}
          </div>
        </div>
        {chartContextMenu && menuPos ? (
          <div
            className="trade-chart-context-menu"
            style={{ position: "fixed", left: menuPos.left, top: menuPos.top, zIndex: 200 }}
            role="menu"
            aria-label="Chart"
          >
            <button
              type="button"
              className="trade-chart-context-item"
              role="menuitem"
              onClick={() => {
                resetChartViewRef.current();
                setChartContextMenu(null);
              }}
            >
              <span className="trade-chart-context-item-icon" aria-hidden>
                ↺
              </span>
              <span className="trade-chart-context-item-label">Reset chart view</span>
              <kbd className="trade-chart-context-kbd">Alt+R</kbd>
            </button>
            {typeof onOpenIndicatorsCatalog === "function" ? (
              <button
                type="button"
                className="trade-chart-context-item"
                role="menuitem"
                onClick={() => {
                  onOpenIndicatorsCatalog();
                  setChartContextMenu(null);
                }}
              >
                <span className="trade-chart-context-item-icon" aria-hidden>
                  ≡
                </span>
                <span className="trade-chart-context-item-label">Browse indicators catalog…</span>
              </button>
            ) : null}
            {typeof onClearAllIndicators === "function" ? (
              <button
                type="button"
                className="trade-chart-context-item"
                role="menuitem"
                onClick={() => {
                  onClearAllIndicators();
                  setChartContextMenu(null);
                }}
              >
                <span className="trade-chart-context-item-icon" aria-hidden>
                  ⊗
                </span>
                <span className="trade-chart-context-item-label">Remove all indicators</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="trade-execution-chart-wrap" data-chart-skin={chartSkinId}>
      <div className="trade-execution-chart-stack">{stackBody}</div>
      {intervalBar}
    </div>
  );
}
