import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useLiveTrades } from "../../hooks/useLiveTrades";
import ReportsFilterStrip from "../../components/ReportsFilterStrip";
import { filterTradesForReport, reportFiltersActive, DEFAULT_REPORT_FILTERS } from "../../lib/reportFilters";
import { computeDashboardStats, computeProfitFactor, sumTradePnl } from "../../lib/dashboardStats";
import { REPORTS_DURATION_OPTIONS } from "../../lib/tradeDuration";
import { formatMoney, pnlClass } from "../../storage/storage";
import { loadCompareGroupFilters, saveCompareGroupFilters } from "../../storage/compareFiltersPersist";

/** @param {number | null | undefined} m */
function fmtHoldMinutes(m) {
  if (m == null || Number.isNaN(Number(m))) return "—";
  const n = Number(m);
  if (n < 120) return `${Math.round(n)}m`;
  const h = Math.floor(n / 60);
  const r = Math.round(n % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** @param {number | null} pf */
function fmtProfitFactor(pf) {
  if (pf == null || !Number.isFinite(pf)) return "—";
  return pf.toFixed(2);
}

/** @param {import("../../lib/reportFilters").ReportFilters} f */
function filterSummary(f) {
  if (!reportFiltersActive(f)) return "All trades (no group filters)";
  const parts = [];
  if (String(f.symbol ?? "").trim()) parts.push(`Symbol contains “${String(f.symbol).trim()}”`);
  if (f.selectedTags?.length) parts.push(`${f.tagsMatchAll ? "All" : "Any"} tags: ${f.selectedTags.join(", ")}`);
  if (f.selectedSetups?.length) parts.push(`${f.setupsMatchAll ? "All" : "Any"} setups: ${f.selectedSetups.join(", ")}`);
  if (f.side === "long" || f.side === "short") parts.push(f.side === "long" ? "Long only" : "Short only");
  if (String(f.duration ?? "all") !== "all") parts.push(`Duration: ${f.duration}`);
  if (String(f.dateFrom ?? "").trim() || String(f.dateTo ?? "").trim()) {
    parts.push(`Dates ${f.dateFrom || "…"} → ${f.dateTo || "…"}`);
  }
  return parts.join(" · ");
}

/**
 * @param {object[]} trades
 * @returns {object}
 */
function cohortMetrics(trades) {
  const stats = computeDashboardStats(trades);
  const pf = computeProfitFactor(trades);
  return {
    count: stats.tradeCount,
    totalPnl: sumTradePnl(trades),
    winRate: stats.winRate,
    winCount: stats.winCount,
    lossCount: stats.lossCount,
    breakeven: stats.breakevenCount,
    avgWin: stats.avgWin,
    avgLoss: stats.avgLoss,
    maxWin: stats.maxWin,
    maxLoss: stats.maxLoss,
    profitFactor: pf,
    avgHoldWin: stats.avgHoldWin,
    avgHoldLoss: stats.avgHoldLoss,
    hasHold: stats.hasHoldData,
    avgMfe: stats.avgMfe,
    avgMae: stats.avgMae,
    hasMfeMae: stats.hasMfeMae,
  };
}

/** @param {number | null} a @param {number | null} b */
function pfDelta(a, b) {
  if (a == null && b == null) return null;
  if (a == null || b == null) return null;
  return b - a;
}

export default function ReportsCompare() {
  const ctx = useOutletContext() ?? {};
  const allTags = ctx.allTags ?? [];
  const allSetups = ctx.allSetups ?? [];
  const trades = useLiveTrades();

  const [groupA, setGroupA] = useState(() => loadCompareGroupFilters().a);
  const [groupB, setGroupB] = useState(() => loadCompareGroupFilters().b);

  useEffect(() => {
    saveCompareGroupFilters(groupA, groupB);
  }, [groupA, groupB]);

  const cohortA = useMemo(() => filterTradesForReport(trades, groupA), [trades, groupA]);
  const cohortB = useMemo(() => filterTradesForReport(trades, groupB), [trades, groupB]);

  const ma = useMemo(() => cohortMetrics(cohortA), [cohortA]);
  const mb = useMemo(() => cohortMetrics(cohortB), [cohortB]);

  const dPnl = mb.totalPnl - ma.totalPnl;
  const dCount = mb.count - ma.count;
  const dWinRate = mb.winRate - ma.winRate;

  return (
    <>
      <div className="reports-overview-toolbar reports-compare-toolbar">
        <p className="reports-filter-summary reports-compare-intro">
          <strong>Compare</strong> two cohorts side by side. Each group has its own symbol, tags, setups, side, duration, and
          date range. <span className="reports-compare-intro-note">This tab does not use the global Reports filter strip above</span>
          — set filters in each column below. Choices are saved on this device.
        </p>
      </div>

      <div className="reports-compare-groups">
        <section className="card reports-compare-group-panel" aria-labelledby="reports-compare-group-a-title">
          <div className="reports-compare-group-head">
            <h2 id="reports-compare-group-a-title" className="reports-compare-group-title">
              <span className="reports-compare-dot reports-compare-dot--a" aria-hidden />
              Group A
            </h2>
            <button
              type="button"
              className="reports-compare-reset-btn"
              onClick={() => setGroupA({ ...DEFAULT_REPORT_FILTERS })}
            >
              Reset group
            </button>
          </div>
          <p className="reports-compare-group-summary">{filterSummary(groupA)}</p>
          <ReportsFilterStrip
            draft={groupA}
            setDraft={setGroupA}
            onApply={() => {}}
            onClear={() => setGroupA({ ...DEFAULT_REPORT_FILTERS })}
            allTags={allTags}
            allSetups={allSetups}
            durationOptions={REPORTS_DURATION_OPTIONS}
            stripActions="none"
          />
        </section>

        <section className="card reports-compare-group-panel" aria-labelledby="reports-compare-group-b-title">
          <div className="reports-compare-group-head">
            <h2 id="reports-compare-group-b-title" className="reports-compare-group-title">
              <span className="reports-compare-dot reports-compare-dot--b" aria-hidden />
              Group B
            </h2>
            <button
              type="button"
              className="reports-compare-reset-btn"
              onClick={() => setGroupB({ ...DEFAULT_REPORT_FILTERS })}
            >
              Reset group
            </button>
          </div>
          <p className="reports-compare-group-summary">{filterSummary(groupB)}</p>
          <ReportsFilterStrip
            draft={groupB}
            setDraft={setGroupB}
            onApply={() => {}}
            onClear={() => setGroupB({ ...DEFAULT_REPORT_FILTERS })}
            allTags={allTags}
            allSetups={allSetups}
            durationOptions={REPORTS_DURATION_OPTIONS}
            stripActions="none"
          />
        </section>
      </div>

      <div className="card reports-compare-stats-card">
        <h3 className="reports-compare-stats-heading">Statistics</h3>
        <p className="reports-compare-stats-caption">
          <strong>Δ</strong> is Group B minus Group A (positive Δ on P&amp;L means B was higher).
        </p>
        <div className="reports-compare-table-wrap">
          <table className="reports-compare-stats-table">
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">
                  <span className="reports-compare-th-label">
                    <span className="reports-compare-dot reports-compare-dot--a" aria-hidden />
                    Group A
                  </span>
                </th>
                <th scope="col">
                  <span className="reports-compare-th-label">
                    <span className="reports-compare-dot reports-compare-dot--b" aria-hidden />
                    Group B
                  </span>
                </th>
                <th scope="col">Δ (B − A)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Trades</th>
                <td>{ma.count}</td>
                <td>{mb.count}</td>
                <td>{dCount === 0 ? "0" : dCount > 0 ? `+${dCount}` : String(dCount)}</td>
              </tr>
              <tr>
                <th scope="row">Net P&amp;L</th>
                <td className={pnlClass(ma.totalPnl)}>{formatMoney(ma.totalPnl)}</td>
                <td className={pnlClass(mb.totalPnl)}>{formatMoney(mb.totalPnl)}</td>
                <td className={pnlClass(dPnl)}>{dPnl === 0 ? formatMoney(0) : formatMoney(dPnl)}</td>
              </tr>
              <tr>
                <th scope="row">Win rate</th>
                <td>{ma.count ? `${ma.winRate.toFixed(1)}%` : "—"}</td>
                <td>{mb.count ? `${mb.winRate.toFixed(1)}%` : "—"}</td>
                <td>
                  {ma.count && mb.count
                    ? `${dWinRate >= 0 ? "+" : ""}${dWinRate.toFixed(1)} pp`
                    : "—"}
                </td>
              </tr>
              <tr>
                <th scope="row">Wins / losses</th>
                <td>
                  {ma.count ? `${ma.winCount} / ${ma.lossCount}` : "—"}
                  {ma.breakeven ? ` (${ma.breakeven} BE)` : ""}
                </td>
                <td>
                  {mb.count ? `${mb.winCount} / ${mb.lossCount}` : "—"}
                  {mb.breakeven ? ` (${mb.breakeven} BE)` : ""}
                </td>
                <td>
                  {ma.count || mb.count
                    ? `${mb.winCount - ma.winCount >= 0 ? "+" : ""}${mb.winCount - ma.winCount} / ${
                        mb.lossCount - ma.lossCount >= 0 ? "+" : ""
                      }${mb.lossCount - ma.lossCount}`
                    : "—"}
                </td>
              </tr>
              <tr>
                <th scope="row">Avg winning trade</th>
                <td>{ma.winCount ? formatMoney(ma.avgWin) : "—"}</td>
                <td>{mb.winCount ? formatMoney(mb.avgWin) : "—"}</td>
                <td className={pnlClass(mb.avgWin - ma.avgWin)}>
                  {ma.winCount && mb.winCount ? formatMoney(mb.avgWin - ma.avgWin) : "—"}
                </td>
              </tr>
              <tr>
                <th scope="row">Avg losing trade</th>
                <td>{ma.lossCount ? formatMoney(ma.avgLoss) : "—"}</td>
                <td>{mb.lossCount ? formatMoney(mb.avgLoss) : "—"}</td>
                <td className={pnlClass(mb.avgLoss - ma.avgLoss)}>
                  {ma.lossCount && mb.lossCount ? formatMoney(mb.avgLoss - ma.avgLoss) : "—"}
                </td>
              </tr>
              <tr>
                <th scope="row">Profit factor</th>
                <td>{fmtProfitFactor(ma.profitFactor)}</td>
                <td>{fmtProfitFactor(mb.profitFactor)}</td>
                <td>
                  {(() => {
                    const d = pfDelta(ma.profitFactor, mb.profitFactor);
                    return d == null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(2)}`;
                  })()}
                </td>
              </tr>
              <tr>
                <th scope="row">Largest win</th>
                <td>{ma.winCount ? formatMoney(ma.maxWin) : "—"}</td>
                <td>{mb.winCount ? formatMoney(mb.maxWin) : "—"}</td>
                <td className={pnlClass(mb.maxWin - ma.maxWin)}>
                  {ma.winCount && mb.winCount ? formatMoney(mb.maxWin - ma.maxWin) : "—"}
                </td>
              </tr>
              <tr>
                <th scope="row">Largest loss</th>
                <td>{ma.lossCount ? formatMoney(ma.maxLoss) : "—"}</td>
                <td>{mb.lossCount ? formatMoney(mb.maxLoss) : "—"}</td>
                <td className={pnlClass(mb.maxLoss - ma.maxLoss)}>
                  {ma.lossCount && mb.lossCount ? formatMoney(mb.maxLoss - ma.maxLoss) : "—"}
                </td>
              </tr>
              <tr>
                <th scope="row">Avg hold (winners)</th>
                <td>{ma.hasHold ? fmtHoldMinutes(ma.avgHoldWin) : "—"}</td>
                <td>{mb.hasHold ? fmtHoldMinutes(mb.avgHoldWin) : "—"}</td>
                <td>
                  {ma.hasHold && mb.hasHold && ma.avgHoldWin != null && mb.avgHoldWin != null
                    ? `${mb.avgHoldWin - ma.avgHoldWin >= 0 ? "+" : ""}${Math.round(mb.avgHoldWin - ma.avgHoldWin)}m`
                    : "—"}
                </td>
              </tr>
              <tr>
                <th scope="row">Avg hold (losers)</th>
                <td>{ma.hasHold ? fmtHoldMinutes(ma.avgHoldLoss) : "—"}</td>
                <td>{mb.hasHold ? fmtHoldMinutes(mb.avgHoldLoss) : "—"}</td>
                <td>
                  {ma.hasHold && mb.hasHold && ma.avgHoldLoss != null && mb.avgHoldLoss != null
                    ? `${mb.avgHoldLoss - ma.avgHoldLoss >= 0 ? "+" : ""}${Math.round(mb.avgHoldLoss - ma.avgHoldLoss)}m`
                    : "—"}
                </td>
              </tr>
              <tr>
                <th scope="row">Avg MFE</th>
                <td>{ma.hasMfeMae && ma.avgMfe != null ? formatMoney(ma.avgMfe) : "—"}</td>
                <td>{mb.hasMfeMae && mb.avgMfe != null ? formatMoney(mb.avgMfe) : "—"}</td>
                <td className={pnlClass((mb.avgMfe ?? 0) - (ma.avgMfe ?? 0))}>
                  {ma.hasMfeMae && mb.hasMfeMae && ma.avgMfe != null && mb.avgMfe != null
                    ? formatMoney(mb.avgMfe - ma.avgMfe)
                    : "—"}
                </td>
              </tr>
              <tr>
                <th scope="row">Avg MAE</th>
                <td>{ma.hasMfeMae && ma.avgMae != null ? formatMoney(ma.avgMae) : "—"}</td>
                <td>{mb.hasMfeMae && mb.avgMae != null ? formatMoney(mb.avgMae) : "—"}</td>
                <td className={pnlClass((mb.avgMae ?? 0) - (ma.avgMae ?? 0))}>
                  {ma.hasMfeMae && mb.hasMfeMae && ma.avgMae != null && mb.avgMae != null
                    ? formatMoney(mb.avgMae - ma.avgMae)
                    : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
