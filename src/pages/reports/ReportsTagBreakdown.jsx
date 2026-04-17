import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useLiveTrades } from "../../hooks/useLiveTrades";
import { filterTradesForReport, reportFiltersActive, DEFAULT_REPORT_FILTERS } from "../../lib/reportFilters";
import {
  tradesInLastDays,
  buildTagPnLVolumeRows,
  buildSetupPnLVolumeRows,
  buildTagCombinationRows,
  buildSetupCombinationRows,
  buildTagDetailedRows,
  buildSetupDetailedRows,
} from "../../lib/dashboardStats";
import { formatMoney, pnlClass } from "../../storage/storage";
import MetricHintIcon from "../../components/MetricHintIcon";
import { REPORTS_TAG_BREAKDOWN_CHART_HINT, REPORTS_TAG_BREAKDOWN_MODE_HINT } from "../../lib/metricHints";

const MODE_STORAGE_KEY = "tradingJournalTagBreakdownMode";
const VIEW_STORAGE_KEY = "tradingJournalTagBreakdownView";

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

/** @returns {"list" | "combinations" | "detailed"} */
function loadBreakdownView() {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    if (v === "combinations" || v === "detailed") return v;
  } catch {
    /* ignore */
  }
  return "list";
}

function fmtProfitFactor(v) {
  if (v == null) return "—";
  if (!Number.isFinite(v)) return "∞";
  return v.toFixed(2);
}

