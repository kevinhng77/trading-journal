import { useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine } from "recharts";
import { useLiveTrades } from "../../hooks/useLiveTrades";
import { filterTradesForReport, reportFiltersActive, DEFAULT_REPORT_FILTERS } from "../../lib/reportFilters";
import { tradesInLastDays, aggregateByTag } from "../../lib/dashboardStats";
import { CHART_GREEN, CHART_RED } from "../../lib/chartPalette";
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

/** P&amp;L summed per tag (multi-tag trades contribute to each tag). */
export default function ReportsTagBreakdown() {
  const ctx = useOutletContext() ?? {};
  const applied = ctx.appliedReportFilters ?? DEFAULT_REPORT_FILTERS;
  const trades = useLiveTrades();
  const windowDays = 90;

  const filtered = useMemo(() => filterTradesForReport(trades, applied), [trades, applied]);
  const scoped = useMemo(() => tradesInLastDays(filtered, windowDays), [filtered]);
  const rows = useMemo(() => aggregateByTag(scoped), [scoped]);
  const filtersOn = reportFiltersActive(applied);

  return (
    <>
      <div className="reports-overview-toolbar">
        <p className="reports-filter-summary">
          <strong>Tag breakdown</strong> — net P&amp;L by tag over the last <strong>{windowDays}</strong> days (top tags
          by absolute P&amp;L).
          {filtersOn ? (
            <>
              {" "}
              Using <strong>{filtered.length}</strong> trades matching filters.
            </>
          ) : null}
        </p>
      </div>
      <div className="card reports-detailed-chart-card">
        <div className="panel-title reports-chart-title">Tags ({windowDays}d)</div>
        <div className="reports-detailed-chart-area" style={{ height: Math.max(220, rows.length * 36) }}>
          {rows.length === 0 ? (
            <div className="chart-empty">No tags in this window. Add tags on trades from the Trades page.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={rows} margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" width={120} tick={TICK} stroke="#475569" />
                <ReferenceLine x={0} stroke="#64748b" />
                <Tooltip content={<SimpleTip />} cursor={false} />
                <Bar dataKey="pnl" name="P&amp;L" radius={[0, 4, 4, 0]}>
                  {rows.map((e) => (
                    <Cell key={e.name} fill={e.pnl >= 0 ? CHART_GREEN : CHART_RED} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  );
}
