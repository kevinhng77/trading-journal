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
      lineWidth: 2,
    },
    das: {
      topFill1: "rgba(0, 230, 118, 0.32)",
      topFill2: "rgba(0, 230, 118, 0.05)",
      bottomFill1: "rgba(255, 82, 82, 0.3)",
      bottomFill2: "rgba(255, 82, 82, 0.05)",
      topLine: "#69f0ae",
      bottomLine: "#ff8a80",
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
      lineWidth: 2,
    },
    das: {
      topFill1: "rgba(0, 200, 83, 0.4)",
      topFill2: "rgba(0, 200, 83, 0.08)",
      bottomFill1: "rgba(255, 23, 68, 0.36)",
      bottomFill2: "rgba(255, 23, 68, 0.08)",
      topLine: "#b9f6ca",
      bottomLine: "#ff8a80",
      lineWidth: 2,
    },
  },
};

/**
 * @param {{ time: number, value: number }[]} sortedAsc
 * @param {number} tSec
 */
function nearestPointByTime(sortedAsc, tSec) {
  if (!sortedAsc.length) return null;
  let best = sortedAsc[0];
  let bestAbs = Math.abs(best.time - tSec);
  for (let i = 1; i < sortedAsc.length; i++) {
    const p = sortedAsc[i];
    const d = Math.abs(p.time - tSec);
    if (d < bestAbs) {
      bestAbs = d;
      best = p;
    }
  }
  return best;
}

/**
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
 * Stepped running P&amp;L vs zero. No zoom/pan; hover shows a diamond on the nearest step (LWC has no diamond marker shape).
 *
 * @param {{ time: number, value: number }[]} points
 * @param {'tos'|'das'} chartSkinId
 * @param {'trade'|'day'} [variant]
 * @param {string} [ariaLabel]
 */
export default function RunningPnlChart({
  points = [],
  chartSkinId = "tos",
  variant = "trade",
  ariaLabel = "Running P and L chart",
}) {
  const chartMountRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const hoverDiamondRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    const el = chartMountRef.current;
    if (!el) return;
    const skin = chartSkinColors(chartSkinId);
    const pal = RUN_PNL_PALETTE[variant === "day" ? "day" : "trade"][chartSkinId === "das" ? "das" : "tos"];
    const data = (points ?? [])
      .filter((p) => p && typeof p.time === "number" && Number.isFinite(p.value))
      .map((p) => ({ time: p.time, value: p.value }))
      .sort((a, b) => a.time - b.time);

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
      handleScale: false,
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
      crosshairMarkerVisible: false,
    });

    if (data.length) series.setData(data);

    /** @param {any} param */
    function onCrosshairMove(param) {
      const diamond = hoverDiamondRef.current;
      if (!diamond || !data.length) return;
      if (!param?.point || param.time == null || typeof param.time !== "number") {
        diamond.style.display = "none";
        return;
      }
      const nearest = nearestPointByTime(data, param.time);
      if (!nearest) {
        diamond.style.display = "none";
        return;
      }
      const x = chart.timeScale().timeToCoordinate(nearest.time);
      const y = series.priceToCoordinate(nearest.value);
      if (x == null || y == null) {
        diamond.style.display = "none";
        return;
      }
      diamond.style.display = "block";
      diamond.style.left = `${x}px`;
      diamond.style.top = `${y}px`;
    }

    chart.subscribeCrosshairMove(onCrosshairMove);

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
        chart.unsubscribeCrosshairMove(onCrosshairMove);
      } catch {
        /* ignore */
      }
      chart.remove();
    };
  }, [points, chartSkinId, variant]);

  return (
    <div className="running-pnl-chart" data-chart-skin={chartSkinId}>
      <div className="running-pnl-chart-body" role="img" aria-label={ariaLabel}>
        <div ref={chartMountRef} className="running-pnl-chart-lwc-mount" />
        <div ref={hoverDiamondRef} className="running-pnl-chart-hover-diamond" aria-hidden="true" />
      </div>
    </div>
  );
}