/** @param {{ pnl: number, maxAbs: number }} props */
function PnlBarCell({ pnl, maxAbs }) {
  const pct = maxAbs > 0 ? Math.min(100, (Math.abs(pnl) / maxAbs) * 100) : 0;
  const pos = pnl >= 0;
  return (
    <div className="reports-tag-bd-bar-cell" aria-hidden>
      <div className="reports-tag-bd-bar-track">
        <div className={`reports-tag-bd-bar-fill ${pos ? "is-pos" : "is-neg"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** @param {{ label: string, sortKey: string, activeKey: string, dir: string, onSort: (k: string) => void }} props */
function SortTh({ label, sortKey, activeKey, dir, onSort }) {
  const active = activeKey === sortKey;
  return (
    <th scope="col">
      <button type="button" className={`reports-tag-bd-sort-btn${active ? " is-active" : ""}`} onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        <span className="reports-tag-bd-sort-glyph" aria-hidden>
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

/** Net P&amp;L by tag or setup (multi-label trades contribute to each label). */
export default function ReportsTagBreakdown() {
  const ctx = useOutletContext() ?? {};
  const applied = ctx.appliedReportFilters ?? DEFAULT_REPORT_FILTERS;
  const trades = useLiveTrades();
  const windowDays = 90;
  const dateFrom = String(applied.dateFrom ?? "").trim();
  const dateTo = String(applied.dateTo ?? "").trim();
  const usesReportDateSpan = Boolean(dateFrom || dateTo);

  const [mode, setMode] = useState(loadBreakdownMode);
  const [view, setView] = useState(loadBreakdownView);
  const [sortKey, setSortKey] = useState("pnl");
  const [sortDir, setSortDir] = useState(/** @type {"asc"|"desc"} */ ("desc"));

  useEffect(() => {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  const filtered = useMemo(() => filterTradesForReport(trades, applied), [trades, applied]);
  const scoped = useMemo(() => {
    if (usesReportDateSpan) return filtered;
    return tradesInLastDays(filtered, windowDays);
  }, [filtered, usesReportDateSpan, windowDays]);

  const isTags = mode === "tags";
  const noun = isTags ? "tag" : "setup";
  const nounPlural = isTags ? "tags" : "setups";

  const listRows = useMemo(
    () => (isTags ? buildTagPnLVolumeRows(scoped) : buildSetupPnLVolumeRows(scoped)),
    [scoped, isTags],
  );
  const comboRows = useMemo(
    () => (isTags ? buildTagCombinationRows(scoped) : buildSetupCombinationRows(scoped)),
    [scoped, isTags],
  );
  const detailedRowsRaw = useMemo(
    () => (isTags ? buildTagDetailedRows(scoped) : buildSetupDetailedRows(scoped)),
    [scoped, isTags],
  );

  const maxAbsList = useMemo(() => Math.max(1e-9, ...listRows.map((r) => Math.abs(r.pnl))), [listRows]);
  const maxAbsCombo = useMemo(() => Math.max(1e-9, ...comboRows.map((r) => Math.abs(r.pnl))), [comboRows]);

  function onSortColumn(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const detailedRows = useMemo(() => {
    const arr = [...detailedRowsRaw];
    const m = sortDir === "asc" ? 1 : -1;
    const key = sortKey;
    arr.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (key === "name") {
        return m * String(av).localeCompare(String(bv), undefined, { sensitivity: "base" });
      }
      const an = typeof av === "number" && Number.isFinite(av) ? av : null;
      const bn = typeof bv === "number" && Number.isFinite(bv) ? bv : null;
      if (an == null && bn == null) return 0;
      if (an == null) return 1;
      if (bn == null) return -1;
      if (an === bn) return 0;
      return an < bn ? -m : m;
    });
    return arr;
  }, [detailedRowsRaw, sortKey, sortDir]);

  const filtersOn = reportFiltersActive(applied);
  const windowLabel = usesReportDateSpan ? "report date range (from / to)" : `last ${windowDays} calendar days`;

  const emptyListMsg = usesReportDateSpan
    ? "No trades in the selected date range after filters — adjust dates or Apply filters."
    : `No trades in the last ${windowDays} days after filters — import trades or widen the window with date filters.`;

  const comboEmptyMsg = isTags
    ? `No trades carry two or more ${nounPlural} at once. Add multiple tags on a trade to see combination rows.`
    : `No trades carry two or more ${nounPlural} at once. Add multiple setups on a trade to see combination rows.`;

  return (
    <>
      <div className="reports-overview-toolbar reports-tag-breakdown-toolbar">
        <p className="reports-filter-summary">
          <strong>Tag breakdown</strong> — net P&amp;L by <strong>{noun}</strong> over the{" "}
          <strong>{windowLabel}</strong> (each trade contributes its full P&amp;L once per {noun} on that trade). Use{" "}
          <strong>Setups</strong> to compare playbook-style setups the same way.
          {filtersOn ? (
            <>
              {" "}
              Using <strong>{filtered.length}</strong> trades matching the Reports filters above.
            </>
          ) : null}
        </p>
      </div>

      <div className="card reports-detailed-chart-card reports-tag-breakdown-card">
        <div className="reports-tag-breakdown-card-head">
          <div className="panel-title reports-chart-title">
            <span className="reports-chart-title-text">
              {isTags ? "Tags" : "Setups"}
              {usesReportDateSpan ? "" : ` (${windowDays}d)`}
            </span>
            <MetricHintIcon text={REPORTS_TAG_BREAKDOWN_CHART_HINT} />
          </div>
          <div className="reports-tag-breakdown-toggle-cluster">
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
            <MetricHintIcon text={REPORTS_TAG_BREAKDOWN_MODE_HINT} />
          </div>
        </div>

        <div className="reports-tag-bd-view-tabs" role="tablist" aria-label="Breakdown view">
          <button
            type="button"
            role="tab"
            className={`reports-tag-bd-view-tab ${view === "list" ? "is-active" : ""}`}
            aria-selected={view === "list"}
            onClick={() => setView("list")}
          >
            List
          </button>
          <button
            type="button"
            role="tab"
            className={`reports-tag-bd-view-tab ${view === "combinations" ? "is-active" : ""}`}
            aria-selected={view === "combinations"}
            onClick={() => setView("combinations")}
          >
            Combinations
          </button>
          <button
            type="button"
            role="tab"
            className={`reports-tag-bd-view-tab ${view === "detailed" ? "is-active" : ""}`}
            aria-selected={view === "detailed"}
            onClick={() => setView("detailed")}
          >
            Detailed
          </button>
        </div>

        <div className="reports-tag-bd-panel">
          {view === "list" ? (
            listRows.length === 0 ? (
              <div className="chart-empty reports-tag-bd-empty">{emptyListMsg}</div>
            ) : (
              <div className="reports-tag-bd-table-wrap">
                <table className="reports-tag-bd-table">
                  <thead>
                    <tr>
                      <th scope="col">{isTags ? "Tags" : "Setups"}</th>
                      <th scope="col">Graph</th>
                      <th scope="col" className="reports-tag-bd-num">
                        Net P&amp;L
                      </th>
                      <th scope="col" className="reports-tag-bd-num">
                        Count
                      </th>
                      <th scope="col" className="reports-tag-bd-num">
                        Volume
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {listRows.map((r) => (
                      <tr key={r.name}>
                        <td>
                          <span className="reports-tag-bd-label-pill">{r.name}</span>
                        </td>
                        <td className="reports-tag-bd-graph-col">
                          <PnlBarCell pnl={r.pnl} maxAbs={maxAbsList} />
                        </td>
                        <td className={`reports-tag-bd-num ${pnlClass(r.pnl)}`}>{formatMoney(r.pnl)}</td>
                        <td className="reports-tag-bd-num">{r.trades}</td>
                        <td className="reports-tag-bd-num">{r.volume.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}

          {view === "combinations" ? (
            comboRows.length === 0 ? (
              <div className="chart-empty reports-tag-bd-empty">{scoped.length === 0 ? emptyListMsg : comboEmptyMsg}</div>
            ) : (
              <div className="reports-tag-bd-table-wrap">
                <table className="reports-tag-bd-table">
                  <thead>
                    <tr>
                      <th scope="col">Combination</th>
                      <th scope="col">Graph</th>
                      <th scope="col" className="reports-tag-bd-num">
                        Net P&amp;L
                      </th>
                      <th scope="col" className="reports-tag-bd-num">
                        Count
                      </th>
                      <th scope="col" className="reports-tag-bd-num">
                        Volume
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {comboRows.map((r) => (
                      <tr key={r.name}>
                        <td>
                          <span className="reports-tag-bd-label-pill reports-tag-bd-label-pill--combo">{r.name}</span>
                        </td>
                        <td className="reports-tag-bd-graph-col">
                          <PnlBarCell pnl={r.pnl} maxAbs={maxAbsCombo} />
                        </td>
                        <td className={`reports-tag-bd-num ${pnlClass(r.pnl)}`}>{formatMoney(r.pnl)}</td>
                        <td className="reports-tag-bd-num">{r.trades}</td>
                        <td className="reports-tag-bd-num">{r.volume.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}

          {view === "detailed" ? (
            detailedRows.length === 0 ? (
              <div className="chart-empty reports-tag-bd-empty">{emptyListMsg}</div>
            ) : (
              <div className="reports-tag-bd-table-wrap reports-tag-bd-table-wrap--scroll">
                <table className="reports-tag-bd-table reports-tag-bd-table--detailed">
                  <thead>
                    <tr>
                      <SortTh label={isTags ? "Tags" : "Setups"} sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSortColumn} />
                      <SortTh label="Win %" sortKey="winPct" activeKey={sortKey} dir={sortDir} onSort={onSortColumn} />
                      <SortTh label="Profit factor" sortKey="profitFactor" activeKey={sortKey} dir={sortDir} onSort={onSortColumn} />
                      <SortTh label="Avg pos MFE" sortKey="avgPosMfe" activeKey={sortKey} dir={sortDir} onSort={onSortColumn} />
                      <SortTh label="Avg pos MAE" sortKey="avgPosMae" activeKey={sortKey} dir={sortDir} onSort={onSortColumn} />
                      <SortTh label="Net P&amp;L" sortKey="pnl" activeKey={sortKey} dir={sortDir} onSort={onSortColumn} />
                      <SortTh label="Count" sortKey="trades" activeKey={sortKey} dir={sortDir} onSort={onSortColumn} />
                      <SortTh label="Volume" sortKey="volume" activeKey={sortKey} dir={sortDir} onSort={onSortColumn} />
                    </tr>
                  </thead>
                  <tbody>
                    {detailedRows.map((r) => (
                      <tr key={r.name}>
                        <td>
                          <span className="reports-tag-bd-label-pill">{r.name}</span>
                        </td>
                        <td className="reports-tag-bd-num">{r.winPct != null ? `${r.winPct.toFixed(1)}%` : "—"}</td>
                        <td className="reports-tag-bd-num">{fmtProfitFactor(r.profitFactor)}</td>
                        <td className="reports-tag-bd-num">{r.avgPosMfe != null ? formatMoney(r.avgPosMfe) : "—"}</td>
                        <td className="reports-tag-bd-num">{r.avgPosMae != null ? formatMoney(r.avgPosMae) : "—"}</td>
                        <td className={`reports-tag-bd-num ${pnlClass(r.pnl)}`}>{formatMoney(r.pnl)}</td>
                        <td className="reports-tag-bd-num">{r.trades}</td>
                        <td className="reports-tag-bd-num">{r.volume.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </div>
      </div>
    </>
  );
}
