import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { visiblePageNumbers } from "../lib/pagination";
import { Link, useLocation } from "react-router-dom";
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
import {
  buildSetupFilterSuggestions,
  collectAllTagsFromTrades,
  getTradeTags,
  getTradeSetups,
} from "../lib/tradeTags";
import { usePlaybookPlayNames } from "../hooks/usePlaybookPlayNames";
import { mergeTradesByStableIds, splitTradeIntoRoundTripsByStableId } from "../lib/tradeMerge";
import ReportsFilterStrip from "../components/ReportsFilterStrip";
import { REPORTS_DURATION_OPTIONS } from "../lib/tradeDuration";
import { tradeSignedAmountForAggregation } from "../lib/tradeExecutionMetrics";
import { prefetchTradeExecutionChart } from "../lib/tradeChartPrefetch";
import StarToggle from "../components/StarToggle";
import { useStarred } from "../hooks/useStarred";
import { readAllTradeNotes, TRADE_NOTES_CHANGED_EVENT } from "../storage/tradeNotes";
import { ACCOUNT_CHANGED_EVENT } from "../storage/tradingAccounts";
import { useActiveAccountId } from "../hooks/useActiveAccountId";

const TRADES_PAGE_SIZE = 20;

/** @typedef {"date"|"symbol"|"volume"|"executions"|"pnl"|"notes"|"tags"|"setups"} TradeSortKey */
/** @typedef {{ key: TradeSortKey, dir: "asc"|"desc" }} TradeSort */

/**
 * @param {object} a
 * @param {object} b
 * @param {TradeSortKey} key
 * @param {"asc"|"desc"} dir
 */
/**
 * @param {object} a
 * @param {object} b
 * @param {TradeSortKey} key
 * @param {"asc"|"desc"} dir
 * @param {Record<string, string>} [notesById]
 */
function compareTradesForSort(a, b, key, dir, notesById) {
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
      cmp = tradeSignedAmountForAggregation(a) - tradeSignedAmountForAggregation(b);
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
    case "setups": {
      const sa = getTradeSetups(a)
        .map((x) => String(x).toLowerCase())
        .sort()
        .join("\u0000");
      const sb = getTradeSetups(b)
        .map((x) => String(x).toLowerCase())
        .sort()
        .join("\u0000");
      cmp = sa.localeCompare(sb);
      break;
    }
    case "notes": {
      const map = notesById && typeof notesById === "object" ? notesById : readAllTradeNotes();
      const na = String(map[stableTradeId(a)] ?? "")
        .trim()
        .toLowerCase();
      const nb = String(map[stableTradeId(b)] ?? "")
        .trim()
        .toLowerCase();
      cmp = na.localeCompare(nb);
      break;
    }
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
  if (key === "symbol" || key === "tags" || key === "setups" || key === "notes") return "asc";
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
  const location = useLocation();
  const activeAccountId = useActiveAccountId();
  const { isTradeStarred, toggleTrade } = useStarred();
  const [filterDraft, setFilterDraft] = useState(() => loadPersistedReportFilters());
  const [appliedFilters, setAppliedFilters] = useState(() => loadPersistedReportFilters());
  const [selected, setSelected] = useState(() => new Set());
  /** @type {[TradeSort, import("react").Dispatch<import("react").SetStateAction<TradeSort>>]} */
  const [sort, setSort] = useState(() => /** @type {TradeSort} */ ({ key: "date", dir: "desc" }));
  const [page, setPage] = useState(1);
  /** @type {["" | "merge" | "splitTrades" | "delete", import("react").Dispatch<import("react").SetStateAction<"" | "merge" | "splitTrades" | "delete">>]} */
  const [bulkAction, setBulkAction] = useState("");
  const [tradeNotesRev, setTradeNotesRev] = useState(0);
  const chartWarmRef = useRef(false);

  useEffect(() => {
    function bump() {
      setTradeNotesRev((n) => n + 1);
    }
    window.addEventListener(TRADE_NOTES_CHANGED_EVENT, bump);
    window.addEventListener(ACCOUNT_CHANGED_EVENT, bump);
    function onStorage(/** @type {StorageEvent} */ e) {
      if (e.key && e.key.startsWith("tradingJournalTradeNotes")) bump();
    }
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(TRADE_NOTES_CHANGED_EVENT, bump);
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const warmTradeChartOnce = useCallback(() => {
    if (chartWarmRef.current) return;
    chartWarmRef.current = true;
    void prefetchTradeExecutionChart();
  }, []);

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
  const playbookPlayNames = usePlaybookPlayNames();
  const allSetups = useMemo(
    () => buildSetupFilterSuggestions(trades, playbookPlayNames),
    [trades, playbookPlayNames],
  );

  const tradeNotesById = useMemo(() => readAllTradeNotes(), [trades, location.key, tradeNotesRev, activeAccountId]);

  const filteredTrades = useMemo(() => {
    const rows = filterTradesForReport(trades, appliedFilters);
    return [...rows].sort((a, b) => compareTradesForSort(a, b, sort.key, sort.dir, tradeNotesById));
  }, [trades, appliedFilters, sort, tradeNotesById]);

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

      <ReportsFilterStrip
        draft={filterDraft}
        setDraft={setFilterDraft}
        onApply={applyFilters}
        onClear={clearFilters}
        allTags={allTags}
        allSetups={allSetups}
        durationOptions={REPORTS_DURATION_OPTIONS}
        symbolPlaceholder="Symbol"
      />

      <div className="card table-card trades-table-card" onPointerEnter={warmTradeChartOnce}>
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
            title="Sort by P&amp;L (Schwab AMOUNT sum per trade; row fees in fill detail)"
          />
          <TradesSortHeader label="Notes" sortKey="notes" sort={sort} onSort={setSortByKey} title="Sort by trade note text" />
          <TradesSortHeader label="Setup" sortKey="setups" sort={sort} onSort={setSortByKey} title="Sort by setups" />
          <TradesSortHeader label="Tags" sortKey="tags" sort={sort} onSort={setSortByKey} title="Sort by tags" />
          <div className="trades-star-col-head" title="Star trade for * review">
            *
          </div>
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
            const setups = getTradeSetups(trade);
            const setupsLabel = setups.length ? setups.join(", ") : "—";
            const displayPnl = tradeSignedAmountForAggregation(trade);
            const noteRaw = String(tradeNotesById[rowId] ?? "").trim();
            const notePreview = noteRaw || "—";
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
                >
                  <div>{formatTradeTableDate(trade.date)}</div>
                  <div className="trades-symbol">{trade.symbol}</div>
                  <div>{trade.volume}</div>
                  <div>{trade.executions}</div>
                  <div className={pnlClass(displayPnl)}>{formatMoney(displayPnl)}</div>
                  <div
                    className={`trades-notes-cell${noteRaw ? "" : " trades-cell-muted"}`}
                    title={noteRaw || undefined}
                  >
                    {notePreview}
                  </div>
                  <div className={setups.length ? "trades-tags-cell" : "trades-cell-muted"} title={setupsLabel}>
                    {setupsLabel}
                  </div>
                  <div className={tags.length ? "trades-tags-cell" : "trades-cell-muted"} title={tagsLabel}>
                    {tagsLabel}
                  </div>
                </Link>
                <div className="trades-star-cell">
                  <StarToggle
                    starred={isTradeStarred(rowId)}
                    onToggle={() => toggleTrade(rowId)}
                    aria-label="Star this trade for review"
                  />
                </div>
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
