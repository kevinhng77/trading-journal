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
import { collectAllTagsFromTrades, collectAllSetupsFromTrades, getTradeTags, getTradeSetups } from "../lib/tradeTags";
import ReportsFilterStrip from "../components/ReportsFilterStrip";
import { REPORTS_DURATION_OPTIONS } from "../lib/tradeDuration";
import { aggregateDayExecutionMetrics } from "../lib/tradeExecutionMetrics";
import DayPnLSparkline from "../components/DayPnLSparkline";
import { prefetchTradeExecutionChart } from "../lib/tradeChartPrefetch";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const JOURNAL_NOTES_KEY = "tradingJournalDayNotes";

function loadJournalNotesMap() {
  try {
    const raw = localStorage.getItem(JOURNAL_NOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveJournalNotesMap(map) {
  try {
    localStorage.setItem(JOURNAL_NOTES_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function dayImportsFeeColumns(rows) {
  return (rows ?? []).some((t) =>
    (t.fills ?? []).some((f) => f && ("commission" in f || "miscFees" in f)),
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

function winPctForDay(rows) {
  if (!rows.length) return null;
  const wins = rows.filter((t) => Number(t.pnl) > 0).length;
  return Math.round((wins / rows.length) * 1000) / 10;
}

function Journal() {
  const [searchParams] = useSearchParams();
  const focusDateRaw = searchParams.get("date");
  const focusDate = focusDateRaw && DATE_RE.test(focusDateRaw) ? focusDateRaw : null;

  const trades = useLiveTrades();
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
  const allSetups = useMemo(() => collectAllSetupsFromTrades(trades), [trades]);

  const filteredTrades = useMemo(
    () => filterTradesForReport(trades, appliedFilters),
    [trades, appliedFilters],
  );
  const groupedFiltered = useMemo(() => groupTradesByDate(filteredTrades), [filteredTrades]);

  const [notesByDate, setNotesByDate] = useState(() => loadJournalNotesMap());

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

  return (
    <div className="page-wrap journal-page">
      <div className="journal-main">
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

        <div className="trades-filter-strip journal-filter-strip">
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
        </div>

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
                          <div className="journal-stat" title="Sum of stored closed P&amp;L per trade (same as table total)">
                            <span className="journal-stat-label">Net P&amp;L</span>
                            <span className={`journal-stat-value ${pnlClass(dm.netPnl)}`}>{formatMoney(dm.netPnl)}</span>
                          </div>
                        </div>
                      </div>
                      <details className="journal-day-settings">
                        <summary className="journal-day-settings-summary" title="Day actions">
                          ⚙
                        </summary>
                        <div className="journal-day-settings-menu">
                          <button
                            type="button"
                            className="journal-day-settings-item"
                            onClick={() => {
                              const body = [
                                `${formatDisplayDate(day.date)} (${day.date})`,
                                `Closed P&L (day): ${formatMoney(day.pnl)}`,
                                `Net Σ trades: ${formatMoney(dm.netPnl)}`,
                                `Gross Σ (amount column when present): ${formatMoney(dm.grossPnl)}`,
                                `Commissions + fees paid: $${dm.feesPaid.toFixed(2)}`,
                                dm.hasReplay
                                  ? `Avg replay MFE / MAE: ${formatMoney(dm.avgMfe)} / ${formatMoney(-(dm.avgMae ?? 0))}`
                                  : "Replay MFE/MAE: — (need 2+ fills per trade)",
                                `Trades: ${day.trades} · Volume: ${day.volume}`,
                              ].join("\n");
                              copyText(body);
                            }}
                          >
                            Copy day summary
                          </button>
                          <button
                            type="button"
                            className="journal-day-settings-item"
                            onClick={() => {
                              const ids = day.rows.map((r) => stableTradeId(r)).join("\n");
                              copyText(ids);
                            }}
                          >
                            Copy trade IDs
                          </button>
                        </div>
                      </details>
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
                  </div>

                  <div className="card table-card inner-table">
                    <div className="table-header journal-exec-table">
                      <div>Time</div>
                      <div>Symbol</div>
                      <div>Volume</div>
                      <div>Execs</div>
                      <div>P&amp;L</div>
                      <div>Shared</div>
                      <div>Notes</div>
                      <div>Tags</div>
                      <div>Setup</div>
                    </div>

                    {day.rows.length === 0 ? (
                      <div className="journal-no-trades">No trades on this day.</div>
                    ) : (
                      day.rows.map((trade, idx) => {
                        const rowKey = stableTradeId(trade);
                        const tags = getTradeTags(trade);
                        const tagsLabel = tags.length ? tags.join(", ") : "—";
                        const setups = getTradeSetups(trade);
                        const setupsLabel = setups.length ? setups.join(", ") : "—";
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
                              <div className={pnlClass(trade.pnl)}>{formatMoney(trade.pnl)}</div>
                              <div className="trades-cell-muted">—</div>
                              <div className="trades-cell-muted">—</div>
                              <div className={tags.length ? "journal-tags-cell" : "trades-cell-muted"} title={tagsLabel}>
                                {tagsLabel}
                              </div>
                              <div className={setups.length ? "journal-tags-cell" : "trades-cell-muted"} title={setupsLabel}>
                                {setupsLabel}
                              </div>
                            </Link>
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
