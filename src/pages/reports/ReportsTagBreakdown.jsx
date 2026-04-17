import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine } from "recharts";
import { useLiveTrades } from "../../hooks/useLiveTrades";
import { filterTradesForReport, reportFiltersActive, DEFAULT_REPORT_FILTERS } from "../../lib/reportFilters";
import { tradesInLastDays, aggregateByTag, aggregateBySetup } from "../../lib/dashboardStats";
import { CHART_GREEN, CHART_RED } from "../../lib/chartPalette";
import { formatMoney } from "../../storage/storage";

const GRID = "#2a3140";
const TICK = { fill: "#94a3b8", fontSize: 10 };

const MODE_STORAGE_KEY = "tradingJournalTagBreakdownMode";

/** @returns {"tags" | "setups"} */
function loadBreakdownMode() {
  try {
    const v = localStorage.getItem(MODE_STORAGE_KEY);
    if (v === "setups") return "setups";
  } catch {
    /* ignore */
  }
  return "tags";
}

function BreakdownTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const name = row?.name ?? payload[0]?.name;
  const pnl = typeof row?.pnl === "number" ? row.pnl : Number(payload[0]?.value) || 0;
  const trades = typeof row?.trades === "number" ? row.trades : null;
  return (
    <div className="chart-tooltip">
      {name != null && <div className="chart-tooltip-label">{name}</div>}
      <div className="chart-tooltip-row">
        <span>Net P&amp;L</span>
        <span>{formatMoney(pnl)}</span>
      </div>
      {trades != null ? (
        <div className="chart-tooltip-row">
          <span>Trades</span>
          <span>{trades}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Net P&amp;L by tag or setup (multi-label trades contribute to each label). */
export default function ReportsTagBreakdown() {
  const ctx = useOutletContext() ?? {};
  const applied = ctx.appliedReportFilters ?? DEFAULT_REPORT_FILTERS;
  const trades = useLiveTrades();
  const windowDays = 90;

  const [mode, setMode] = useState(loadBreakdownMode);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  const filtered = useMemo(() => filterTradesForReport(trades, applied), [trades, applied]);
  const scoped = useMemo(() => tradesInLastDays(filtered, windowDays), [filtered]);
  const rows = useMemo(
    () => (mode === "tags" ? aggregateByTag(scoped) : aggregateBySetup(scoped)),
    [scoped, mode],
  );
  const filtersOn = reportFiltersActive(applied);

  const isTags = mode === "tags";
  const noun = isTags ? "tag" : "setup";
  const nounPlural = isTags ? "tags" : "setups";

  return (
    <>
      <div className="reports-overview-toolbar reports-tag-breakdown-toolbar">
        <p className="reports-filter-summary">
          <strong>Tag breakdown</strong> — net P&amp;L by <strong>{noun}</strong> over the last{" "}
          <strong>{windowDays}</strong> days (top {nounPlural} by absolute P&amp;L). Use{" "}
          <strong>Setups</strong> to compare playbook-style setups the same way.
          {filtersOn ? (
            <>
              {" "}
              Using <strong>{filtered.length}</strong> trades matching the Reports filters above.
            </>
          ) : null}
        </p>
      </div>

      <div className="card reports-detailed-chart-card">
        <div className="reports-tag-breakdown-card-head">
          <div className="panel-title reports-chart-title">{isTags ? "Tags" : "Setups"} ({windowDays}d)</div>
          <div className="reports-view-toggle reports-tag-breakdown-toggle" role="group" aria-label="Breakdown by">
            <button
              type="button"
              className={`reports-view-btn ${isTags ? "active" : ""}`}
              aria-pressed={isTags}
              onClick={() => setMode("tags")}
            >
              Tags
            </button>
            <button
              type="button"
              className={`reports-view-btn ${!isTags ? "active" : ""}`}
              aria-pressed={!isTags}
              onClick={() => setMode("setups")}
            >
              Setups
            </button>
          </div>
        </div>
        <div className="reports-detailed-chart-area" style={{ height: Math.max(220, rows.length * 36) }}>
          {rows.length === 0 ? (
            <div className="chart-empty">
              {isTags
                ? "No tags in this window. Add tags on trades from the Trades page."
                : "No setups in this window. Add setups on trades from the Trades page."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={rows} margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" width={120} tick={TICK} stroke="#475569" />
                <ReferenceLine x={0} stroke="#64748b" />
                <Tooltip content={<BreakdownTip />} cursor={false} />
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
