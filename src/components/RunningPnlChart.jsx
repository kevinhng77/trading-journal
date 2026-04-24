import { useEffect, useRef } from "react";
import { formatInTimeZone } from "date-fns-tz";
import {
  BaselineSeries,
  ColorType,
  createChart,
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
 * Running P&amp;L (stepped at fills). Interactive pan/zoom; uses same dark skins as execution chart.
 *
 * @param {{ time: number, value: number }[]} points
 * @param {'tos'|'das'} chartSkinId
 * @param {string} [ariaLabel] screen reader label (no visible title unless `title` set)
 * @param {string} [title] optional visible title above chart
 */
export default function RunningPnlChart({
  points = [],
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
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      width: el.clientWidth,
      height: el.clientHeight,
    });

    const series = chart.addSeries(BaselineSeries, {
      baseValue: { type: "price", price: 0 },
      topLineColor: chartSkinId === "das" ? "#00e676" : "#4caf50",
      topFillColor1: chartSkinId === "das" ? "rgba(0, 230, 118, 0.28)" : "rgba(76, 175, 80, 0.28)",
      bottomLineColor: chartSkinId === "das" ? "#ff1744" : "#ef5350",
      bottomFillColor1: chartSkinId === "das" ? "rgba(255, 23, 68, 0.26)" : "rgba(239, 83, 80, 0.26)",
      lineWidth: 2,
      lineType: LineType.WithSteps,
      lastValueVisible: true,
      priceLineVisible: false,
      crosshairMarkerVisible: true,
    });

    if (data.length) series.setData(data);

    requestAnimationFrame(() => {
      try {
        chart.timeScale().fitContent();
      } catch {
        /* ignore */
      }
    });

    function onDblClick() {
      try {
        chart.timeScale().fitContent();
        chart.priceScale("right").applyOptions({ autoScale: true });
      } catch {
        /* ignore */
      }
    }
    el.addEventListener("dblclick", onDblClick);

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => {
      el.removeEventListener("dblclick", onDblClick);
      ro.disconnect();
      chart.remove();
    };
  }, [points, chartSkinId]);

  const showTitle = typeof title === "string" && title.trim().length > 0;
  const showHint = typeof hint === "string" && hint.trim().length > 0;

  return (
    <div className="running-pnl-chart">
      {showTitle ? <div className="running-pnl-chart-title">{title}</div> : null}
      {showHint ? <p className="running-pnl-chart-hint">{hint}</p> : null}
      <div className="running-pnl-chart-host" ref={hostRef} role="img" aria-label={ariaLabel} />
    </div>
  );
}
