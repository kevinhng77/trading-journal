import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from "recharts";
import { useLiveTrades } from "../../hooks/useLiveTrades";
import { filterTradesForReport, reportFiltersActive, DEFAULT_REPORT_FILTERS } from "../../lib/reportFilters";
import {
  tradesInLastDays,
  buildDailySeriesForRange,
  buildDailySeriesForDateSpan,
  localISODate,
} from "../../lib/dashboardStats";
import { CHART_GREEN, CHART_RED } from "../../lib/chartPalette";
import MetricHintIcon from "../../components/MetricHintIcon";
import { REPORTS_WINLOSS_CHART_HINT, winLossDayStatHint } from "../../lib/metricHints";
import { formatMoney, pnlClass } from "../../storage/storage";

const GRID = "#2a3140";
const TICK = { fill: "#94a3b8", fontSize: 10 };

function SimpleTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      {label != null && <div className="chart-tooltip-label">{label}</div>}
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="chart-tooltip-row">
          <span>{p.name}</span>
          <span>{typeof p.value === "number" ? p.value : p.value}</span>
        </div>
      ))}
    </div>
  );
}

/** @param {{ label: string, value: string, valueClass?: string }} props */
function DayColStat({ label, value, valueClass }) {
  const hint = winLossDayStatHint(label);
  return (
    <div className="reports-winloss-days-stat">
      <div className="reports-winloss-days-stat-label reports-detailed-stat-label--with-hint">
        <span className="reports-detailed-stat-label-text">{label}</span>
        {hint ? <MetricHintIcon text={hint} /> : null}
      </div>
      <div className={`reports-winloss-days-stat-value ${valueClass ?? ""}`}>{value}</div>
    </div>
  );
}

/**
 * @param {Array<{ pnl: number, tradeCount: number, volume: number }>} rows
 * @returns {{ totalPnl: number, dayCount: number, totalTrades: number, totalVol: number, avgDailyPnl: number, avgDailyVol: number, avgPerShare: number, avgTradePnl: number }}
 */
function aggregateDayRows(rows) {
  const dayCount = rows.length;
  const totalPnl = rows.reduce((s, r) => s + Number(r.pnl || 0), 0);
  const totalTrades = rows.reduce((s, r) => s + Number(r.tradeCount || 0), 0);
  const totalVol = rows.reduce((s, r) => s + Number(r.volume || 0), 0);
  return {
    totalPnl,
    dayCount,
    totalTrades,
    totalVol,
    avgDailyPnl: dayCount ? totalPnl / dayCount : 0,
    avgDailyVol: dayCount ? totalVol / dayCount : 0,
    avgPerShare: totalVol > 0 ? totalPnl / totalVol : 0,
    avgTradePnl: totalTrades > 0 ? totalPnl / totalTrades : 0,
  };
}

