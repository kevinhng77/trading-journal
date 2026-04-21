import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { formatInTimeZone } from "date-fns-tz";
import { parseISO, isValid as isValidDate } from "date-fns";
import { chartHistoryQuery, fetchBarsWithFeedFallback } from "../api/alpacaBars";
import { chartIntervalToAlpacaTimeframe } from "../lib/chartIntervals";
import { DEFAULT_CHART_INDICATOR_PREFS, DEFAULT_ROUND_TRIP_SHADING } from "../storage/chartIndicatorPrefs";

const TradeExecutionChart = lazy(() => import("../components/TradeExecutionChart.jsx"));

const NY = "America/New_York";
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_DEMO_DATE = "2025-07-24";

/**
 * Demo BOT/SOLD markers through the RTH window (times are NY wall clock on `isoDate`).
 * @param {string} isoDate
 * @param {number} anchorPrice
 */
function buildDemoFills(isoDate, anchorPrice) {
  const out = [];
  if (!ISO_DAY.test(isoDate) || !Number.isFinite(anchorPrice) || anchorPrice <= 0) return out;
  const startMin = 9 * 60 + 34;
  const endMin = 15 * 60 + 58;
  let i = 0;
  for (let m = startMin; m <= endMin; m += 3) {
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    const time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
    const side = i % 2 === 0 ? "BOT" : "SOLD";
    const qty = [50, 100, 100, 200][i % 4];
    const wobble = 1 + Math.sin(i * 0.31) * 0.018 + (i % 11) * 0.00025;
    const price = Math.round(anchorPrice * wobble * 100) / 100;
    out.push({
      id: `das-demo-${isoDate}-${m}-${i}`,
      date: isoDate,
      time,
      side,
      quantity: qty,
      price,
      description: `${side} ${qty} @${price}`,
    });
    i += 1;
  }
  return out;
}

function noop() {}

