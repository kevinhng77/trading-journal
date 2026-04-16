import { useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { useLiveTrades } from "../../hooks/useLiveTrades";
import { filterTradesForReport, reportFiltersActive, DEFAULT_REPORT_FILTERS } from "../../lib/reportFilters";
import { tradesInLastDays, sumTradePnl, computeDashboardStats } from "../../lib/dashboardStats";
import { formatMoney, pnlClass } from "../../storage/storage";

function windowMetrics(trades) {
  const stats = computeDashboardStats(trades);
  return {
    count: stats.tradeCount,
    pnl: sumTradePnl(trades),
    winRate: stats.winRate,
  };
}

/** Compare the most recent window vs the prior window of the same length. */
export default function ReportsCompare() {
  const ctx = useOutletContext() ?? {};
  const applied = ctx.appliedReportFilters ?? DEFAULT_REPORT_FILTERS;
  const trades = useLiveTrades();
  const windowDays = 30;

  const filtered = useMemo(() => filterTradesForReport(trades, applied), [trades, applied]);
  const recent = useMemo(() => tradesInLastDays(filtered, windowDays), [filtered]);
  const prior = useMemo(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - windowDays);
    const start = new Date(end);
    start.setDate(start.getDate() - (windowDays - 1));
    return filtered.filter((t) => {
      if (!t.date) return false;
      const td = new Date(`${t.date}T12:00:00`);
      return td >= start && td <= end;
    });
  }, [filtered]);

  const a = useMemo(() => windowMetrics(recent), [recent]);
  const b = useMemo(() => windowMetrics(prior), [prior]);
  const filtersOn = reportFiltersActive(applied);

  return (
    <>
      <div className="reports-overview-toolbar">
        <p className="reports-filter-summary">
          <strong>Compare</strong> — last <strong>{windowDays}</strong> calendar days vs the previous{" "}
          <strong>{windowDays}</strong> days (same filters).
          {filtersOn ? (
            <>
              {" "}
              Universe: <strong>{filtered.length}</strong> trades.
            </>
          ) : null}
        </p>
      </div>
      <div className="reports-compare-grid">
        <div className="card reports-compare-card">
          <h3 className="reports-compare-title">Recent {windowDays}d</h3>
          <dl className="reports-compare-dl">
            <div>
              <dt>Trades</dt>
              <dd>{a.count}</dd>
            </div>
            <div>
              <dt>Net P&amp;L</dt>
              <dd className={pnlClass(a.pnl)}>{formatMoney(a.pnl)}</dd>
            </div>
            <div>
              <dt>Win rate</dt>
              <dd>{a.count ? `${a.winRate.toFixed(1)}%` : "—"}</dd>
            </div>
          </dl>
        </div>
        <div className="card reports-compare-card">
          <h3 className="reports-compare-title">Prior {windowDays}d</h3>
          <dl className="reports-compare-dl">
            <div>
              <dt>Trades</dt>
              <dd>{b.count}</dd>
            </div>
            <div>
              <dt>Net P&amp;L</dt>
              <dd className={pnlClass(b.pnl)}>{formatMoney(b.pnl)}</dd>
            </div>
            <div>
              <dt>Win rate</dt>
              <dd>{b.count ? `${b.winRate.toFixed(1)}%` : "—"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </>
  );
}
