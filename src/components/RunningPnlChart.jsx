import { useEffect, useRef } from "react";
import { formatInTimeZone } from "date-fns-tz";
import {
  BaselineSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  LineType,
  TickMarkType,
} from "lightweight-charts";
import { chartSkinColors } from "../lib/chartSkins";

const DISPLAY_TZ = "America/New_York";

/** Tradervue-like fills + line contrast for dark chart skins. */
const RUN_PNL_PALETTE = {
  trade: {
    tos: {
      topFill1: "rgba(129, 199, 132, 0.38)",
      topFill2: "rgba(129, 199, 132, 0.06)",
      bottomFill1: "rgba(239, 154, 154, 0.36)",
      bottomFill2: "rgba(239, 154, 154, 0.06)",
      topLine: "#c8e6c9",
      bottomLine: "#ffcdd2",
      buyMarker: "#81c784",
      sellMarker: "#e57373",
      lineWidth: 2,
    },
    das: {
      topFill1: "rgba(0, 230, 118, 0.32)",
      topFill2: "rgba(0, 230, 118, 0.05)",
      bottomFill1: "rgba(255, 82, 82, 0.3)",
      bottomFill2: "rgba(255, 82, 82, 0.05)",
      topLine: "#69f0ae",
      bottomLine: "#ff8a80",
      buyMarker: "#00e676",
      sellMarker: "#ff5252",
      lineWidth: 2,
    },
  },
  day: {
    tos: {
      topFill1: "rgba(165, 214, 167, 0.45)",
      topFill2: "rgba(165, 214, 167, 0.08)",
      bottomFill1: "rgba(244, 143, 177, 0.42)",
      bottomFill2: "rgba(244, 143, 177, 0.09)",
      topLine: "#eceff1",
      bottomLine: "#eceff1",
      buyMarker: "#a5d6a7",
      sellMarker: "#f48fb1",
      lineWidth: 2,
    },
    das: {
      topFill1: "rgba(0, 200, 83, 0.4)",
      topFill2: "rgba(0, 200, 83, 0.08)",
      bottomFill1: "rgba(255, 23, 68, 0.36)",
      bottomFill2: "rgba(255, 23, 68, 0.08)",
      topLine: "#b9f6ca",
      bottomLine: "#ff8a80",
      buyMarker: "#69f0ae",
      sellMarker: "#ff5252",
      lineWidth: 2,
    },
  },
};

/**
 * @param {{ time: number, value: number }[]} points
 * @param {string} displayTz
 */
function createTickFormatter(displayTz) {
  return (time, tickMarkType) => {
    if (typeof time !== "number") return "";
    const d = new Date(time * 1000);
    switch (tickMarkType) {
      case TickMarkType.Time:
      case TickMarkType.TimeWithSeconds:
        return formatInTimeZone(d, displayTz, "HH:mm");
      case TickMarkType.DayOfMonth:
        return formatInTimeZone(d, displayTz, "MMM d");
      default:
        return formatInTimeZone(d, displayTz, "HH:mm");
    }
  };
}

/**
 * Running P&amp;L (stepped at fills). Mouse wheel / pinch zoom only (no pan); uses same dark skins as execution chart.
 *
 * @param {{ time: number, value: number }[]} points
 * @param {{ time: number, value: number, kind: 'buy'|'sell', id?: string }[]} [fillMarkers] buy/sell markers on the P&amp;L line (price-positioned)
 * @param {'tos'|'das'} chartSkinId
 * @param {'trade'|'day'} [variant] day = softer full-session / portfolio look
 * @param {string} [ariaLabel] screen reader label (no visible title unless `title` set)
 * @param {string} [title] optional visible title above chart
 */
