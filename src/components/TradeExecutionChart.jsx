import { useEffect, useRef, useState } from "react";
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

/** Thinkorswim-style dark chart: pane color, grid, and candles closer to desktop TOS equity charts. */
const TOS_CHART = {
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
};

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
) {
  if (!fills?.length) return [];

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
    if (useColor) {
      row.fill = executionQuantityToMarkerFill(baseHex, quantity, qMin, qMax);
    } else {
      row.fill = baseHex;
    }
    if (useSize) {
      row.size = executionQuantityToMarkerPixelSize(quantity, qMin, qMax, markerBaseSize);
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

/** One pass: dedupe by bar time, keep candles + volume aligned (intraday). */
function barsToCandlesAndVolume(bars, daily) {
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
        vol: alpacaBarToVolumeHistogram(b, false),
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
  /** @type {{ id: string, price: number }[]} */
  riskLines = [],
  /** @param {number} price */
  onAddRiskLineAtPrice,
  riskLineMarkMode = false,
  /** @type {{ id: string, t1: number | string, p1: number, t2: number | string, p2: number }[]} */
  trendlines = [],
  /** @param {(prev: { id: string, t1: number | string, p1: number, t2: number | string, p2: number }[]) => { id: string, t1: number | string, p1: number, t2: number | string, p2: number }[]} updater */
  onTrendlinesChange,
  trendlineDrawMode = false,
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
  const onAddRiskLineAtPriceRef = useRef(onAddRiskLineAtPrice);
  onAddRiskLineAtPriceRef.current = onAddRiskLineAtPrice;

  /** @type {import("react").MutableRefObject<{ syncRiskLines: () => void } | null>} */
  const chartRiskApiRef = useRef(null);

  const trendlinesRef = useRef(trendlines);
  trendlinesRef.current = trendlines;
  const trendlineDrawModeRef = useRef(trendlineDrawMode);
  trendlineDrawModeRef.current = trendlineDrawMode;
  const onTrendlinesChangeRef = useRef(onTrendlinesChange);
  const trendlineDraftRef = useRef(/** @type {{ t: number | string, p: number } | null} */ (null));
  const previewPointRef = useRef(/** @type {{ t: number | string, p: number } | null} */ (null));
  /** @type {import("react").MutableRefObject<{ paintTrendlines: () => void } | null>} */
  const chartTrendRef = useRef(null);

  useEffect(() => {
    onTrendlinesChangeRef.current = onTrendlinesChange;
  }, [onTrendlinesChange]);

  useEffect(() => {
    if (!trendlineDrawMode) {
      trendlineDraftRef.current = null;
      previewPointRef.current = null;
      requestAnimationFrame(() => chartTrendRef.current?.paintTrendlines?.());
    }
  }, [trendlineDrawMode]);

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

  useEffect(() => {
    let cancelled = false;
    const timeframe = chartIntervalToAlpacaTimeframe(chartInterval);
    const { start, end, maxTotalBars } = chartHistoryQuery(tradeDate, chartInterval);

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
  }, [symbol, tradeDate, chartInterval]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || loading || error || !bars.length) return;

    const daily = isDailyInterval(chartInterval);
    const { lwBars, volBars } = barsToCandlesAndVolume(bars, daily);

    if (!lwBars.length) return;

    const barTimesAsc = daily
      ? []
      : lwBars.map((b) => b.time).filter((t) => typeof t === "number");

    const dailyMarkerTime = daily
      ? lwBars.find((b) => b.time === tradeDate)?.time ?? lwBars[lwBars.length - 1]?.time ?? tradeDate
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
        background: { type: ColorType.Solid, color: TOS_CHART.bg },
        textColor: TOS_CHART.text,
        attributionLogo: false,
      },
      localization: {
        timeFormatter: (t) => formatCrosshairTimeLabel(t, daily, displayTz) || "—",
      },
      grid: {
        vertLines: { color: TOS_CHART.grid },
        horzLines: { color: TOS_CHART.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        // Built-in time-axis label can disagree with cursor X when hovering the volume strip (separate price scale).
        // LargeDashed + width 1 matches LW internals (6px dash, 6px gap); custom horz line uses the same pattern.
        vertLine: {
          labelVisible: false,
          color: TOS_CHART.crosshair,
          width: 1,
          style: LineStyle.LargeDashed,
        },
        /* Library horz is drawn under our HTML session/round-trip overlays; draw our own in subscribeCrosshairMove. */
        horzLine: { visible: false, labelVisible: false, color: TOS_CHART.crosshair },
      },
      rightPriceScale: { borderColor: TOS_CHART.border },
      timeScale: {
        borderColor: TOS_CHART.border,
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
      upColor: TOS_CHART.candleUp,
      downColor: TOS_CHART.candleDown,
      borderUpColor: TOS_CHART.candleBorderUp,
      borderDownColor: TOS_CHART.candleBorderDown,
      borderVisible: true,
      wickUpColor: TOS_CHART.wickUp,
      wickDownColor: TOS_CHART.wickDown,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      priceScaleId: "right",
    });
    series.setData(lwBars);
    trendlineChartSeriesRef.current = { chart, series };

    /** @type {import("lightweight-charts").IPriceLine[]} */
    const riskLineHandles = [];
    function syncRiskLines() {
      for (const h of riskLineHandles) {
        try {
          series.removePriceLine(h);
        } catch {
          /* ignore */
        }
      }
      riskLineHandles.length = 0;
      for (const row of riskLinesRef.current) {
        if (!row || !Number.isFinite(row.price)) continue;
        try {
          const pl = series.createPriceLine({
            price: row.price,
            color: "rgba(245, 158, 11, 0.95)",
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "Risk",
          });
          riskLineHandles.push(pl);
        } catch {
          /* ignore */
        }
      }
    }
    syncRiskLines();
    chartRiskApiRef.current = { syncRiskLines };

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
      const defs = document.createElementNS(ns, "defs");
      const marker = document.createElementNS(ns, "marker");
      marker.setAttribute("id", "trade-tl-arrow");
      marker.setAttribute("markerWidth", "9");
      marker.setAttribute("markerHeight", "9");
      marker.setAttribute("refX", "8");
      marker.setAttribute("refY", "3");
      marker.setAttribute("orient", "auto");
      const mp = document.createElementNS(ns, "path");
      mp.setAttribute("d", "M0,0 L0,6 L9,3 z");
      mp.setAttribute("fill", "#60a5fa");
      marker.appendChild(mp);
      defs.appendChild(marker);
      svg.appendChild(defs);

      const lines = trendlinesRef.current ?? [];
      for (let i = 0; i < lines.length; i += 1) {
        const L = lines[i];
        const x1 = ch.timeScale().timeToCoordinate(L.t1);
        const y1 = se.priceToCoordinate(L.p1);
        const x2 = ch.timeScale().timeToCoordinate(L.t2);
        const y2 = se.priceToCoordinate(L.p2);
        if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
        const ln = document.createElementNS(ns, "line");
        ln.setAttribute("x1", String(x1));
        ln.setAttribute("y1", String(y1));
        ln.setAttribute("x2", String(x2));
        ln.setAttribute("y2", String(y2));
        ln.setAttribute("stroke", "#60a5fa");
        ln.setAttribute("stroke-width", "2");
        ln.setAttribute("marker-end", "url(#trade-tl-arrow)");
        svg.appendChild(ln);
        const tx = document.createElementNS(ns, "text");
        tx.setAttribute("x", String(x1 + 6));
        tx.setAttribute("y", String(y1 - 5));
        tx.setAttribute("fill", "#60a5fa");
        tx.setAttribute("font-size", "13");
        tx.setAttribute("font-weight", "800");
        tx.setAttribute("font-family", "system-ui, sans-serif");
        tx.textContent = String(i + 1);
        svg.appendChild(tx);
      }

      const draft = trendlineDraftRef.current;
      const prev = previewPointRef.current;
      if (draft && prev) {
        const x1 = ch.timeScale().timeToCoordinate(draft.t);
        const y1 = se.priceToCoordinate(draft.p);
        const x2 = ch.timeScale().timeToCoordinate(prev.t);
        const y2 = se.priceToCoordinate(prev.p);
        if (x1 != null && y1 != null && x2 != null && y2 != null) {
          const pl = document.createElementNS(ns, "line");
          pl.setAttribute("x1", String(x1));
          pl.setAttribute("y1", String(y1));
          pl.setAttribute("x2", String(x2));
          pl.setAttribute("y2", String(y2));
          pl.setAttribute("stroke", "#93c5fd");
          pl.setAttribute("stroke-width", "2");
          pl.setAttribute("stroke-dasharray", "6 4");
          svg.appendChild(pl);
        }
      } else if (draft) {
        const cx = ch.timeScale().timeToCoordinate(draft.t);
        const cy = se.priceToCoordinate(draft.p);
        if (cx != null && cy != null) {
          const c = document.createElementNS(ns, "circle");
          c.setAttribute("cx", String(cx));
          c.setAttribute("cy", String(cy));
          c.setAttribute("r", "5");
          c.setAttribute("fill", "rgba(96, 165, 250, 0.35)");
          c.setAttribute("stroke", "#60a5fa");
          c.setAttribute("stroke-width", "2");
          svg.appendChild(c);
        }
      }
    }

    chartTrendRef.current = { paintTrendlines };

    /** @param {import("lightweight-charts").MouseEventParams} param */
    function onChartClick(param) {
      if (typeof param.paneIndex === "number" && param.paneIndex !== 0) return;

      if (trendlineDrawModeRef.current && typeof onTrendlinesChangeRef.current === "function") {
        const t = timeFromChartClick(param);
        if (t == null || !param.point || typeof param.point.y !== "number") return;
        const p = priceFromSeriesY(param.point.y);
        if (!Number.isFinite(p)) return;
        const draft = trendlineDraftRef.current;
        if (!draft) {
          trendlineDraftRef.current = { t, p };
          previewPointRef.current = null;
          paintTrendlines();
          return;
        }
        const a = draft;
        trendlineDraftRef.current = null;
        previewPointRef.current = null;
        const id =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `tl-${Date.now()}`;
        onTrendlinesChangeRef.current((prev) => [...(prev ?? []), { id, t1: a.t, p1: a.p, t2: t, p2: p }]);
        paintTrendlines();
        return;
      }

      if (!riskLineMarkModeRef.current || typeof onAddRiskLineAtPriceRef.current !== "function") return;
      if (!param.point || typeof param.point.y !== "number") return;
      const raw = series.coordinateToPrice(param.point.y);
      const price =
        typeof raw === "number"
          ? raw
          : raw && typeof raw === "object" && "close" in raw && typeof /** @type {{ close?: unknown }} */ (raw).close === "number"
            ? /** @type {{ close: number }} */ (raw).close
            : NaN;
      if (!Number.isFinite(price)) return;
      onAddRiskLineAtPriceRef.current(price);
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
      if (trendlineDrawModeRef.current && trendlineDraftRef.current && param?.point && typeof param.point.x === "number" && typeof param.point.y === "number") {
        const t2 = chart.timeScale().coordinateToTime(param.point.x);
        const p2 = priceFromSeriesY(param.point.y);
        if (t2 != null && Number.isFinite(p2)) {
          previewPointRef.current = { t: t2, p: p2 };
          paintTrendlines();
        }
      } else {
        previewPointRef.current = null;
        if (trendlineDrawModeRef.current && trendlineDraftRef.current) paintTrendlines();
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
    );
    /** @type {import('lightweight-charts').ISeriesPrimitive<import('lightweight-charts').Time> | null} */
    let markersPrimitive = null;
    if (execMarkers.length) {
      markersPrimitive = createExecutionMarkersSeriesPrimitive(series, execMarkers, {
        buy: indicatorPrefs.markers.buy,
        sell: indicatorPrefs.markers.sell,
        size: indicatorPrefs.markers.size,
        shape: indicatorPrefs.markers.shape,
      });
      series.attachPrimitive(markersPrimitive);
    }

    /**
     * Intraday: viewport always includes NY 6:30am–1:00pm on the trade date (not zoomed to executions only).
     * Uses trade-day bar min/max (not whole-history last bar) so an early-halt day still shows through 13:00.
     * @returns {boolean} true if visible range was applied
     */
    function applyIntradayDefaultVisibleRange() {
      if (daily || barTimesAsc.length < 2) return false;
      const periodSec = barPeriodSecondsForInterval(chartInterval);
      const pad = periodSec * 2;
      const { from: winFrom, to: winTo } = tradeExecutionDefaultIntradayWindowNy(tradeDate);
      const tz = CHART_BUSINESS_DAY_TZ;
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
          fillWallTimeToUnixSeconds(tradeDate, f.time, fillTimeZone),
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
      trendlineDraftRef.current = null;
      previewPointRef.current = null;
      chartRiskApiRef.current = null;
      for (const h of riskLineHandles) {
        try {
          series.removePriceLine(h);
        } catch {
          /* ignore */
        }
      }
      riskLineHandles.length = 0;
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
  ]);

  useEffect(() => {
    chartRiskApiRef.current?.syncRiskLines();
  }, [riskLines]);

  const menuPos =
    chartContextMenu &&
    (() => {
      const menuW = 240;
      const menuH = 44;
      const x = Math.max(6, Math.min(chartContextMenu.x, window.innerWidth - menuW - 6));
      const y = Math.max(6, Math.min(chartContextMenu.y, window.innerHeight - menuH - 6));
      return { left: x, top: y };
    })();

  const intervalBar =
    typeof onChartIntervalChange === "function" ? (
      <div className="trade-chart-interval-bar" role="toolbar" aria-label="Chart interval">
        {CHART_INTERVAL_PRESETS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`trade-chart-interval-btn ${chartInterval === b.id ? "is-active" : ""}`}
            onClick={() => onChartIntervalChange(b.id)}
            aria-pressed={chartInterval === b.id}
            title={b.id === "MAX" ? "1-minute bars with the widest loaded history" : undefined}
          >
            {b.label}
          </button>
        ))}
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
            trendlineDrawMode ? " trade-execution-chart-host--trend-draw" : ""
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
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="trade-execution-chart-wrap">
      <div className="trade-execution-chart-stack">{stackBody}</div>
      {intervalBar}
    </div>
  );
}
