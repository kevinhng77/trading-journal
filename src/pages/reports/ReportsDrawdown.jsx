import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { useLiveTrades } from "../../hooks/useLiveTrades";
import { filterTradesForReport, reportFiltersActive, DEFAULT_REPORT_FILTERS } from "../../lib/reportFilters";
import { tradesInLastDays, buildDailySeriesForRange, buildDrawdownSeries } from "../../lib/dashboardStats";
import { CHART_RED, CHART_RED_FILL_SOFT } from "../../lib/chartPalette";

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
          <span>{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Underwater from peak cumulative P&amp;L (same idea as Tradervue drawdown). */
export default function ReportsDrawdown() {
  const ctx = useOutletContext() ?? {};
  const applied = ctx.appliedReportFilters ?? DEFAULT_REPORT_FILTERS;
  const trades = useLiveTrades();
  const [rangeDays, setRangeDays] = useState(30);

  const filtered = useMemo(() => filterTradesForReport(trades, applied), [trades, applied]);
  const scoped = useMemo(() => tradesInLastDays(filtered, rangeDays), [filtered, rangeDays]);
  const daily = useMemo(() => buildDailySeriesForRange(scoped, rangeDays), [scoped, rangeDays]);
  const dd = useMemo(() => buildDrawdownSeries(daily), [daily]);
  const filtersOn = reportFiltersActive(applied);

  return (
    <>
      <div className="reports-overview-toolbar">
        <p className="reports-filter-summary">
          <strong>Drawdown</strong> — cumulative P&amp;L peak minus current equity curve (negative = underwater from the
          high).
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
        <div className="panel-title reports-chart-title">Drawdown ({rangeDays} days)</div>
        <div className="reports-detailed-chart-area" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dd} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="shortLabel" tick={TICK} stroke="#475569" interval="preserveStartEnd" />
              <YAxis tick={TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} width={56} />
              <Tooltip content={<SimpleTip />} />
              <Area type="monotone" dataKey="drawdown" name="Drawdown $" stroke={CHART_RED} fill={CHART_RED_FILL_SOFT} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
