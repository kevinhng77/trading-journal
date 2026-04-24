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
 * @param {string} [ariaLabel] screen reader label (no visible title unless `title` set)
 * @param {string} [title] optional visible title above chart
 */
export default function RunningPnlChart({
  points = [],
  fillMarkers = [],
  chartSkinId = "tos",
  ariaLabel = "Running P and L chart",
  title,
  hint,
}) {
  const hostRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const skin = chartSkinColors(chartSkinId);
    const data = (points ?? [])
      .filter((p) => p && typeof p.time === "number" && Number.isFinite(p.value))
      .map((p) => ({ time: p.time, value: p.value }));

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: skin.bg },
        textColor: skin.text,
        attributionLogo: false,
      },
      localization: {
        timeFormatter: (t) => {
          if (typeof t !== "number") return "";
          return formatInTimeZone(new Date(t * 1000), DISPLAY_TZ, "MMM d HH:mm");
        },
      },
      grid: {
        vertLines: { color: skin.grid },
        horzLines: { color: skin.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: skin.crosshair, width: 1 },
        horzLine: { color: skin.crosshair, width: 1 },
      },
      rightPriceScale: { borderColor: skin.border },
      timeScale: {
        borderColor: skin.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 14,
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

    const buyMarkerColor = chartSkinId === "das" ? "#00e676" : "#4caf50";
    const sellMarkerColor = chartSkinId === "das" ? "#ff1744" : "#ef5350";

    const series = chart.addSeries(BaselineSeries, {
      baseValue: { type: "price", price: 0 },
      topLineColor: buyMarkerColor,
      topFillColor1: chartSkinId === "das" ? "rgba(0, 230, 118, 0.28)" : "rgba(76, 175, 80, 0.28)",
      bottomLineColor: sellMarkerColor,
      bottomFillColor1: chartSkinId === "das" ? "rgba(255, 23, 68, 0.26)" : "rgba(239, 83, 80, 0.26)",
      lineWidth: 2,
      lineType: LineType.WithSteps,
      lastValueVisible: true,
      priceLineVisible: false,
      crosshairMarkerVisible: true,
    });

    if (data.length) series.setData(data);

    const markerRows = (fillMarkers ?? [])
      .filter((m) => m && typeof m.time === "number" && Number.isFinite(m.value) && (m.kind === "buy" || m.kind === "sell"))
      .map((m) => ({
        time: m.time,
        position: "atPriceMiddle",
        price: m.value,
        shape: m.kind === "buy" ? "circle" : "square",
        color: m.kind === "buy" ? buyMarkerColor : sellMarkerColor,
        size: 2,
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
  }, [points, chartSkinId, fillMarkers]);

  const showTitle = typeof title === "string" && title.trim().length > 0;
  const showHint = typeof hint === "string" && hint.trim().length > 0;
  const showLegend = Array.isArray(fillMarkers) && fillMarkers.length > 0;

  return (
    <div className="running-pnl-chart">
      {showTitle ? <div className="running-pnl-chart-title">{title}</div> : null}
      {showHint ? <p className="running-pnl-chart-hint">{hint}</p> : null}
      {showLegend ? (
        <div className="running-pnl-chart-legend" aria-hidden="true">
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
