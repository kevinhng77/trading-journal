import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  groupTradesByDate,
  formatMoney,
  pnlClass,
  formatDisplayDate,
} from "../storage/storage";
import { getDayAggregate } from "../lib/dashboardStats";
import { useLiveTrades } from "../hooks/useLiveTrades";
import { stableTradeId } from "../storage/tradeLookup";
import { filterTradesForReport, DEFAULT_REPORT_FILTERS } from "../lib/reportFilters";
import {
  clearPersistedReportFilters,
  loadPersistedReportFilters,
  savePersistedReportFilters,
} from "../storage/reportFiltersPersist";
import { REPORT_FILTERS_DATES_EVENT } from "../lib/reportFilterEvents";
import {
  buildSetupFilterSuggestions,
  collectAllTagsFromTrades,
  getTradeTags,
  getTradeSetups,
} from "../lib/tradeTags";
import { usePlaybookPlayNames } from "../hooks/usePlaybookPlayNames";
import ReportsFilterStrip from "../components/ReportsFilterStrip";
import { REPORTS_DURATION_OPTIONS } from "../lib/tradeDuration";
import {
  aggregateDayExecutionMetrics,
  tradeSignedAmountForAggregation,
} from "../lib/tradeExecutionMetrics";
import DayPnLSparkline from "../components/DayPnLSparkline";
import { prefetchTradeExecutionChart } from "../lib/tradeChartPrefetch";
import { appendSpacedChunk } from "../lib/appendDictationChunk";
import NotesVoiceInputButton from "../components/NotesVoiceInputButton";
import StarToggle from "../components/StarToggle";
import { useStarred } from "../hooks/useStarred";
import { readAllTradeNotes, TRADE_NOTES_CHANGED_EVENT } from "../storage/tradeNotes";
import {
  ACCOUNT_CHANGED_EVENT,
  getActiveAccountId,
  journalDayNotesStorageKey,
  migrateJournalDayNotesFromLegacy,
} from "../storage/tradingAccounts";
import { useActiveAccountId } from "../hooks/useActiveAccountId";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function loadJournalNotesMap() {
  migrateJournalDayNotesFromLegacy();
  try {
    const raw = localStorage.getItem(journalDayNotesStorageKey(getActiveAccountId()));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveJournalNotesMap(map) {
  try {
    localStorage.setItem(journalDayNotesStorageKey(getActiveAccountId()), JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function dayImportsFeeColumns(rows) {
  return (rows ?? []).some((t) =>
    (t.fills ?? []).some((f) => f && ("commission" in f || "miscFees" in f)),
  );
}

function winPctForDay(rows) {
  if (!rows.length) return null;
  const wins = rows.filter((t) => tradeSignedAmountForAggregation(t) > 0).length;
  return Math.round((wins / rows.length) * 1000) / 10;
}

function Journal() {
  const [searchParams] = useSearchParams();
  const focusDateRaw = searchParams.get("date");
  const focusDate = focusDateRaw && DATE_RE.test(focusDateRaw) ? focusDateRaw : null;
  const activeAccountId = useActiveAccountId();

  const trades = useLiveTrades();
  const { isDayStarred, toggleDay, isTradeStarred, toggleTrade } = useStarred();
  const [filterDraft, setFilterDraft] = useState(() => loadPersistedReportFilters());
  const [appliedFilters, setAppliedFilters] = useState(() => loadPersistedReportFilters());

  useEffect(() => {
    function onDates(/** @type {CustomEvent} */ e) {
      const { dateFrom, dateTo } = e.detail ?? {};
      if (!dateFrom || !dateTo) return;
      setFilterDraft((f) => ({ ...f, dateFrom, dateTo }));
    }
    window.addEventListener(REPORT_FILTERS_DATES_EVENT, onDates);
    return () => window.removeEventListener(REPORT_FILTERS_DATES_EVENT, onDates);
  }, []);

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

  const filteredTrades = useMemo(
    () => filterTradesForReport(trades, appliedFilters),
    [trades, appliedFilters],
  );
  const groupedFiltered = useMemo(() => groupTradesByDate(filteredTrades), [filteredTrades]);

  const [notesByDate, setNotesByDate] = useState(() => loadJournalNotesMap());
  const [tradeNotesRev, setTradeNotesRev] = useState(0);

  useEffect(() => {
    function bump() {
      setTradeNotesRev((n) => n + 1);
    }
    function onAccount() {
      setNotesByDate(loadJournalNotesMap());
      bump();
    }
    window.addEventListener(TRADE_NOTES_CHANGED_EVENT, bump);
    window.addEventListener(ACCOUNT_CHANGED_EVENT, onAccount);
    window.addEventListener("focus", bump);
    function onStorage(/** @type {StorageEvent} */ e) {
      if (e.key && e.key.startsWith("tradingJournalTradeNotes")) bump();
    }
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(TRADE_NOTES_CHANGED_EVENT, bump);
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, onAccount);
      window.removeEventListener("focus", bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const tradeNotesById = useMemo(
    () => readAllTradeNotes(),
    [trades, searchParams.toString(), tradeNotesRev, activeAccountId],
  );

  const days = focusDate
    ? [getDayAggregate(groupedFiltered, focusDate)]
    : Object.values(groupedFiltered).sort((a, b) => b.date.localeCompare(a.date));

  useEffect(() => {
    if (!focusDate) return;
    const t = requestAnimationFrame(() => {
      document.getElementById(`journal-day-${focusDate}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(t);
  }, [focusDate]);

  function applyFilters() {
    const next = { ...filterDraft };
    setAppliedFilters(next);
    savePersistedReportFilters(next);
  }

  function clearFilters() {
    clearPersistedReportFilters();
    setFilterDraft({ ...DEFAULT_REPORT_FILTERS });
    setAppliedFilters({ ...DEFAULT_REPORT_FILTERS });
  }

  function setNoteForDay(date, text) {
    setNotesByDate((prev) => {
      const next = { ...prev, [date]: text };
      saveJournalNotesMap(next);
      return next;
    });
  }

  function appendJournalVoice(date, chunk) {
    setNotesByDate((prev) => {
      const cur = prev[date] ?? "";
      const merged = appendSpacedChunk(cur, chunk);
      const next = { ...prev, [date]: merged };
      saveJournalNotesMap(next);
      return next;
    });
  }

  return (
    <div className="page-wrap journal-page">
      <div className="page-header journal-page-header">
        <h1>Journal</h1>
        {focusDate && (
          <p className="journal-focus-hint">
            Showing <strong>{formatDisplayDate(focusDate)}</strong> only —{" "}
            <Link className="journal-focus-clear" to="/journal">
              view all days
            </Link>
          </p>
        )}
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

      <div className="journal-main">
        <div className="journal-stack">
            {trades.length === 0 ? (
              <div className="card journal-day-card journal-empty-state">
                <p>
                  No journal days yet. Import a Thinkorswim statement CSV to populate trades, then open a day from the
                  dashboard or calendar.
                </p>
              </div>
            ) : days.length === 0 ? (
              <div className="card journal-day-card journal-empty-state">
                <p>No days match these filters. Adjust the strip and click Apply (✓).</p>
              </div>
            ) : (
            days.map((day) => {
              const wp = winPctForDay(day.rows);
              const dm = aggregateDayExecutionMetrics(day.rows);
              const feeCols = dayImportsFeeColumns(day.rows);
              const noteText = notesByDate[day.date] ?? "";
              return (
                <article
                  key={day.date}
                  id={`journal-day-${day.date}`}
                  className={`card journal-day-card ${focusDate === day.date ? "journal-day-focused" : ""}`}
                >
                  <div className="journal-day-head">
                    <div className="journal-day-head-primary">
                      <h2>{formatDisplayDate(day.date)}</h2>
                      <div className={`journal-day-pnl ${pnlClass(day.pnl)}`}>
                        P&amp;L: {formatMoney(day.pnl)}
                      </div>
                    </div>
                    <div className="journal-day-head-metrics">
                      <div className="journal-stats-panel">
                        <div
                          className="journal-chart-thumb"
                          title="Cumulative closed P&amp;L through the day (trade order)"
                        >
                          <span className="journal-curve-label">Curve</span>
                          <DayPnLSparkline rows={day.rows} />
                        </div>
                        <div className="journal-stats-grid">
                          <div className="journal-stat">
                            <span className="journal-stat-label">Total Trades</span>
                            <span className="journal-stat-value">{day.trades}</span>
                          </div>
                          <div className="journal-stat">
                            <span className="journal-stat-label">Total Volume</span>
                            <span className="journal-stat-value">{day.volume}</span>
                          </div>
                          <div className="journal-stat">
                            <span className="journal-stat-label">Win %</span>
                            <span className="journal-stat-value">{wp != null ? `${wp}%` : "—"}</span>
                          </div>
                          <div className="journal-stat" title={feeCols ? "Sum of commissions + misc fees paid (from imported fills)" : ""}>
                            <span className="journal-stat-label">Commissions/Fees</span>
                            <span className={`journal-stat-value ${feeCols ? pnlClass(-dm.feesPaid) : "trades-cell-muted"}`}>
                              {feeCols ? (
                                formatMoney(-dm.feesPaid)
                              ) : day.rows.some((t) => (t.fills ?? []).length) ? (
                                <>
                                  —
                                  <span
                                    className="journal-stat-footnote"
                                    title="Re-import a statement CSV with comm/misc columns on fills"
                                  >
                                    {" "}
                                    (n/a)
                                  </span>
                                </>
                              ) : (
                                "—"
                              )}
                            </span>
                          </div>
                          <div
                            className="journal-stat"
                            title="Fill-replay: unrealized P&amp;L at each fill price vs average cost (2+ fills)"
                          >
                            <span className="journal-stat-label">MFE / MAE</span>
                            <span className="journal-stat-value">
                              {dm.hasReplay ? (
                                <>
                                  <span className="green">{formatMoney(dm.avgMfe)}</span>
                                  <span className="grey"> / </span>
                                  <span className="red">{formatMoney(-(dm.avgMae ?? 0))}</span>
                                </>
                              ) : (
                                <span className="trades-cell-muted">—</span>
                              )}
                            </span>
                          </div>
                          <div
                            className="journal-stat"
                            title="Sum of each trade’s P&amp;L (Schwab AMOUNT sums; same as Trades list and day header)"
                          >
                            <span className="journal-stat-label">Net P&amp;L</span>
                            <span className={`journal-stat-value ${pnlClass(dm.netPnl)}`}>{formatMoney(dm.netPnl)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="journal-day-head-actions">
                        <StarToggle
                          starred={isDayStarred(day.date)}
                          onToggle={() => toggleDay(day.date)}
                          title={
                            isDayStarred(day.date)
                              ? "Remove this day from starred (*)"
                              : "Star this day for review on the * page"
                          }
                          aria-label={isDayStarred(day.date) ? "Unstar day" : "Star day"}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="journal-notes-box journal-entry-panel">
                    <label className="journal-notes-label" htmlFor={`journal-notes-${day.date}`}>
                      New journal entry
                    </label>
                    <textarea
                      id={`journal-notes-${day.date}`}
                      className="journal-notes-input"
                      placeholder="Click here to start typing your notes…"
                      value={noteText}
                      onChange={(e) => setNoteForDay(day.date, e.target.value)}
                      rows={4}
                    />
                    <div className="journal-notes-actions">
                      <NotesVoiceInputButton onAppend={(c) => appendJournalVoice(day.date, c)} />
                    </div>
                  </div>

                  <div className="card table-card inner-table">
                    <div className="table-header journal-exec-table">
                      <div>Time</div>
                      <div>Symbol</div>
                      <div>Volume</div>
                      <div>Execs</div>
                      <div>P&amp;L</div>
                      <div>Notes</div>
                      <div>Tags</div>
                      <div>Setup</div>
                      <div className="journal-star-col-head" title="Star trade for * review">
                        *
                      </div>
                    </div>

                    {day.rows.length === 0 ? (
                      <div className="journal-no-trades">No trades on this day.</div>
                    ) : (
                      day.rows.map((trade, idx) => {
                        const rowKey = stableTradeId(trade);
                        const rowAmt = tradeSignedAmountForAggregation(trade);
                        const tags = getTradeTags(trade);
                        const tagsLabel = tags.length ? tags.join(", ") : "—";
                        const setups = getTradeSetups(trade);
                        const setupsLabel = setups.length ? setups.join(", ") : "—";
                        const noteRaw = String(tradeNotesById[rowKey] ?? "").trim();
                        return (
                          <div
                            key={rowKey}
                            className={`table-row journal-exec-table journal-row-open ${idx % 2 ? "trades-row-alt" : ""}`}
                          >
                            <Link
                              className="journal-row-trade-link"
                              to={`/trades/${encodeURIComponent(rowKey)}`}
                              aria-label={`Open trade ${trade.symbol} ${trade.time || ""}`}
                              onPointerEnter={() => {
                                void prefetchTradeExecutionChart();
                              }}
                            >
                              <div className="journal-time-cell">{trade.time || "—"}</div>
                              <div className="trades-symbol">{trade.symbol}</div>
                              <div>{trade.volume}</div>
                              <div>{trade.executions}</div>
                              <div className={pnlClass(rowAmt)}>{formatMoney(rowAmt)}</div>
                              <div
                                className={`trades-notes-cell${noteRaw ? "" : " trades-cell-muted"}`}
                                title={noteRaw || undefined}
                              >
                                {noteRaw || "—"}
                              </div>
                              <div className={tags.length ? "journal-tags-cell" : "trades-cell-muted"} title={tagsLabel}>
                                {tagsLabel}
                              </div>
                              <div className={setups.length ? "journal-tags-cell" : "trades-cell-muted"} title={setupsLabel}>
                                {setupsLabel}
                              </div>
                            </Link>
                            <div className="journal-trade-star-cell">
                              <StarToggle
                                starred={isTradeStarred(rowKey)}
                                onToggle={() => toggleTrade(rowKey)}
                                aria-label="Star this trade for review"
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </article>
              );
            })
            )}
        </div>
      </div>
    </div>
  );
}

export default Journal;
