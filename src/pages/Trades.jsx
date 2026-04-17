import { useEffect, useMemo, useState } from "react";
import { visiblePageNumbers } from "../lib/pagination";
import { Link } from "react-router-dom";
import {
  formatMoney,
  pnlClass,
  formatTradeTableDate,
  loadTrades,
  saveTrades,
  deleteTradesByStableIds,
} from "../storage/storage";
import { stableTradeId } from "../storage/tradeLookup";
import { useLiveTrades } from "../hooks/useLiveTrades";
import { filterTradesForReport, DEFAULT_REPORT_FILTERS } from "../lib/reportFilters";
import {
  clearPersistedReportFilters,
  loadPersistedReportFilters,
  savePersistedReportFilters,
} from "../storage/reportFiltersPersist";
import { collectAllTagsFromTrades, getTradeTags } from "../lib/tradeTags";
import { mergeTradesByStableIds, splitTradeIntoRoundTripsByStableId } from "../lib/tradeMerge";
import ReportsFilterStrip from "../components/ReportsFilterStrip";
import { REPORT_DURATION_OPTIONS } from "../lib/tradeDuration";
import { tradeNetPnl } from "../lib/tradeExecutionMetrics";
import { prefetchTradeExecutionChart } from "../lib/tradeChartPrefetch";

const TRADES_PAGE_SIZE = 20;

/** @typedef {"date"|"symbol"|"volume"|"executions"|"pnl"|"shared"|"notes"|"tags"} TradeSortKey */
/** @typedef {{ key: TradeSortKey, dir: "asc"|"desc" }} TradeSort */

/**
 * @param {object} a
 * @param {object} b
 * @param {TradeSortKey} key
 * @param {"asc"|"desc"} dir
 */
function compareTradesForSort(a, b, key, dir) {
  const m = dir === "asc" ? 1 : -1;
  let cmp = 0;
  switch (key) {
    case "date":
      cmp = String(a.date ?? "").localeCompare(String(b.date ?? ""));
      break;
    case "symbol":
      cmp = String(a.symbol ?? "").localeCompare(String(b.symbol ?? ""), undefined, { sensitivity: "base" });
      break;
    case "volume":
      cmp = (Number(a.volume) || 0) - (Number(b.volume) || 0);
      break;
    case "executions":
      cmp = (Number(a.executions) || 0) - (Number(b.executions) || 0);
      break;
    case "pnl":
      cmp = tradeNetPnl(a) - tradeNetPnl(b);
      break;
    case "tags": {
      const ta = getTradeTags(a)
        .map((x) => String(x).toLowerCase())
        .sort()
        .join("\u0000");
      const tb = getTradeTags(b)
        .map((x) => String(x).toLowerCase())
        .sort()
        .join("\u0000");
      cmp = ta.localeCompare(tb);
      break;
    }
    case "shared":
    case "notes":
      cmp = 0;
      break;
    default:
      cmp = 0;
  }
  if (cmp !== 0) return m * cmp;
  return m * String(stableTradeId(a)).localeCompare(String(stableTradeId(b)));
}

/**
 * @param {TradeSortKey} key
 * @returns {"asc"|"desc"}
 */
function defaultSortDirForKey(key) {
  if (key === "symbol" || key === "tags") return "asc";
  return "desc";
}

/** @param {{ label: string, sortKey: TradeSortKey, sort: TradeSort, onSort: (k: TradeSortKey) => void, title?: string }} props */
function TradesSortHeader({ label, sortKey, sort, onSort, title }) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      className={`trades-th-btn${active ? " is-active" : ""}`}
      onClick={() => onSort(sortKey)}
      title={title}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <span className="trades-th-label">{label}</span>
      {active ? (
        <span className="trades-th-sort" aria-hidden>
          {sort.dir === "asc" ? "↑" : "↓"}
        </span>
      ) : null}
    </button>
  );
}