export default function DasChartDemo() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawDate = String(searchParams.get("date") ?? "").trim().slice(0, 10);
  const tradeDate =
    ISO_DAY.test(rawDate) && isValidDate(parseISO(rawDate)) ? rawDate : DEFAULT_DEMO_DATE;
  const rawSym = String(searchParams.get("symbol") ?? "TSLA")
    .trim()
    .toUpperCase()
    .slice(0, 5);
  const symbol = /^[A-Z]{1,5}$/.test(rawSym) ? rawSym : "TSLA";

  const [chartInterval, setChartInterval] = useState("1");
  const [chartGridVisible, setChartGridVisible] = useState(true);
  const [fillAnchor, setFillAnchor] = useState(250);
  const [riskLines, setRiskLines] = useState(/** @type {{ id: string, t1: number, t2: number, price: number }[]} */ ([]));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { start, end, maxTotalBars } = chartHistoryQuery(tradeDate, "1", {});
        const timeframe = chartIntervalToAlpacaTimeframe("1");
        const { bars } = await fetchBarsWithFeedFallback({
          symbol,
          timeframe,
          start,
          end,
          maxTotalBars,
          tradeIsoDate: tradeDate,
          chartInterval: "1",
        });
        if (cancelled || !bars?.length) {
          setRiskLines([]);
          setFillAnchor(250);
          return;
        }
        const nyDay = (ms) => formatInTimeZone(new Date(ms), NY, "yyyy-MM-dd");
        const dayBars = bars.filter((b) => nyDay(b.t) === tradeDate).sort((a, b) => a.t - b.t);
        if (dayBars.length < 3) {
          setRiskLines([]);
          setFillAnchor(250);
          return;
        }
        const t1 = Math.floor(dayBars[0].t / 1000);
        const t2 = Math.floor(dayBars[dayBars.length - 1].t / 1000);
        const prevDayBars = bars.filter((b) => nyDay(b.t) < tradeDate).sort((a, b) => a.t - b.t);
        const prevClose = prevDayBars.length ? Number(prevDayBars[prevDayBars.length - 1].c) : Number(dayBars[0].o);
        const anchor = Number.isFinite(prevClose) && prevClose > 0 ? prevClose : Number(dayBars[0].o);
        setFillAnchor(Number.isFinite(anchor) && anchor > 0 ? anchor : 250);
        setRiskLines([{ id: "das-yref", t1, t2, price: anchor }]);
      } catch {
        if (!cancelled) {
          setRiskLines([]);
          setFillAnchor(250);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, tradeDate]);

  const fills = useMemo(() => buildDemoFills(tradeDate, fillAnchor), [tradeDate, fillAnchor]);

  const indicatorPrefs = useMemo(
    () => ({
      ...DEFAULT_CHART_INDICATOR_PREFS,
      emaLines: DEFAULT_CHART_INDICATOR_PREFS.emaLines.map((e) => ({ ...e, enabled: false })),
      roundTripShading: { ...DEFAULT_ROUND_TRIP_SHADING, enabled: false },
      markers: {
        ...DEFAULT_CHART_INDICATOR_PREFS.markers,
        buy: "#00e676",
        sell: "#ff1744",
        shape: "triangle",
        sizingMode: "size",
        size: 11,
        enabled: true,
      },
    }),
    [],
  );

  const popOut = useCallback(() => {
    const q = new URLSearchParams({ date: tradeDate, symbol });
    const url = new URL(`#/chart-das?${q.toString()}`, window.location.href).href;
    window.open(url, "dasChartDemo", "popup=yes,width=1320,height=860,noopener");
  }, [symbol, tradeDate]);

  return (
    <div className="das-chart-demo">
      <header className="das-chart-demo-header">
        <div className="das-chart-demo-header-titles">
          <span className="das-chart-demo-hlabel">Price (Candle)</span>
          <span className="das-chart-demo-sep">·</span>
          <span className="das-chart-demo-hlabel">Volume (BAR)</span>
          <span className="das-chart-demo-sep">·</span>
          <span className="das-chart-demo-datepill">{tradeDate}</span>
        </div>
        <div className="das-chart-demo-header-actions">
          <strong className="das-chart-demo-symbol">{symbol}</strong>
          <label className="das-chart-demo-field">
            <span className="das-chart-demo-field-lbl">Date</span>
            <input
              type="date"
              className="das-chart-demo-date-input"
              value={tradeDate}
              onChange={(e) => {
                const v = e.target.value;
                if (!ISO_DAY.test(v)) return;
                setSearchParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    next.set("date", v);
                    next.set("symbol", symbol);
                    return next;
                  },
                  { replace: true },
                );
              }}
            />
          </label>
          <label className="das-chart-demo-field">
            <span className="das-chart-demo-field-lbl">Sym</span>
            <input
              className="das-chart-demo-sym-input"
              maxLength={5}
              value={symbol}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
                setSearchParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    next.set("symbol", v || "TSLA");
                    next.set("date", tradeDate);
                    return next;
                  },
                  { replace: true },
                );
              }}
            />
          </label>
          <button type="button" className="das-chart-demo-btn" onClick={popOut}>
            Pop out
          </button>
          <Link to="/" className="das-chart-demo-link">
            ← App
          </Link>
        </div>
      </header>
      <p className="das-chart-demo-note">
        DAS-style skin (black pane, green axes, blue volume, triangle executions). Live candles need your chart
        proxy (same as trade charts). Query: <code className="das-chart-demo-code">#/chart-das?date=YYYY-MM-DD&amp;symbol=TSLA</code>
      </p>
      <div className="das-chart-demo-chart-shell">
        <Suspense
          fallback={<div className="das-chart-demo-loading">Loading chart…</div>}
        >
          <TradeExecutionChart
            symbol={symbol}
            tradeDate={tradeDate}
            fills={fills}
            chartInterval={chartInterval}
            onChartIntervalChange={setChartInterval}
            fillTimeZone={NY}
            indicatorPrefs={indicatorPrefs}
            onPatchEma={noop}
            onPatchVwap={noop}
            onPatchMarkers={noop}
            onPatchRoundTripShading={noop}
            onRemoveEmaLine={noop}
            riskLines={riskLines}
            chartSkinId="das"
            dasLastPriceLabel
            chartGridVisible={chartGridVisible}
            onToggleChartGrid={() => setChartGridVisible((g) => !g)}
          />
        </Suspense>
      </div>
    </div>
  );
}
