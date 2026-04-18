import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { groupTradesByDate, formatMoney, pnlClass } from "../storage/storage";
import { useLiveTrades } from "../hooks/useLiveTrades";
import {
  getWeekDatesMondayStart,
  getDayAggregate,
  tradesInLastDays,
  buildDailySeriesForRange,
  computeDashboardStats,
  buildDrawdownSeries,
  computeProfitFactor,
  maxConsecutiveStreaks,
  aggregateByHour,
  aggregateByPriceBucket,
  aggregateByVolumeBucket,
  aggregateByMonth,
  aggregateByTag,
  dashboardWeekAnchorDate,
} from "../lib/dashboardStats";
import { CHART_GREEN, CHART_RED } from "../lib/chartPalette";
import { DashboardBento } from "./DashboardBento";
const CHART_MUTED = "#8b95a8";

function JournalGlyph() {
  return (
    <svg className="dashboard-day-journal-icon" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M7 3h8l4 4v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm7 1.5V8h3.5L14 4.5zM8 12h8v1.5H8V12zm0 3.5h8V17H8v-1.5z"
      />
    </svg>
  );
}

function Dashboard() {
  const [rangeDays, setRangeDays] = useState(30);

  const allTrades = useLiveTrades();
  const groupedAll = useMemo(() => groupTradesByDate(allTrades), [allTrades]);
  const weekAnchor = useMemo(() => dashboardWeekAnchorDate(allTrades), [allTrades]);
  const weekDates = getWeekDatesMondayStart(weekAnchor);
  const a = new Date(`${weekDates[0]}T12:00:00`);
  const b = new Date(`${weekDates[6]}T12:00:00`);
  const weekLabel = `${a.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${b.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  const tradesScoped = useMemo(() => tradesInLastDays(allTrades, rangeDays), [allTrades, rangeDays]);
  const dailySeries = useMemo(() => buildDailySeriesForRange(tradesScoped, rangeDays), [tradesScoped, rangeDays]);
  const drawdownSeries = useMemo(() => buildDrawdownSeries(dailySeries), [dailySeries]);
  const stats = useMemo(() => computeDashboardStats(tradesScoped), [tradesScoped]);
  const profitFactor = useMemo(() => computeProfitFactor(tradesScoped), [tradesScoped]);
  const { maxConsecutiveWins: maxWinStreak, maxConsecutiveLosses: maxLossStreak } = useMemo(
    () => maxConsecutiveStreaks(tradesScoped),
    [tradesScoped],
  );
  const byHour = useMemo(() => aggregateByHour(tradesScoped), [tradesScoped]);
  const byPrice = useMemo(() => aggregateByPriceBucket(tradesScoped), [tradesScoped]);
  const byVolume = useMemo(() => aggregateByVolumeBucket(tradesScoped), [tradesScoped]);
  const byMonth = useMemo(() => aggregateByMonth(tradesScoped), [tradesScoped]);
  const byTag = useMemo(() => aggregateByTag(tradesScoped), [tradesScoped]);
  const pieData = useMemo(() => {
    const rows = [
      { name: "Winning", value: stats.winCount, color: CHART_GREEN },
      { name: "Losing", value: stats.lossCount, color: CHART_RED },
    ];
    if (stats.breakevenCount > 0) {
      rows.push({ name: "Breakeven", value: stats.breakevenCount, color: "#525a6c" });
    }
    return rows.filter((d) => d.value > 0);
  }, [stats.winCount, stats.lossCount, stats.breakevenCount]);

  const holdBarData = useMemo(() => {
    if (!stats.hasHoldData) return [];
    return [
      {
        name: "Winners",
        hours: stats.avgHoldWin != null ? stats.avgHoldWin / 60 : 0,
        fill: CHART_GREEN,
      },
      {
        name: "Losers",
        hours: stats.avgHoldLoss != null ? stats.avgHoldLoss / 60 : 0,
        fill: CHART_RED,
      },
    ];
  }, [stats]);

  const avgWinLossData = useMemo(
    () => [
      { name: "Avg win", value: stats.avgWin, fill: CHART_GREEN },
      { name: "Avg loss", value: Math.abs(stats.avgLoss), fill: CHART_RED },
    ],
    [stats.avgWin, stats.avgLoss],
  );

  const largestData = useMemo(
    () => [
      { name: "Largest win", value: stats.maxWin, fill: CHART_GREEN },
      { name: "Largest loss", value: Math.abs(stats.maxLoss), fill: CHART_RED },
    ],
    [stats.maxWin, stats.maxLoss],
  );

  const mfeMaeData = useMemo(() => {
    if (!stats.hasMfeMae) return [];
    return [
      { name: "Avg MFE", value: Math.abs(stats.avgMfe), fill: CHART_GREEN },
      { name: "Avg MAE", value: Math.abs(stats.avgMae), fill: CHART_RED },
    ];
  }, [stats]);

  const winRateBar = useMemo(() => [{ name: "Win %", value: Number(stats.winRate.toFixed(1)) }], [stats.winRate]);

  return (
    <div className="page-wrap dashboard-page-wrap">
      <div className="page-header">
        <h1>Dashboard</h1>
        <div className="page-header-actions">
          <div className="range-toggle">
            {[30, 60, 90].map((n) => (
              <button
                key={n}
                type="button"
                className={`range-btn ${rangeDays === n ? "active" : ""}`}
                onClick={() => setRangeDays(n)}
              >
                {n} days
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="card dashboard-days-card">
        <div className="dashboard-week-heading">
          <h2 className="section-title">This week</h2>
          <span className="dashboard-week-range">{weekLabel}</span>
        </div>

        <div className="dashboard-day-grid">
          {weekDates.map((dateStr) => {
            const day = getDayAggregate(groupedAll, dateStr);
            const d = new Date(`${dateStr}T12:00:00`);
            const dayNum = d.getDate();
            const dow = d.toLocaleDateString(undefined, { weekday: "short" });
            return (
              <Link
                key={dateStr}
                to={`/journal?date=${encodeURIComponent(dateStr)}`}
                className="dashboard-day-tile dashboard-day-link"
              >
                <JournalGlyph />
                <div className="dashboard-day-top">
                  <span className="dashboard-day-number">{dayNum}</span>
                  <span className="dashboard-day-name">{dow}</span>
                </div>
                <div className={`dashboard-day-pnl ${pnlClass(day.pnl)}`}>{formatMoney(day.pnl)}</div>
                <div className="dashboard-day-trades">
                  {day.trades} {day.trades === 1 ? "trade" : "trades"}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <DashboardBento
        rangeDays={rangeDays}
        tradesScoped={tradesScoped}
        dailySeries={dailySeries}
        drawdownSeries={drawdownSeries}
        stats={stats}
        pieData={pieData}
        holdBarData={holdBarData}
        avgWinLossData={avgWinLossData}
        largestData={largestData}
        mfeMaeData={mfeMaeData}
        winRateBar={winRateBar}
        byHour={byHour}
        byPrice={byPrice}
        byVolume={byVolume}
        byMonth={byMonth}
        byTag={byTag}
        profitFactor={profitFactor}
        maxWinStreak={maxWinStreak}
        maxLossStreak={maxLossStreak}
      />
    </div>
  );
}

export default Dashboard;