function Trades() {
  const trades = useLiveTrades();
  const [filterDraft, setFilterDraft] = useState(() => loadPersistedReportFilters());
  const [appliedFilters, setAppliedFilters] = useState(() => loadPersistedReportFilters());
  const [selected, setSelected] = useState(() => new Set());
  /** @type {[TradeSort, import("react").Dispatch<import("react").SetStateAction<TradeSort>>]} */
  const [sort, setSort] = useState(() => /** @type {TradeSort} */ ({ key: "date", dir: "desc" }));
  const [page, setPage] = useState(1);
  /** @type {["" | "merge" | "splitTrades" | "delete", import("react").Dispatch<import("react").SetStateAction<"" | "merge" | "splitTrades" | "delete">>]} */
  const [bulkAction, setBulkAction] = useState("");

  useEffect(() => {
    if (selected.size === 0) setBulkAction("");
  }, [selected.size]);

  /** Warm chart chunk so first trade open does not wait on network parse of the heavy module. */
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) void prefetchTradeExecutionChart();
    };
    const idleId =
      typeof requestIdleCallback !== "undefined"
        ? requestIdleCallback(run, { timeout: 2200 })
        : null;
    const timeoutId = idleId == null ? setTimeout(run, 350) : null;
    return () => {
      cancelled = true;
      if (idleId != null) cancelIdleCallback(idleId);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, []);

  const allTags = useMemo(() => collectAllTagsFromTrades(trades), [trades]);

  const filteredTrades = useMemo(() => {
    const rows = filterTradesForReport(trades, appliedFilters);
    return [...rows].sort((a, b) => compareTradesForSort(a, b, sort.key, sort.dir));
  }, [trades, appliedFilters, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / TRADES_PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const pageOffset = (pageClamped - 1) * TRADES_PAGE_SIZE;
  const pagedTrades = useMemo(
    () => filteredTrades.slice(pageOffset, pageOffset + TRADES_PAGE_SIZE),
    [filteredTrades, pageOffset],
  );
  const pageItems = useMemo(
    () => visiblePageNumbers(totalPages, pageClamped),
    [totalPages, pageClamped],
  );

  function setSortByKey(key) {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: defaultSortDirForKey(key) };
    });
  }

  function applyFilters() {
    const next = { ...filterDraft };
    setAppliedFilters(next);
    savePersistedReportFilters(next);
    setSelected(new Set());
    setPage(1);
  }

  function clearFilters() {
    clearPersistedReportFilters();
    setFilterDraft({ ...DEFAULT_REPORT_FILTERS });
    setAppliedFilters({ ...DEFAULT_REPORT_FILTERS });
    setSelected(new Set());
    setSort({ key: "date", dir: "desc" });
    setPage(1);
  }

  function toggleRow(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (filteredTrades.length === 0) return;
    if (selected.size === filteredTrades.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredTrades.map((t) => stableTradeId(t))));
    }
  }

  function submitBulkAction() {
    if (!bulkAction) return;
    const ids = [...selected];
    if (ids.length === 0) return;
    const list = loadTrades();

    if (bulkAction === "merge") {
      const r = mergeTradesByStableIds(ids, list);
      if (!r.ok) {
        window.alert(r.message);
        return;
      }
      saveTrades(r.next);
      setSelected(new Set());
      setBulkAction("");
      return;
    }

    if (bulkAction === "splitTrades") {
      if (ids.length !== 1) {
        window.alert(
          "Select exactly one trade to split. Each new row is one completed round trip (flat position), not one row per execution.",
        );
        return;
      }
      const r = splitTradeIntoRoundTripsByStableId(ids[0], list);
      if (!r.ok) {
        window.alert(r.message);
        return;
      }
      saveTrades(r.next);
      setSelected(new Set());
      setBulkAction("");
      return;
    }

    if (bulkAction === "delete") {
      if (!window.confirm(`Permanently delete ${ids.length} trade(s)? This cannot be undone.`)) return;
      deleteTradesByStableIds(ids);
      setSelected(new Set());
      setPage(1);
      setBulkAction("");
    }
  }

  return (
    <div className="page-wrap trades-page">
      <div className="page-header trades-page-header">
        <h1>Trades</h1>
      </div>

      <div className="trades-filter-strip">
        <ReportsFilterStrip
          draft={filterDraft}
          setDraft={setFilterDraft}
          onApply={applyFilters}
          onClear={clearFilters}
          allTags={allTags}
          durationOptions={REPORT_DURATION_OPTIONS}
          symbolPlaceholder="Symbol"
        />
      </div>

      <div className="card table-card trades-table-card">
        {selected.size > 0 ? (
          <div className="trades-bulk-bar" role="region" aria-label="Bulk actions for selected trades">
            <div className="trades-bulk-bar-row">
              <span className="trades-bulk-count">
                {selected.size} trade{selected.size === 1 ? "" : "s"} selected
              </span>
              <div className="trades-bulk-controls">
                <label htmlFor="trades-bulk-action" className="visually-hidden">
                  Select action
                </label>
                <select
                  id="trades-bulk-action"
                  className="trades-bulk-select"
                  value={bulkAction}
                  onChange={(e) => setBulkAction(/** @type {"" | "merge" | "splitTrades" | "delete"} */ (e.target.value))}
                >
                  <option value="">Select action</option>
                  <option value="merge">Merge trade</option>
                  <option value="splitTrades">Split trades</option>
                  <option value="delete">Delete trade</option>
                </select>
                <button
                  type="button"
                  className="reports-action-btn reports-action-btn--apply trades-bulk-submit"
                  disabled={!bulkAction}
                  onClick={submitBulkAction}
                >
                  Submit
                </button>
              </div>
              <button type="button" className="trades-bulk-clear" onClick={() => setSelected(new Set())}>
                Clear selection
              </button>
            </div>
          </div>
        ) : null}

        <div className="table-header trades-table-wide">
          <label className="trades-check-h">
            <input
              type="checkbox"
              checked={filteredTrades.length > 0 && selected.size === filteredTrades.length}
              onChange={toggleAll}
            />
          </label>
          <TradesSortHeader label="Date" sortKey="date" sort={sort} onSort={setSortByKey} title="Sort by date" />
          <TradesSortHeader label="Symbol" sortKey="symbol" sort={sort} onSort={setSortByKey} title="Sort by symbol" />
          <TradesSortHeader label="Volume" sortKey="volume" sort={sort} onSort={setSortByKey} title="Sort by volume" />
          <TradesSortHeader
            label="Executions"
            sortKey="executions"
            sort={sort}
            onSort={setSortByKey}
            title="Sort by execution count"
          />
          <TradesSortHeader
            label="P&L"
            sortKey="pnl"
            sort={sort}
            onSort={setSortByKey}
            title="Sort by net P&amp;L (import; fees when provided)"
          />
          <TradesSortHeader label="Shared" sortKey="shared" sort={sort} onSort={setSortByKey} title="Sort (no data yet)" />
          <TradesSortHeader label="Notes" sortKey="notes" sort={sort} onSort={setSortByKey} title="Sort (no data yet)" />
          <TradesSortHeader label="Tags" sortKey="tags" sort={sort} onSort={setSortByKey} title="Sort by tags" />
        </div>

        {trades.length === 0 ? (
          <div className="trades-empty">
            No trades yet. Import a Schwab / Thinkorswim account statement CSV (Cash Balance TRD and Account Trade History) from the sidebar.
          </div>
        ) : filteredTrades.length === 0 ? (
          <div className="trades-empty">No trades match these filters. Edit the strip and click Apply (✓).</div>
        ) : (
          pagedTrades.map((trade, idx) => {
            const rowId = stableTradeId(trade);
            const tags = getTradeTags(trade);
            const tagsLabel = tags.length ? tags.join(", ") : "—";
            const displayPnl = tradeNetPnl(trade);
            const rowTone = (pageOffset + idx) % 2;
            return (
              <div key={rowId} className={`table-row trades-table-wide trades-row-open ${rowTone ? "trades-row-alt" : ""}`}>
                <label className="trades-check-cell" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(rowId)} onChange={() => toggleRow(rowId)} />
                </label>
                <Link
                  className="trades-row-trade-link"
                  to={`/trades/${encodeURIComponent(rowId)}`}
                  aria-label={`Open trade ${trade.symbol} ${trade.date}`}
                  onPointerEnter={() => {
                    void prefetchTradeExecutionChart();
                  }}
                >
                  <div>{formatTradeTableDate(trade.date)}</div>
                  <div className="trades-symbol">{trade.symbol}</div>
                  <div>{trade.volume}</div>
                  <div>{trade.executions}</div>
                  <div className={pnlClass(displayPnl)}>{formatMoney(displayPnl)}</div>
                  <div className="trades-cell-muted">—</div>
                  <div className="trades-cell-muted">—</div>
                  <div className={tags.length ? "trades-tags-cell" : "trades-cell-muted"} title={tagsLabel}>
                    {tagsLabel}
                  </div>
                </Link>
              </div>
            );
          })
        )}
        {filteredTrades.length > TRADES_PAGE_SIZE ? (
          <nav className="trade-detail-fills-pagination trades-list-pagination" aria-label="Trades pages">
            <button
              type="button"
              className="trade-detail-fills-page-btn trade-detail-fills-page-btn--nav"
              disabled={pageClamped <= 1}
              onClick={() => setPage(pageClamped - 1)}
              aria-label="Previous page"
            >
              ‹
            </button>
            {pageItems.map((item, i) =>
              item === "ellipsis" ? (
                <span key={`e-${i}`} className="trade-detail-fills-page-ellipsis" aria-hidden>
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={
                    item === pageClamped
                      ? "trade-detail-fills-page-btn trade-detail-fills-page-btn--active"
                      : "trade-detail-fills-page-btn"
                  }
                  onClick={() => setPage(item)}
                  aria-label={`Page ${item}`}
                  aria-current={item === pageClamped ? "page" : undefined}
                >
                  {item}
                </button>
              ),
            )}
            <button
              type="button"
              className="trade-detail-fills-page-btn trade-detail-fills-page-btn--nav"
              disabled={pageClamped >= totalPages}
              onClick={() => setPage(pageClamped + 1)}
              aria-label="Next page"
            >
              ›
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

export default Trades;
