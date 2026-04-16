import { useEffect, useId, useRef, useState } from "react";
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
import { createSoftTriangleMarkersSeriesPrimitive } from "../chart/softTriangleMarkersPrimitive";
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
import { DEFAULT_CHART_INDICATOR_PREFS } from "../storage/chartIndicatorPrefs";
import { resolveChartEmaColor } from "../lib/chartEmaColors";
import {
  CHART_INTERVAL_EXTRAS,
  CHART_INTERVAL_PRESETS,
  barPeriodSecondsForInterval,
} from "../lib/chartIntervals";
import ChartIndicatorLegend from "./ChartIndicatorLegend";

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

function collectExecutionMarkers(
  fills,
  tradeDate,
  fillTimeZone,
  barTimesAsc,
  daily,
  dailyMarkerTime,
  chartInterval,
  lwBarsByTime,
) {
  if (!fills?.length) return [];

  const periodSec = barPeriodSecondsForInterval(chartInterval);
  const barTimeSet = new Set(barTimesAsc);

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

    out.push({ time, price: displayPrice, isBuy });
  }

  out.sort((a, b) => {
    if (a.time === b.time) return 0;
    if (typeof a.time === "string") return String(a.time).localeCompare(String(b.time));
    return a.time - b.time;
  });

  return out;
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
  onRemoveEmaLine,
}) {
  const containerRef = useRef(null);
  const sessionShadeRef = useRef(null);
  const crosshairTimeRef = useRef(null);
  const resetChartViewRef = useRef(() => {});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bars, setBars] = useState([]);
  const [legendRows, setLegendRows] = useState([]);
  const [emaLegendOpen, setEmaLegendOpen] = useState(false);
  const [chartContextMenu, setChartContextMenu] = useState(/** @type {{ x: number, y: number } | null} */ (null));
  const [customIntervalOpen, setCustomIntervalOpen] = useState(false);
  const customIntervalRef = useRef(null);
  const customIntervalMenuId = useId();

  useEffect(() => {
    if (!customIntervalOpen) return;
    function onDoc(e) {
      const el = /** @type {Node | null} */ (e.target);
      if (!customIntervalRef.current || !el || customIntervalRef.current.contains(el)) return;
      setCustomIntervalOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setCustomIntervalOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [customIntervalOpen]);

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
        vertLine: { labelVisible: false, color: TOS_CHART.crosshair },
        horzLine: { color: TOS_CHART.crosshair },
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
      priceScaleId: "right",
    });
    series.setData(lwBars);

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

    function onCrosshairMove(param) {
      updateLegend(param);
      updateCrosshairTimeLabel(param);
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
    );
    /** @type {import('lightweight-charts').ISeriesPrimitive<import('lightweight-charts').Time> | null} */
    let markersPrimitive = null;
    if (execMarkers.length) {
      markersPrimitive = createSoftTriangleMarkersSeriesPrimitive(series, execMarkers, {
        buy: indicatorPrefs.markers.buy,
        sell: indicatorPrefs.markers.sell,
        size: indicatorPrefs.markers.size,
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
      if (!wrap) return;
      wrap.innerHTML = "";
      if (daily) return;
      const ts = chart.timeScale();
      /**
       * lightweight-charts only maps times inside the loaded / visible logical range; session edges
       * (e.g. 04:00) often fall between bars and return null. Clamp to the current visible range first.
       */
      function addBand(t0, t1) {
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
        d.className = "trade-chart-session-band";
        d.style.left = `${left}px`;
        d.style.width = `${w}px`;
        wrap.appendChild(d);
      }
      addBand(prevBounds.dayOpen, prevBounds.regularOpen);
      addBand(prevBounds.regularClose, prevBounds.dayClose);
      addBand(bounds.dayOpen, bounds.regularOpen);
      addBand(bounds.regularClose, bounds.dayClose);
    }

    const onTsChange = () => requestAnimationFrame(paintSessionBands);
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
        requestAnimationFrame(paintSessionBands);
      });
    });

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
      paintSessionBands();
    });
    ro.observe(el);

    return () => {
      resetChartViewRef.current = () => {};
      window.removeEventListener("keydown", onWinKeyDown);
      setChartContextMenu(null);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onTsChange);
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      if (crosshairTimeRef.current) {
        crosshairTimeRef.current.style.display = "none";
      }
      if (markersPrimitive) {
        series.detachPrimitive(markersPrimitive);
      }
      if (sessionLayer) sessionLayer.innerHTML = "";
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
    onRemoveEmaLine,
  ]);

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
          >
            {b.label}
          </button>
        ))}
        <div className="trade-chart-interval-custom-wrap" ref={customIntervalRef}>
          <button
            type="button"
            className={`trade-chart-interval-custom-trigger ${
              CHART_INTERVAL_EXTRAS.some((x) => x.id === chartInterval) ? "is-active" : ""
            }`}
            aria-expanded={customIntervalOpen}
            aria-haspopup="menu"
            aria-controls={customIntervalMenuId}
            title="More intervals (3m, 30m, 2h, 4h, weekly)"
            onClick={() => setCustomIntervalOpen((o) => !o)}
          >
            +
          </button>
          {customIntervalOpen ? (
            <div
              id={customIntervalMenuId}
              className="trade-chart-interval-custom-menu"
              role="menu"
              aria-label="More chart intervals"
            >
              <p className="trade-chart-interval-custom-hint">Extra timeframes</p>
              {CHART_INTERVAL_EXTRAS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="menuitem"
                  className={`trade-chart-interval-custom-item ${chartInterval === b.id ? "is-active" : ""}`}
                  onClick={() => {
                    onChartIntervalChange(b.id);
                    setCustomIntervalOpen(false);
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
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
          className="trade-execution-chart-host"
          onContextMenu={(e) => {
            e.preventDefault();
            setChartContextMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          <div className="trade-execution-chart trade-execution-chart-canvas" ref={containerRef} />
          <div ref={crosshairTimeRef} className="trade-chart-crosshair-time" aria-hidden />
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
