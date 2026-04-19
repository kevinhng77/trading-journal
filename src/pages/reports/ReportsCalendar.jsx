import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { groupTradesByDate, formatMoney, pnlClass } from "../../storage/storage";
import { useRawAndReportTrades } from "../../hooks/useReportViewTrades";
import {
  filterTradesForReport,
  DEFAULT_REPORT_FILTERS,
  reportFiltersForYearCalendar,
} from "../../lib/reportFilters";
import { getDayAggregate } from "../../lib/dashboardStats";
import { buildCalendarWeeks, formatMonthTitle, sumMonthPnl } from "../../lib/calendarGrid";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseYear(searchParams) {
  const y = Number(searchParams.get("year"));
  if (Number.isFinite(y) && y >= 1970 && y <= 2100) return y;
  return new Date().getFullYear();
}

/** `expand` query value: same key as month cards, `YYYY-M` with M = 0–11. Must match `selectedYear`. */
function expandedMonthKeyFromSearch(searchParams, selectedYear) {
  const raw = searchParams.get("expand");
  if (!raw) return null;
  const m = /^(\d{4})-(\d{1,2})$/.exec(String(raw).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (y !== selectedYear || mo < 0 || mo > 11) return null;
  return `${y}-${mo}`;
}

/** @param {string | null} openKey */
function expandedMonthIndexFromKey(openKey) {
  if (!openKey) return null;
  const m = /^(\d{4})-(\d{1,2})$/.exec(openKey);
  if (!m) return null;
  return Number(m[2]);
}

function JournalGlyph({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M7 3h8l4 4v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm7 1.5V8h3.5L14 4.5zM8 12h8v1.5H8V12zm0 3.5h8V17H8v-1.5z"
      />
    </svg>
  );
}

function dayStyleClass(day) {
  if (day.trades === 0) return "reports-cal-neutral";
  return pnlClass(day.pnl);
}

function MonthMiniGrid({ year, monthIndex, grouped }) {
  const weeks = buildCalendarWeeks(year, monthIndex);
  return (
    <div className="reports-cal-mini">
      {weeks.map((week, wi) => (
        <div key={wi} className="reports-cal-mini-row">
          {week.map((iso, di) => {
            if (!iso) {
              return <div key={`e-${wi}-${di}`} className="reports-cal-mini-cell reports-cal-mini-pad" />;
            }
            const day = getDayAggregate(grouped, iso);
            return (
              <Link
                key={iso}
                to={`/journal?date=${encodeURIComponent(iso)}`}
                className={`reports-cal-mini-cell reports-cal-mini-day ${dayStyleClass(day)}`}
                title={`${iso}: ${formatMoney(day.pnl)} · ${day.trades} trades`}
              >
                {Number(iso.slice(8, 10))}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MonthExpandedGrid({ year, monthIndex, grouped }) {
  const weeks = buildCalendarWeeks(year, monthIndex);
  const monthPnl = sumMonthPnl(grouped, year, monthIndex);

  return (
    <div className="reports-cal-expanded">
      <div className="reports-cal-expanded-meta">
        <span className={`reports-cal-month-pnl reports-cal-month-pnl-row ${pnlClass(monthPnl)}`}>
          Monthly P&amp;L: {formatMoney(monthPnl)}
        </span>
      </div>
      <table className="reports-cal-table">
        <thead>
          <tr>
            {DOW.map((d) => (
              <th key={d}>{d}</th>
            ))}
            <th className="reports-cal-week-col">Week</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => {
            let weekPnl = 0;
            let weekTrades = 0;
            return (
              <tr key={wi}>
                {week.map((iso, di) => {
                  if (!iso) {
                    return <td key={`p-${wi}-${di}`} className="reports-cal-td-pad" />;
                  }
                  const day = getDayAggregate(grouped, iso);
                  weekPnl += day.pnl;
                  weekTrades += day.trades;
                  const dom = Number(iso.slice(8, 10));
                  return (
                    <td key={iso} className="reports-cal-td-day">
                      <Link
                        to={`/journal?date=${encodeURIComponent(iso)}`}
                        className={`reports-cal-day-card ${dayStyleClass(day)}`}
                      >
                        <JournalGlyph className="reports-cal-day-glyph" />
                        <div className="reports-cal-day-dom">{dom}</div>
                        <div className={`reports-cal-day-pnl ${pnlClass(day.pnl)}`}>
                          {day.trades === 0 ? "$0" : formatMoney(day.pnl)}
                        </div>
                        <div className="reports-cal-day-trades">
                          {day.trades} {day.trades === 1 ? "trade" : "trades"}
                        </div>
                      </Link>
                    </td>
                  );
                })}
                <td className="reports-cal-week-cell">
                  <div className={`reports-cal-week-inner ${pnlClass(weekPnl)}`}>
                    <div className="reports-cal-week-label">Week {wi + 1}</div>
                    <div className="reports-cal-week-pnl">{formatMoney(weekPnl)}</div>
                    <div className="reports-cal-week-trades">{weekTrades} trades</div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsCalendar() {
  const ctx = useOutletContext() ?? {};
  const applied = ctx.appliedReportFilters ?? DEFAULT_REPORT_FILTERS;
  const { reportTrades: trades } = useRawAndReportTrades();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedYear = parseYear(searchParams);
  const closeBtnRef = useRef(/** @type {HTMLButtonElement | null} */ (null));

  const closeCalendarModal = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("expand");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  function setYear(y) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("year", String(y));
        const ex = next.get("expand");
        if (ex) {
          const parsed = /^(\d{4})-\d{1,2}$/.exec(String(ex).trim());
          if (parsed && Number(parsed[1]) !== y) next.delete("expand");
        }
        return next;
      },
      { replace: true },
    );
  }

  function resetYearToCurrent() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("year");
      next.delete("expand");
      return next;
    });
  }

  /** Push history when opening a month so the browser Back control returns to the year grid. */
  function openOrToggleMonth(key) {
    const cur = expandedMonthKeyFromSearch(searchParams, selectedYear);
    if (cur === key) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("expand");
          return next;
        },
        { replace: true },
      );
    } else {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("expand", key);
          return next;
        },
        { replace: false },
      );
    }
  }

  const calendarYear = new Date().getFullYear();
  const yearFromUrl = searchParams.get("year");
  const expandInUrl = Boolean(searchParams.get("expand"));
  const canResetYear =
    Boolean(yearFromUrl) || expandInUrl || selectedYear !== calendarYear;

  const yearChoices = [selectedYear - 2, selectedYear - 1, selectedYear];

  const filtered = filterTradesForReport(trades, reportFiltersForYearCalendar(applied));
  const yPrefix = `${selectedYear}-`;
  const inYear = filtered.filter((t) => String(t.date ?? "").startsWith(yPrefix));
  const grouped = groupTradesByDate(inYear);
  const openKey = expandedMonthKeyFromSearch(searchParams, selectedYear);
  const modalOpen = Boolean(openKey);
  const expandedMo = expandedMonthIndexFromKey(openKey);

  useEffect(() => {
    if (!modalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.requestAnimationFrame(() => {
      closeBtnRef.current?.focus();
    });
    function onKey(e) {
      if (e.key === "Escape") closeCalendarModal();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(t);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [modalOpen, closeCalendarModal]);

  const months = Array.from({ length: 12 }, (_, m) => {
    const key = `${selectedYear}-${m}`;
    const title = formatMonthTitle(selectedYear, m);
    const monthPnl = sumMonthPnl(grouped, selectedYear, m);
    const isActive = openKey === key;
    return (
      <div key={key} className={`card reports-month-card${isActive ? " is-cal-active" : ""}`}>
        <div className="month-card-header">
          <div className="reports-month-title-row">
            <h3>{title}</h3>
          </div>
          <button
            type="button"
            className={`month-open-btn ${isActive ? "active" : ""}`}
            onClick={() => openOrToggleMonth(key)}
            aria-expanded={isActive}
            aria-haspopup="dialog"
          >
            {isActive ? "Active" : "Open"}
          </button>
        </div>

        <MonthMiniGrid year={selectedYear} monthIndex={m} grouped={grouped} />

        <div className={`reports-month-summary ${pnlClass(monthPnl)}`}>
          Month: {formatMoney(monthPnl)}
        </div>
      </div>
    );
  });

  const modalNode =
    modalOpen && expandedMo != null ? (
      <div className="reports-cal-modal-backdrop" role="presentation" onClick={closeCalendarModal}>
        <div
          className="reports-cal-modal reports-cal-modal--single"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reports-cal-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="reports-cal-modal-toolbar">
            <h2 id="reports-cal-modal-title" className="reports-cal-modal-title">
              {formatMonthTitle(selectedYear, expandedMo)}
            </h2>
            <button
              ref={closeBtnRef}
              type="button"
              className="reports-cal-modal-close range-btn"
              onClick={closeCalendarModal}
            >
              Close
            </button>
          </div>
          <div className="reports-cal-modal-single-body">
            <MonthExpandedGrid year={selectedYear} monthIndex={expandedMo} grouped={grouped} />
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      <div className="reports-calendar-page-toolbar">
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
            title="Clear year from URL and show the current calendar year"
          >
            This year ({calendarYear})
          </button>
        </div>
      </div>
      <div className="reports-calendar-grid">{months}</div>

      {typeof document !== "undefined" && modalNode ? createPortal(modalNode, document.body) : null}
    </>
  );
}
