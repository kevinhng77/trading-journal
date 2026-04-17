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
import { tradesInLastDays, buildDailySeriesForRange } from "../../lib/dashboardStats";
import { CHART_GREEN, CHART_RED } from "../../lib/chartPalette";
import MetricHintIcon from "../../components/MetricHintIcon";
import { REPORTS_WINLOSS_CHART_HINT } from "../../lib/metricHints";
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

/** Calendar days where you finished green vs red (day-level net P&amp;L). */
export default function ReportsWinLossDays() {
  const ctx = useOutletContext() ?? {};
  const applied = ctx.appliedReportFilters ?? DEFAULT_REPORT_FILTERS;
  const trades = useLiveTrades();
  const [rangeDays, setRangeDays] = useState(30);

  const filtered = useMemo(() => filterTradesForReport(trades, applied), [trades, applied]);
  const scoped = useMemo(() => tradesInLastDays(filtered, rangeDays), [filtered, rangeDays]);
  const daily = useMemo(() => buildDailySeriesForRange(scoped, rangeDays), [scoped, rangeDays]);
  const filtersOn = reportFiltersActive(applied);

  const chartData = useMemo(
    () =>
      daily.map((row) => ({
        ...row,
        dayResult:
          row.tradeCount === 0 ? "flat" : row.pnl > 0 ? "win" : row.pnl < 0 ? "loss" : "flat",
      })),
    [daily],
  );

  return (
    <>
      <div className="reports-overview-toolbar">
        <p className="reports-filter-summary">
          <strong>Win vs loss days</strong> — each bar is one calendar day (net P&amp;L). Green = winning day, red = losing
          day, grey = no trades.
          {filtersOn ? (
            <>
              {" "}
              Using <strong>{filtered.length}</strong> trades matching filters.
            </>
          ) : null}
        </p>
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
      </div>
      <div className="card reports-detailed-chart-card">
        <div className="panel-title reports-chart-title">
          <span className="reports-chart-title-text">Daily outcome ({rangeDays} days)</span>
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
                    fill={e.dayResult === "win" ? CHART_GREEN : e.dayResult === "loss" ? CHART_RED : "rgba(148, 163, 184, 0.35)"}
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
