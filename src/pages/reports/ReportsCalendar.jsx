import { useEffect, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { groupTradesByDate, formatMoney, pnlClass } from "../../storage/storage";
import { useLiveTrades } from "../../hooks/useLiveTrades";
import { filterTradesForReport, DEFAULT_REPORT_FILTERS } from "../../lib/reportFilters";
import { getDayAggregate } from "../../lib/dashboardStats";
import { buildCalendarWeeks, formatMonthTitle, sumMonthPnl } from "../../lib/calendarGrid";
import MetricHintIcon from "../../components/MetricHintIcon";
import { REPORTS_CALENDAR_MONTH_HINT, REPORTS_CALENDAR_MONTHLY_PNL_HINT } from "../../lib/metricHints";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseYear(searchParams) {
  const y = Number(searchParams.get("year"));
  if (Number.isFinite(y) && y >= 1970 && y <= 2100) return y;
  return new Date().getFullYear();
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
          <span>
            Monthly P&amp;L: {formatMoney(monthPnl)}
          </span>
          <MetricHintIcon text={REPORTS_CALENDAR_MONTHLY_PNL_HINT} />
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
  const trades = useLiveTrades();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedYear = parseYear(searchParams);

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

  const calendarYear = new Date().getFullYear();
  const yearFromUrl = searchParams.get("year");
  const canResetYear = Boolean(yearFromUrl) || selectedYear !== calendarYear;

  const yearChoices = [selectedYear - 2, selectedYear - 1, selectedYear];

  const filtered = filterTradesForReport(trades, applied);
  const grouped = groupTradesByDate(filtered);
  const [openKey, setOpenKey] = useState(null);

  function toggleMonth(key) {
    setOpenKey((prev) => (prev === key ? null : key));
  }

  useEffect(() => {
    if (!openKey) return;
    document.querySelector(".reports-calendar-page-toolbar")?.scrollIntoView({ behavior: "smooth", block: "start" });
    const id = `reports-month-${openKey}`;
    const id2 = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id2);
  }, [openKey]);

  const months = Array.from({ length: 12 }, (_, m) => {
    const key = `${selectedYear}-${m}`;
    const title = formatMonthTitle(selectedYear, m);
    const monthPnl = sumMonthPnl(grouped, selectedYear, m);
    const isOpen = openKey === key;
    return (
      <div key={key} id={`reports-month-${key}`} className={`card reports-month-card ${isOpen ? "is-expanded" : ""}`}>
        <div className="month-card-header">
          <div className="reports-month-title-row">
            <h3>{title}</h3>
            <MetricHintIcon text={REPORTS_CALENDAR_MONTH_HINT} />
          </div>
          <button
            type="button"
            className={`month-open-btn ${isOpen ? "active" : ""}`}
            onClick={() => toggleMonth(key)}
            aria-expanded={isOpen}
          >
            {isOpen ? "Active" : "Open"}
          </button>
        </div>

        {isOpen ? (
          <MonthExpandedGrid year={selectedYear} monthIndex={m} grouped={grouped} />
        ) : (
          <MonthMiniGrid year={selectedYear} monthIndex={m} grouped={grouped} />
        )}

        {!isOpen && (
          <div className={`reports-month-summary ${pnlClass(monthPnl)}`}>
            Month: {formatMoney(monthPnl)}
          </div>
        )}
      </div>
    );
  });

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
    </>
  );
}
