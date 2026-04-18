import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { useRawAndReportTrades } from "../../hooks/useReportViewTrades";
import { filterTradesForReport, reportFiltersActive, DEFAULT_REPORT_FILTERS } from "../../lib/reportFilters";
import {
  tradesInLastDays,
  buildDailySeriesForRange,
  buildDailySeriesForDateSpan,
  buildDrawdownSeries,
  analyzeDrawdownEpisodes,
  drawdownWorseningByWeekday,
  dailyPnlByWeekdayMonFri,
  cumulativeMovingAverageSeries,
  dailyPnlRollingStdDevSeries,
  tradePnlMovingAverageSeries,
  localISODate,
} from "../../lib/dashboardStats";
import { CHART_RED, CHART_RED_FILL_SOFT, CHART_GREEN } from "../../lib/chartPalette";
import MetricHintIcon from "../../components/MetricHintIcon";
import {
  REPORTS_DRAWDOWN_CHART_HINT,
  REPORTS_DRAWDOWN_WORSEN_WEEKDAY_HINT,
  REPORTS_DRAWDOWN_DOW_PNL_HINT,
  REPORTS_DRAWDOWN_CUM_MA_HINT,
  REPORTS_DRAWDOWN_VOL_HINT,
  REPORTS_DRAWDOWN_EXPECT_HINT,
  drawdownStatHint,
} from "../../lib/metricHints";
import { formatMoney, pnlClass } from "../../storage/storage";

const GRID = "#2a3140";
const TICK = { fill: "#94a3b8", fontSize: 10 };
const BAR_AXIS = { fill: "#94a3b8", fontSize: 10 };

function SimpleTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      {label != null && <div className="chart-tooltip-label">{label}</div>}
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="chart-tooltip-row">
          <span>{p.name}</span>
          <span>{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

/** @param {{ label: string, value: string, valueClass?: string }} props */
function DrawStat({ label, value, valueClass }) {
  const hint = drawdownStatHint(label);
  return (
    <div className="reports-drawdown-stat">
      <div className="reports-drawdown-stat-label reports-detailed-stat-label--with-hint">
        <span className="reports-detailed-stat-label-text">{label}</span>
        {hint ? <MetricHintIcon text={hint} /> : null}
      </div>
      <div className={`reports-drawdown-stat-value ${valueClass ?? ""}`}>{value}</div>
    </div>
  );
}

function ChartEmpty({ children }) {
  return <div className="chart-empty">{children}</div>;
}

/** Underwater from peak cumulative P&amp;L, with Tradervue-style summaries and companion charts. */
export default function ReportsDrawdown() {
  const ctx = useOutletContext() ?? {};
  const applied = ctx.appliedReportFilters ?? DEFAULT_REPORT_FILTERS;
  const { reportTrades: trades } = useRawAndReportTrades();
  const [rangeDays, setRangeDays] = useState(30);

  const filtered = useMemo(() => filterTradesForReport(trades, applied), [trades, applied]);
  const filtersOn = reportFiltersActive(applied);
  const dateFrom = String(applied.dateFrom ?? "").trim();
  const dateTo = String(applied.dateTo ?? "").trim();
  const usesReportDateSpan = Boolean(dateFrom || dateTo);

  const scopedTrades = useMemo(() => {
    if (usesReportDateSpan) return filtered;
    return tradesInLastDays(filtered, rangeDays);
  }, [usesReportDateSpan, filtered, rangeDays]);

  const daily = useMemo(() => {
    if (usesReportDateSpan) {
      const tradeDates = filtered.map((t) => t.date).filter(Boolean).sort();
      const minT = tradeDates[0] ?? null;
      const maxT = tradeDates.length ? tradeDates[tradeDates.length - 1] : null;
      const today = localISODate(new Date());

      let start = dateFrom || minT || maxT || today;
      let end = dateTo || maxT || minT || today;
      if (!filtered.length) {
        start = dateFrom || dateTo || today;
        end = dateTo || dateFrom || start;
      }
      if (start > end) {
        const t = start;
        start = end;
        end = t;
      }
      return buildDailySeriesForDateSpan(filtered, start, end);
    }
    return buildDailySeriesForRange(scopedTrades, rangeDays);
  }, [filtered, usesReportDateSpan, dateFrom, dateTo, rangeDays, scopedTrades]);

  const dd = useMemo(() => buildDrawdownSeries(daily), [daily]);
  const summary = useMemo(() => analyzeDrawdownEpisodes(dd), [dd]);
  const worsenByDow = useMemo(() => drawdownWorseningByWeekday(dd), [dd]);
  const dowPnl = useMemo(() => dailyPnlByWeekdayMonFri(daily), [daily]);
  const cumMa = useMemo(() => cumulativeMovingAverageSeries(daily, 20), [daily]);
  const volSeries = useMemo(() => dailyPnlRollingStdDevSeries(daily, 10), [daily]);
  const expectSeries = useMemo(() => tradePnlMovingAverageSeries(scopedTrades, 20), [scopedTrades]);

  const dateSpanLabel =
    daily.length > 0 ? `${daily[0].date} → ${daily[daily.length - 1].date}` : "";

  const avgDdStr =
    summary.avgDrawdown == null ? "—" : formatMoney(summary.avgDrawdown);
  const maxDdStr = formatMoney(summary.maxDrawdown);
  const avgDaysStr =
    summary.avgDaysPerEpisode == null ? "—" : summary.avgDaysPerEpisode.toFixed(1);
  const avgTrStr =
    summary.avgTradesPerEpisode == null ? "—" : summary.avgTradesPerEpisode.toFixed(1);

  const hasBars = daily.length > 0;

  return (
    <>
      <div className="reports-overview-toolbar">
        <p className="reports-filter-summary">
          <strong>Drawdown</strong> — cumulative P&amp;L vs running peak (negative = underwater). Companion charts use the
          same day window as the main series.
          {usesReportDateSpan ? (
            <>
              {" "}
              Window follows your <strong>date from / date to</strong> filters
              {dateSpanLabel ? <> ({dateSpanLabel})</> : null}.
            </>
          ) : (
            <> Use <strong>30 / 60 / 90 Days</strong> or set explicit dates in the filter strip.</>
          )}
          {filtersOn && !usesReportDateSpan ? (
            <>
              {" "}
              Using <strong>{filtered.length}</strong> trades matching filters.
            </>
          ) : null}
          {filtersOn && usesReportDateSpan ? (
            <>
              {" "}
              <strong>{filtered.length}</strong> trades in range after filters.
            </>
          ) : null}
        </p>
        {!usesReportDateSpan ? (
          <div className="range-toggle">
            {[30, 60, 90].map((n) => (
              <button
                key={n}
                type="button"
                className={`range-btn ${rangeDays === n ? "active" : ""}`}
                onClick={() => setRangeDays(n)}
              >
                {n} Days
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card reports-drawdown-stats">
        <div className="reports-drawdown-stats-grid">
          <DrawStat label="Average drawdown" value={avgDdStr} valueClass={summary.avgDrawdown == null ? "" : pnlClass(summary.avgDrawdown)} />
          <DrawStat label="Biggest drawdown" value={maxDdStr} valueClass={pnlClass(summary.maxDrawdown)} />
          <DrawStat label="Average number of days in drawdown" value={avgDaysStr} />
          <DrawStat label="Number of days in drawdown" value={String(summary.daysInDrawdown)} />
          <DrawStat label="Average trades in drawdown" value={avgTrStr} />
        </div>
        {summary.episodeCount === 0 && hasBars ? (
          <p className="reports-drawdown-stats-note">No underwater episodes in this window (equity stayed at the peak).</p>
        ) : null}
      </div>

      <div className="card reports-detailed-chart-card reports-drawdown-main-card">
        <div className="panel-title reports-chart-title">
          <span className="reports-chart-title-text">Drawdown ({daily.length} days)</span>
          <MetricHintIcon text={REPORTS_DRAWDOWN_CHART_HINT} />
        </div>
        <div className="reports-detailed-chart-area" style={{ height: 280 }}>
          {hasBars ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dd} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="shortLabel" tick={TICK} stroke="#475569" interval="preserveStartEnd" />
                <YAxis tick={TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} width={56} />
                <Tooltip content={<SimpleTip />} />
                <Area
                  type="monotone"
                  dataKey="drawdown"
                  name="Drawdown $"
                  stroke={CHART_RED}
                  fill={CHART_RED_FILL_SOFT}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty>No days in this window.</ChartEmpty>
          )}
        </div>
      </div>

      <div className="reports-drawdown-chart-grid">
        <div className="card reports-detailed-chart-card">
          <div className="panel-title reports-chart-title">
            <span className="reports-chart-title-text">Drawdown increase by weekday</span>
            <MetricHintIcon text={REPORTS_DRAWDOWN_WORSEN_WEEKDAY_HINT} />
          </div>
          <div className="reports-detailed-chart-area reports-drawdown-hbar-area">
            {hasBars ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={worsenByDow} margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={BAR_AXIS} stroke="#475569" tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" width={40} tick={BAR_AXIS} stroke="#475569" />
                  <Tooltip content={<SimpleTip />} cursor={false} />
                  <Bar dataKey="amount" name="Added to DD" fill="#f97316" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty>No data.</ChartEmpty>
            )}
          </div>
        </div>

        <div className="card reports-detailed-chart-card">
          <div className="panel-title reports-chart-title">
            <span className="reports-chart-title-text">P&amp;L by weekday</span>
            <MetricHintIcon text={REPORTS_DRAWDOWN_DOW_PNL_HINT} />
          </div>
          <div className="reports-detailed-chart-area reports-drawdown-hbar-area">
            {hasBars ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={dowPnl} margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={BAR_AXIS} stroke="#475569" tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" width={40} tick={BAR_AXIS} stroke="#475569" />
                  <Tooltip content={<SimpleTip />} cursor={false} />
                  <Bar dataKey="pnl" name="Net P&amp;L" radius={[0, 4, 4, 0]}>
                    {dowPnl.map((e) => (
                      <Cell key={e.name} fill={e.pnl >= 0 ? CHART_GREEN : CHART_RED} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty>No data.</ChartEmpty>
            )}
          </div>
        </div>

        <div className="card reports-detailed-chart-card">
          <div className="panel-title reports-chart-title">
            <span className="reports-chart-title-text">Cumulative P&amp;L (20d MA)</span>
            <MetricHintIcon text={REPORTS_DRAWDOWN_CUM_MA_HINT} />
          </div>
          <div className="reports-detailed-chart-area reports-drawdown-line-area">
            {hasBars ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumMa} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="shortLabel" tick={TICK} stroke="#475569" interval="preserveStartEnd" />
                  <YAxis tick={TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} width={52} />
                  <Tooltip content={<SimpleTip />} />
                  <Line type="monotone" dataKey="cumulative" name="Cumulative" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="cumMa" name="20d MA" stroke="#38bdf8" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty>No data.</ChartEmpty>
            )}
          </div>
        </div>

        <div className="card reports-detailed-chart-card">
          <div className="panel-title reports-chart-title">
            <span className="reports-chart-title-text">Daily P&amp;L volatility (10d)</span>
            <MetricHintIcon text={REPORTS_DRAWDOWN_VOL_HINT} />
          </div>
          <div className="reports-detailed-chart-area reports-drawdown-line-area">
            {hasBars ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={volSeries} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="shortLabel" tick={TICK} stroke="#475569" interval="preserveStartEnd" />
                  <YAxis tick={TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} width={52} />
                  <Tooltip content={<SimpleTip />} />
                  <Line type="monotone" dataKey="pnlVol" name="σ daily P&amp;L" stroke="#c084fc" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty>No data.</ChartEmpty>
            )}
          </div>
        </div>

        <div className="card reports-detailed-chart-card reports-drawdown-span-2">
          <div className="panel-title reports-chart-title">
            <span className="reports-chart-title-text">Avg trade P&amp;L (20-trade MA)</span>
            <MetricHintIcon text={REPORTS_DRAWDOWN_EXPECT_HINT} />
          </div>
          <div className="reports-detailed-chart-area reports-drawdown-expect-area">
            {expectSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={expectSeries} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="index" tick={TICK} stroke="#475569" label={{ value: "Trade #", position: "insideBottom", offset: -2, fill: "#64748b", fontSize: 11 }} />
                  <YAxis tick={TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} width={52} />
                  <Tooltip content={<SimpleTip />} />
                  <Line type="monotone" dataKey="tradeAvgPnl" name="Avg P&amp;L" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty>No trades in this window.</ChartEmpty>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
