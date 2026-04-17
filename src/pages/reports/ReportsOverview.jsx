import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useLiveTrades } from "../../hooks/useLiveTrades";
import { filterTradesForReport, reportFiltersActive, DEFAULT_REPORT_FILTERS } from "../../lib/reportFilters";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { groupTradesByDate } from "../../storage/storage";
import { tradesInLastDays, buildDailySeriesForRange } from "../../lib/dashboardStats";

import { CHART_GREEN, CHART_RED } from "../../lib/chartPalette";
import MetricHintIcon from "../../components/MetricHintIcon";
import { REPORTS_OVERVIEW_CHART_HINTS } from "../../lib/metricHints";
const GRID_STROKE = "#2a3140";
const AXIS_TICK = { fill: "#94a3b8", fontSize: 11 };

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      {label != null && <div className="chart-tooltip-label">{label}</div>}
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="chart-tooltip-row">
          <span>{p.name}</span>
          <span>{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

function ChartEmpty({ children }) {
  return <div className="chart-empty">{children}</div>;
}

export default function ReportsOverview() {
  const ctx = useOutletContext() ?? {};
  const applied = ctx.appliedReportFilters ?? DEFAULT_REPORT_FILTERS;
  const trades = useLiveTrades();
  const [rangeDays, setRangeDays] = useState(30);

  const filtered = useMemo(() => filterTradesForReport(trades, applied), [trades, applied]);
  const tradesScoped = tradesInLastDays(filtered, rangeDays);
  const grouped = groupTradesByDate(tradesScoped);
  const filtersOn = reportFiltersActive(applied);
  const dailySeries = buildDailySeriesForRange(tradesScoped, rangeDays);

  const winPctSeries = dailySeries.map((row) => {
    const g = grouped[row.date];
    if (!g?.rows?.length) {
      return { ...row, winPct: 0, hasTrades: false };
    }
    const wins = g.rows.filter((t) => Number(t.pnl) > 0).length;
    return {
      ...row,
      winPct: (wins / g.rows.length) * 100,
      hasTrades: true,
    };
  });

  return (
    <>
      <div className="reports-overview-toolbar">
        <p className="reports-filter-summary">
          <strong>{tradesScoped.length}</strong> trades in last {rangeDays} days
          {filtersOn ? (
            <>
              {" "}
              (from <strong>{filtered.length}</strong> matching filters)
            </>
          ) : null}
          . Click ✓ on filters above if you changed them.
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

      <div className="reports-chart-grid">
        <div className="card reports-chart-card">
          <div className="panel-title reports-chart-title">
            <span className="reports-chart-title-text">Gross daily P&amp;L ({rangeDays} days)</span>
            <MetricHintIcon text={REPORTS_OVERVIEW_CHART_HINTS.grossDaily} />
          </div>
          <div className="chart-area reports-chart-area">
            {tradesScoped.length === 0 ? (
              <ChartEmpty>No trades in this range.</ChartEmpty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailySeries} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="shortLabel" tick={AXIS_TICK} stroke="#475569" />
                  <YAxis tick={AXIS_TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} width={52} />
                  <ReferenceLine y={0} stroke="#64748b" />
                  <Tooltip content={<DarkTooltip />} cursor={false} />
                  <Bar dataKey="pnl" name="P&L" radius={[4, 4, 0, 0]} cursor={false}>
                    {dailySeries.map((e) => (
                      <Cell key={e.date} fill={e.pnl >= 0 ? CHART_GREEN : CHART_RED} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card reports-chart-card">
          <div className="panel-title reports-chart-title">
            <span className="reports-chart-title-text">Gross cumulative P&amp;L ({rangeDays} days)</span>
            <MetricHintIcon text={REPORTS_OVERVIEW_CHART_HINTS.grossCumulative} />
          </div>
          <div className="chart-area reports-chart-area">
            {tradesScoped.length === 0 ? (
              <ChartEmpty>No trades in this range.</ChartEmpty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailySeries} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="shortLabel" tick={AXIS_TICK} stroke="#475569" />
                  <YAxis tick={AXIS_TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} width={52} />
                  <ReferenceLine y={0} stroke="#64748b" />
                  <Tooltip content={<DarkTooltip />} cursor={false} />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    name="Cumulative P&L"
                    stroke={CHART_GREEN}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card reports-chart-card">
          <div className="panel-title reports-chart-title">
            <span className="reports-chart-title-text">Daily volume ({rangeDays} days)</span>
            <MetricHintIcon text={REPORTS_OVERVIEW_CHART_HINTS.dailyVolume} />
          </div>
          <div className="chart-area reports-chart-area">
            {tradesScoped.length === 0 ? (
              <ChartEmpty>No trades in this range.</ChartEmpty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailySeries} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="shortLabel" tick={AXIS_TICK} stroke="#475569" />
                  <YAxis tick={AXIS_TICK} stroke="#475569" width={44} />
                  <Tooltip content={<DarkTooltip />} cursor={false} />
                  <Bar dataKey="volume" name="Volume" fill={CHART_GREEN} radius={[4, 4, 0, 0]} cursor={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card reports-chart-card">
          <div className="panel-title reports-chart-title">
            <span className="reports-chart-title-text">Win % ({rangeDays} days)</span>
            <MetricHintIcon text={REPORTS_OVERVIEW_CHART_HINTS.winPct} />
          </div>
          <div className="chart-area reports-chart-area">
            {tradesScoped.length === 0 ? (
              <ChartEmpty>No trades in this range.</ChartEmpty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={winPctSeries} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="shortLabel" tick={AXIS_TICK} stroke="#475569" />
                  <YAxis domain={[0, 100]} tick={AXIS_TICK} stroke="#475569" tickFormatter={(v) => `${v}%`} width={44} />
                  <Tooltip
                    cursor={false}
                    content={({ active, payload, label }) =>
                      active && payload?.[0] ? (
                        <div className="chart-tooltip">
                          <div className="chart-tooltip-label">{label}</div>
                          <div className="chart-tooltip-row">
                            <span>Win %</span>
                            <span>
                              {payload[0].payload.hasTrades
                                ? `${Number(payload[0].value).toFixed(1)}%`
                                : "—"}
                            </span>
                          </div>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="winPct" name="Win %" radius={[4, 4, 0, 0]} maxBarSize={32} cursor={false}>
                    {winPctSeries.map((e) => (
                      <Cell
                        key={e.date}
                        fill={!e.hasTrades ? "#334155" : e.winPct >= 50 ? CHART_GREEN : CHART_RED}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