export default function RunningPnlChart({
  points = [],
  fillMarkers = [],
  chartSkinId = "tos",
  variant = "trade",
  ariaLabel = "Running P and L chart",
  title,
  hint,
}) {
  const hostRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const skin = chartSkinColors(chartSkinId);
    const pal = RUN_PNL_PALETTE[variant === "day" ? "day" : "trade"][chartSkinId === "das" ? "das" : "tos"];
    const data = (points ?? [])
      .filter((p) => p && typeof p.time === "number" && Number.isFinite(p.value))
      .map((p) => ({ time: p.time, value: p.value }));

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: skin.bg },
        textColor: skin.text,
        attributionLogo: false,
        fontSize: 12,
      },
      localization: {
        timeFormatter: (t) => {
          if (typeof t !== "number") return "";
          return formatInTimeZone(new Date(t * 1000), DISPLAY_TZ, "MMM d HH:mm");
        },
        priceFormatter: (p) => {
          const n = Number(p);
          if (!Number.isFinite(n)) return "";
          const abs = Math.abs(n);
          const s = abs.toFixed(2);
          return n < 0 ? `-$${s}` : `$${s}`;
        },
      },
      grid: {
        vertLines: { color: variant === "day" ? "rgba(55, 60, 72, 0.55)" : skin.grid },
        horzLines: { color: skin.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: skin.crosshair, width: 1 },
        horzLine: { color: skin.crosshair, width: 1 },
      },
      rightPriceScale: {
        borderColor: skin.border,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: skin.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        tickMarkFormatter: createTickFormatter(DISPLAY_TZ),
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: false,
        horzTouchDrag: false,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: false, price: false },
        axisDoubleClickReset: { time: false, price: false },
      },
      width: el.clientWidth,
      height: el.clientHeight,
    });

    const series = chart.addSeries(BaselineSeries, {
      baseValue: { type: "price", price: 0 },
      relativeGradient: variant === "day",
      topFillColor1: pal.topFill1,
      topFillColor2: pal.topFill2,
      topLineColor: pal.topLine,
      bottomFillColor1: pal.bottomFill1,
      bottomFillColor2: pal.bottomFill2,
      bottomLineColor: pal.bottomLine,
      lineWidth: pal.lineWidth,
      lineType: LineType.WithSteps,
      lastValueVisible: true,
      priceLineVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerBorderColor: "rgba(255,255,255,0.35)",
      crosshairMarkerBackgroundColor: "rgba(30,34,45,0.92)",
    });

    if (data.length) series.setData(data);

    const markerRows = (fillMarkers ?? [])
      .filter((m) => m && typeof m.time === "number" && Number.isFinite(m.value) && (m.kind === "buy" || m.kind === "sell"))
      .map((m) => ({
        time: m.time,
        position: "atPriceMiddle",
        price: m.value,
        shape: m.kind === "buy" ? "circle" : "square",
        color: m.kind === "buy" ? pal.buyMarker : pal.sellMarker,
        size: variant === "day" ? 2.25 : 2,
        ...(m.id ? { id: m.id } : {}),
      }));

    /** @type {{ detach: () => void } | null} */
    let markersApi = null;
    if (markerRows.length) {
      markersApi = createSeriesMarkers(series, markerRows, { autoScale: true });
    }

    requestAnimationFrame(() => {
      try {
        chart.timeScale().fitContent();
        chart.priceScale("right").applyOptions({ autoScale: true });
      } catch {
        /* ignore */
      }
    });

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      try {
        markersApi?.detach();
      } catch {
        /* ignore */
      }
      chart.remove();
    };
  }, [points, chartSkinId, fillMarkers, variant]);

  const showTitle = typeof title === "string" && title.trim().length > 0;
  const showHint = typeof hint === "string" && hint.trim().length > 0;
  const showLegend = Array.isArray(fillMarkers) && fillMarkers.length > 0;
  const posSwatch =
    variant === "day" ? "rgba(165, 214, 167, 0.75)" : chartSkinId === "das" ? "rgba(0, 230, 118, 0.65)" : "rgba(129, 199, 132, 0.85)";
  const negSwatch =
    variant === "day" ? "rgba(244, 143, 177, 0.75)" : chartSkinId === "das" ? "rgba(255, 82, 82, 0.65)" : "rgba(239, 154, 154, 0.85)";

  return (
    <div className="running-pnl-chart">
      {showTitle ? <div className="running-pnl-chart-title">{title}</div> : null}
      {showHint ? <p className="running-pnl-chart-hint">{hint}</p> : null}
      {showLegend ? (
        <div className="running-pnl-chart-legend running-pnl-chart-legend--tradervue" aria-hidden="true">
          <span className="running-pnl-chart-legend-item">
            <span className="running-pnl-chart-legend-swatch running-pnl-chart-legend-swatch--area" style={{ background: posSwatch }} />
            Positive P&amp;L
          </span>
          <span className="running-pnl-chart-legend-item">
            <span className="running-pnl-chart-legend-swatch running-pnl-chart-legend-swatch--area" style={{ background: negSwatch }} />
            Negative P&amp;L
          </span>
          <span className="running-pnl-chart-legend-item">
            <span className="running-pnl-chart-legend-swatch running-pnl-chart-legend-swatch--buy" /> Buys
          </span>
          <span className="running-pnl-chart-legend-item">
            <span className="running-pnl-chart-legend-swatch running-pnl-chart-legend-swatch--sell" /> Sells
          </span>
        </div>
      ) : null}
      <div className="running-pnl-chart-host" ref={hostRef} role="img" aria-label={ariaLabel} />
    </div>
  );
}
