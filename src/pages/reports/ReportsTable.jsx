import { useCallback, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { groupTradesByDate, formatMoney, pnlClass } from "../../storage/storage";
import { useLiveTrades } from "../../hooks/useLiveTrades";
import { filterTradesForReport, DEFAULT_REPORT_FILTERS } from "../../lib/reportFilters";
import { formatMonthTitle, sumMonthPnl } from "../../lib/calendarGrid";
import { loadMonthlyBalanceTable, saveMonthlyBalanceTable, getMonthlyBalanceRow } from "../../storage/monthlyBalanceTable";

function parseYear(searchParams) {
  const y = Number(searchParams.get("year"));
  if (Number.isFinite(y) && y >= 1970 && y <= 2100) return y;
  return new Date().getFullYear();
}

function monthKey(year, monthIndex) {
  return `${year}-${monthIndex}`;
}

/** @param {number | null | undefined} start @param {number | null | undefined} end */
function pctFromBalances(start, end) {
  if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start === 0) return null;
  return ((end - start) / start) * 100;
}

/** @param {number | null | undefined} start @param {number} tradePnl */
function pctFromTradesOnStart(start, tradePnl) {
  if (start == null || !Number.isFinite(start) || start === 0) return null;
  return (tradePnl / start) * 100;
}

export default function ReportsTable() {
  const ctx = useOutletContext() ?? {};
  const applied = ctx.appliedReportFilters ?? DEFAULT_REPORT_FILTERS;
  const trades = useLiveTrades();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedYear = parseYear(searchParams);
  const [balanceTable, setBalanceTable] = useState(() => loadMonthlyBalanceTable());

  const calendarYear = new Date().getFullYear();
  const yearFromUrl = searchParams.get("year");
  const canResetYear = Boolean(yearFromUrl) || selectedYear !== calendarYear;
  const yearChoices = [selectedYear - 2, selectedYear - 1, selectedYear];

  function setYear(y) {
    setSearchParams({ year: String(y) });
  }

  function resetYearToCurrent() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("year");
      return next;
    });
  }

  const filtered = useMemo(() => filterTradesForReport(trades, applied), [trades, applied]);
  const grouped = useMemo(() => groupTradesByDate(filtered), [filtered]);

  const patchMonth = useCallback((key, partial) => {
    setBalanceTable((prev) => {
      const cur = getMonthlyBalanceRow(prev, key);
      const next = { ...prev, [key]: { ...cur, ...partial } };
      saveMonthlyBalanceTable(next);
      return next;
    });
  }, []);

  const rows = useMemo(() => {
    /** @type {Array<{ key: string, title: string, tradePnl: number, start: number | null, end: number | null, wireOut: number | null, balanceDelta: number | null, pctBalances: number | null, pctTrades: number | null }>} */
    const out = [];
    for (let m = 0; m < 12; m++) {
      const key = monthKey(selectedYear, m);
      const row = getMonthlyBalanceRow(balanceTable, key);
      const tradePnl = sumMonthPnl(grouped, selectedYear, m);
      const start = row.start ?? null;
      const end = row.end ?? null;
      const wireOut = row.wireOut ?? null;
      const balanceDelta =
        start != null && end != null && Number.isFinite(start) && Number.isFinite(end) ? end - start : null;
      const pctBalances = pctFromBalances(start, end);
      const pctTrades = pctFromTradesOnStart(start, tradePnl);
      out.push({
        key,
        title: formatMonthTitle(selectedYear, m),
        tradePnl,
        start,
        end,
        wireOut,
        balanceDelta,
        pctBalances,
        pctTrades,
      });
    }
    return out;
  }, [balanceTable, grouped, selectedYear]);

  const totals = useMemo(() => {
    let tradePnl = 0;
    let wire = 0;
    for (const r of rows) {
      tradePnl += r.tradePnl;
      if (r.wireOut != null && Number.isFinite(r.wireOut)) wire += r.wireOut;
    }
    return { tradePnl, wire };
  }, [rows]);

  return (
    <>
      <div className="reports-table-page-toolbar">
        <span className="reports-calendar-year-label">Year</span>
        <div className="reports-calendar-year-actions">
          <div className="reports-year-toggle">
            {yearChoices.map((y) => (
              <button
                key={y}
                type="button"
                className={`range-btn ${y === selectedYear ? "active" : ""}`}
                onClick={() => setYear(y)}
              >
                {y}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="range-btn reports-calendar-year-reset"
            onClick={resetYearToCurrent}
            disabled={!canResetYear}
            title="Clear year from URL and use the current year"
          >
            This year ({calendarYear})
          </button>
        </div>
      </div>

      <p className="reports-table-hint">
        Start, end, and wire-out are saved in this browser only. <strong>P&amp;L (trades)</strong> uses your imported
        trades and the same filters as the rest of Reports (the strip above).
      </p>

      <div className="card reports-table-card">
        <div className="reports-table-scroll">
          <table className="reports-table-main">
            <caption className="sr-only">Monthly balances and trade P&amp;L for {selectedYear}</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Start ($)</th>
                <th scope="col">End ($)</th>
                <th scope="col">P&amp;L (trades)</th>
                <th scope="col">Δ balances</th>
                <th scope="col">% (balances)</th>
                <th scope="col">% on start (trades)</th>
                <th scope="col">Wire out ($)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row" className="reports-table-month-cell">
                    {r.title}
                  </th>
                  <td>
                    <input
                      className="reports-table-num-input"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      placeholder="—"
                      aria-label={`${r.title} starting balance`}
                      value={r.start ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                          patchMonth(r.key, { start: null });
                          return;
                        }
                        const n = Number(v);
                        patchMonth(r.key, { start: Number.isFinite(n) ? n : null });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="reports-table-num-input"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      placeholder="—"
                      aria-label={`${r.title} ending balance`}
                      value={r.end ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                          patchMonth(r.key, { end: null });
                          return;
                        }
                        const n = Number(v);
                        patchMonth(r.key, { end: Number.isFinite(n) ? n : null });
                      }}
                    />
                  </td>
                  <td className={`reports-table-pnl ${pnlClass(r.tradePnl)}`}>{formatMoney(r.tradePnl)}</td>
                  <td className={r.balanceDelta == null ? "reports-table-muted" : pnlClass(r.balanceDelta)}>
                    {r.balanceDelta == null ? "—" : formatMoney(r.balanceDelta)}
                  </td>
                  <td className={r.pctBalances == null ? "reports-table-muted" : pnlClass(r.balanceDelta ?? 0)}>
                    {r.pctBalances == null ? "—" : `${r.pctBalances.toFixed(2)}%`}
                  </td>
                  <td className={r.pctTrades == null ? "reports-table-muted" : pnlClass(r.tradePnl)}>
                    {r.pctTrades == null ? "—" : `${r.pctTrades.toFixed(2)}%`}
                  </td>
                  <td>
                    <input
                      className="reports-table-num-input"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      placeholder="—"
                      aria-label={`${r.title} wire withdrawal`}
                      value={r.wireOut ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                          patchMonth(r.key, { wireOut: null });
                          return;
                        }
                        const n = Number(v);
                        patchMonth(r.key, { wireOut: Number.isFinite(n) ? n : null });
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="reports-table-foot-row">
                <th scope="row">Year total</th>
                <td colSpan={2} className="reports-table-muted">
                  —
                </td>
                <td className={pnlClass(totals.tradePnl)}>{formatMoney(totals.tradePnl)}</td>
                <td colSpan={3} className="reports-table-muted">
                  —
                </td>
                <td>{formatMoney(totals.wire)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