/** Calendar days where you finished green vs red (day-level net P&amp;L), aligned with the report strip. */
export default function ReportsWinLossDays() {
  const ctx = useOutletContext() ?? {};
  const applied = ctx.appliedReportFilters ?? DEFAULT_REPORT_FILTERS;
  const trades = useLiveTrades();
  const [rangeDays, setRangeDays] = useState(30);

  const filtered = useMemo(() => filterTradesForReport(trades, applied), [trades, applied]);
  const filtersOn = reportFiltersActive(applied);
  const dateFrom = String(applied.dateFrom ?? "").trim();
  const dateTo = String(applied.dateTo ?? "").trim();
  const usesReportDateSpan = Boolean(dateFrom || dateTo);

  const daily = useMemo(() => {
    if (usesReportDateSpan) {
      const tradeDates = filtered.map((t) => t.date).filter(Boolean).sort();
      const minT = tradeDates[0] ?? null;
      const maxT = tradeDates.length ? tradeDates[tradeDates.length - 1] : null;
      const today = localISODate(new Date());

      let start = dateFrom || minT || maxT || today;
      let end = dateTo || maxT || minT || today;
      if (!filtered.length) {
        start = dateFrom || dateTo || today;
        end = dateTo || dateFrom || start;
      }
      if (start > end) {
        const t = start;
        start = end;
        end = t;
      }
      return buildDailySeriesForDateSpan(filtered, start, end);
    }
    const scoped = tradesInLastDays(filtered, rangeDays);
    return buildDailySeriesForRange(scoped, rangeDays);
  }, [filtered, usesReportDateSpan, dateFrom, dateTo, rangeDays]);

  const chartData = useMemo(
    () =>
      daily.map((row) => ({
        ...row,
        dayResult:
          row.tradeCount === 0 ? "flat" : row.pnl > 0 ? "win" : row.pnl < 0 ? "loss" : "flat",
      })),
    [daily],
  );

  const { winRows, lossRows, flatDayCount } = useMemo(() => {
    const winRows = [];
    const lossRows = [];
    let flatDayCount = 0;
    for (const r of daily) {
      if (!r.tradeCount) continue;
      if (r.pnl > 0) winRows.push(r);
      else if (r.pnl < 0) lossRows.push(r);
      else flatDayCount += 1;
    }
    return { winRows, lossRows, flatDayCount };
  }, [daily]);

  const winAgg = useMemo(() => aggregateDayRows(winRows), [winRows]);
  const lossAgg = useMemo(() => aggregateDayRows(lossRows), [lossRows]);

  const dateSpanLabel =
    daily.length > 0 ? `${daily[0].date} → ${daily[daily.length - 1].date}` : "";

  return (
    <>
      <div className="reports-overview-toolbar">
        <p className="reports-filter-summary">
          <strong>Win vs loss days</strong> — each bar is one calendar day (net P&amp;L). Green = winning day, red = losing
          day, grey = no trades.
          {usesReportDateSpan ? (
            <>
              {" "}
              Chart window follows your <strong>date from / date to</strong> filters
              {dateSpanLabel ? <> ({dateSpanLabel})</> : null}.
            </>
          ) : (
            <>
              {" "}
              Use <strong>30 / 60 / 90 Days</strong> or set explicit dates in the filter strip to change the window.
            </>
          )}
          {filtersOn && !usesReportDateSpan ? (
            <>
              {" "}
              Using <strong>{filtered.length}</strong> trades matching filters.
            </>
          ) : null}
          {filtersOn && usesReportDateSpan ? (
            <>
              {" "}
              <strong>{filtered.length}</strong> trades in range after filters.
            </>
          ) : null}
        </p>
        {!usesReportDateSpan ? (
          <div className="range-toggle">
            {[30, 60, 90].map((n) => (
              <button
                key={n}
                type="button"
                className={`range-btn ${rangeDays === n ? "active" : ""}`}
                onClick={() => setRangeDays(n)}
              >
                {n} Days
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card reports-winloss-days-compare">
        <div className="reports-winloss-days-legend" aria-hidden>
          <span className="reports-winloss-days-legend-item">
            <span className="reports-winloss-days-legend-swatch reports-winloss-days-legend-swatch--win" /> Winning days
          </span>
          <span className="reports-winloss-days-legend-item">
            <span className="reports-winloss-days-legend-swatch reports-winloss-days-legend-swatch--loss" /> Losing days
          </span>
        </div>
        {flatDayCount > 0 ? (
          <p className="reports-winloss-days-flat-note">
            {flatDayCount} breakeven day{flatDayCount === 1 ? "" : "s"} (net $0 with trades) are excluded from the
            columns below.
          </p>
        ) : null}
        <div className="reports-winloss-days-cols">
          <div className="reports-winloss-days-col reports-winloss-days-col--win">
            <h3 className="reports-winloss-days-col-head">Winning days</h3>
            <DayColStat label="Total gain/loss" value={formatMoney(winAgg.totalPnl)} valueClass={pnlClass(winAgg.totalPnl)} />
            <DayColStat
              label="Average daily gain/loss"
              value={formatMoney(winAgg.avgDailyPnl)}
              valueClass={pnlClass(winAgg.avgDailyPnl)}
            />
            <DayColStat label="Average daily volume" value={winAgg.dayCount ? winAgg.avgDailyVol.toFixed(0) : "—"} />
            <DayColStat
              label="Average per-share gain/loss"
              value={winAgg.totalVol > 0 ? `$${winAgg.avgPerShare.toFixed(4)}` : "—"}
            />
            <DayColStat
              label="Average trade gain/loss"
              value={winAgg.totalTrades ? formatMoney(winAgg.avgTradePnl) : "—"}
              valueClass={winAgg.totalTrades ? pnlClass(winAgg.avgTradePnl) : undefined}
            />
            <DayColStat label="Total number of trades" value={String(winAgg.totalTrades)} />
            <p className="reports-winloss-days-col-foot">
              {winAgg.dayCount} winning day{winAgg.dayCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="reports-winloss-days-col reports-winloss-days-col--loss">
            <h3 className="reports-winloss-days-col-head">Losing days</h3>
            <DayColStat
              label="Total gain/loss"
              value={formatMoney(lossAgg.totalPnl)}
              valueClass={pnlClass(lossAgg.totalPnl)}
            />
            <DayColStat
              label="Average daily gain/loss"
              value={formatMoney(lossAgg.avgDailyPnl)}
              valueClass={pnlClass(lossAgg.avgDailyPnl)}
            />
            <DayColStat label="Average daily volume" value={lossAgg.dayCount ? lossAgg.avgDailyVol.toFixed(0) : "—"} />
            <DayColStat
              label="Average per-share gain/loss"
              value={lossAgg.totalVol > 0 ? `$${lossAgg.avgPerShare.toFixed(4)}` : "—"}
            />
            <DayColStat
              label="Average trade gain/loss"
              value={lossAgg.totalTrades ? formatMoney(lossAgg.avgTradePnl) : "—"}
              valueClass={lossAgg.totalTrades ? pnlClass(lossAgg.avgTradePnl) : undefined}
            />
            <DayColStat label="Total number of trades" value={String(lossAgg.totalTrades)} />
            <p className="reports-winloss-days-col-foot">
              {lossAgg.dayCount} losing day{lossAgg.dayCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>

      <div className="card reports-detailed-chart-card">
        <div className="panel-title reports-chart-title">
          <span className="reports-chart-title-text">Daily outcome ({daily.length} days)</span>
          <MetricHintIcon text={REPORTS_WINLOSS_CHART_HINT} />
        </div>
        <div className="reports-detailed-chart-area" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="shortLabel" tick={TICK} stroke="#475569" interval="preserveStartEnd" />
              <YAxis tick={TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} width={52} />
              <ReferenceLine y={0} stroke="#64748b" />
              <Tooltip content={<SimpleTip />} cursor={false} />
              <Bar dataKey="pnl" name="Net P&amp;L" radius={[2, 2, 0, 0]}>
                {chartData.map((e) => (
                  <Cell
                    key={e.date}
                    fill={
                      e.dayResult === "win" ? CHART_GREEN : e.dayResult === "loss" ? CHART_RED : "rgba(148, 163, 184, 0.35)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
