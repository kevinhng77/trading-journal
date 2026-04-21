import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  PieChart,
  Pie,
  Label,
  LineChart,
  Line,
} from "recharts";
import { useRawAndReportTrades } from "../../hooks/useReportViewTrades";
import { filterTradesForReport, reportFiltersActive, DEFAULT_REPORT_FILTERS } from "../../lib/reportFilters";
import {
  computeDashboardStats,
  tradesInLastDays,
  computeProfitFactor,
  maxConsecutiveStreaks,
  aggregateByHour,
  aggregateByMonth,
  byWeekdayMonFirst,
  scratchTradeCount,
  computeTradePnlStdDev,
  aggregateByReportDurationBuckets,
  aggregateIntradayMultiday,
  aggregateByHoldMinuteBuckets,
  buildDailySeriesForRange,
  buildDrawdownSeries,
  aggregateByDetailedPriceBucket,
  aggregateByShareVolumeBucket,
  aggregateBySymbolPnL,
  symbolTopAndBottom,
  aggregateByCalendarDayTone,
  aggregateByNotionalBucket,
  aggregateByFillCountBucket,
  aggregateByAvgFillQtyBucket,
  grossWinLossTotals,
  aggregateByVolumeBucket,
} from "../../lib/dashboardStats";
import { formatMoney, pnlClass } from "../../storage/storage";
import {
  aggregateFilteredTradesMetrics,
  winRateVsRandomPValue,
  kellyFraction,
  systemQualityNumber,
  kRatioFromDailyPnL,
  tradeSignedAmountForAggregation,
} from "../../lib/tradeExecutionMetrics";
import { CHART_GREEN, CHART_RED } from "../../lib/chartPalette";
import MetricHintIcon from "../../components/MetricHintIcon";
import { detailedStatHint, REPORTS_STATS_BLOCK_HINT } from "../../lib/metricHints";
const GRID_STROKE = "#2a3140";
const AXIS_TICK = { fill: "#94a3b8", fontSize: 11 };

function DarkTooltip({ active, payload, label }) {
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

function ChartEmpty({ children }) {
  return <div className="chart-empty">{children}</div>;
}

function Stat({ label, value, valueClass, locked, hintText }) {
  const hint = hintText ?? detailedStatHint(label);
  return (
    <div className="reports-detailed-stat">
      <div className="reports-detailed-stat-label reports-detailed-stat-label--with-hint">
        <span className="reports-detailed-stat-label-text">{label}</span>
        {hint ? <MetricHintIcon text={hint} /> : null}
      </div>
      <div className={`reports-detailed-stat-value ${valueClass ?? ""}`}>
        {locked ? (
          <>
            — <small className="journal-lock">🔒</small>
          </>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

/** @typedef {{ label: string, value: import("react").ReactNode, valueClass?: string, locked?: boolean, labelTitle?: string }} StatSpec */
/** `labelTitle` overrides the default hint text for this label. */
/** @typedef {{ placeholder: true, text: string }} PlaceholderSpec */
/** @typedef {StatSpec | PlaceholderSpec | null} StatsCellSpec */

function StatsCell({ spec }) {
  if (!spec) {
    return <td className="reports-detailed-stat-td reports-detailed-stat-td--empty" aria-hidden />;
  }
  if ("placeholder" in spec && spec.placeholder) {
    return (
      <td className="reports-detailed-stat-td reports-detailed-stat-td--placeholder">
        <p className="reports-detailed-placeholder">{spec.text}</p>
      </td>
    );
  }
  const s = /** @type {StatSpec} */ (spec);
  const hintText = s.labelTitle ?? detailedStatHint(s.label);
  return (
    <td className="reports-detailed-stat-td">
      <Stat label={s.label} value={s.value} valueClass={s.valueClass} locked={s.locked} hintText={hintText} />
    </td>
  );
}

function formatMonthLabel(ym) {
  if (!ym || ym.length < 7) return ym || "";
  const [y, mo] = ym.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function ChartCard({ title, hint, children }) {
  return (
    <div className="card reports-detailed-chart-card">
      <div className="panel-title reports-chart-title">
        <span className="reports-chart-title-text">{title}</span>
        {hint ? <MetricHintIcon text={hint} /> : null}
      </div>
      <div className="reports-detailed-chart-area">{children}</div>
    </div>
  );
}

function HBarCount({ rows, valueKey = "trades", valueName = "Trades", yAxisWidth = 100 }) {
  const data = rows.filter((r) => (r[valueKey] ?? 0) > 0);
  if (!data.length) return <ChartEmpty>No data in this window.</ChartEmpty>;
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart layout="vertical" data={data} margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
        <XAxis type="number" tick={AXIS_TICK} stroke="#475569" domain={[0, max * 1.08]} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={yAxisWidth} tick={AXIS_TICK} stroke="#475569" />
        <Tooltip content={<DarkTooltip />} cursor={false} />
        <Bar dataKey={valueKey} name={valueName} fill={CHART_GREEN} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function HBarPnl({ rows, yAxisWidth = 100 }) {
  const data = rows.filter((r) => r.trades > 0 || Math.abs(r.pnl) > 1e-6);
  if (!data.length) return <ChartEmpty>No data in this window.</ChartEmpty>;
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.pnl)), 1);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart layout="vertical" data={data} margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
        <XAxis
          type="number"
          tick={AXIS_TICK}
          stroke="#475569"
          domain={[-maxAbs * 1.05, maxAbs * 1.05]}
          tickFormatter={(v) => `$${v}`}
        />
        <YAxis type="category" dataKey="name" width={yAxisWidth} tick={AXIS_TICK} stroke="#475569" />
        <ReferenceLine x={0} stroke="#64748b" />
        <Tooltip content={<DarkTooltip />} cursor={false} />
        <Bar dataKey="pnl" name="P&L" radius={[0, 4, 4, 0]}>
          {data.map((e) => (
            <Cell key={e.name} fill={e.pnl >= 0 ? CHART_GREEN : CHART_RED} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function WinLossDonutCompact({ pieData, winRate }) {
  if (!pieData.length) return <ChartEmpty>No trades in this window.</ChartEmpty>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <Pie
          data={pieData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius="58%"
          outerRadius="82%"
          paddingAngle={1.25}
          stroke="#12151f"
          strokeWidth={2}
        >
          {pieData.map((e) => (
            <Cell key={e.name} fill={e.color} />
          ))}
          <Label
            position="center"
            content={({ viewBox }) => {
              if (!viewBox || typeof viewBox.cx !== "number" || typeof viewBox.cy !== "number") return null;
              return (
                <text
                  x={viewBox.cx}
                  y={viewBox.cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#e2e8f0"
                  fontSize={13}
                  fontWeight={700}
                >
                  {winRate.toFixed(1)}% win
                </text>
              );
            }}
          />
        </Pie>
        <Tooltip content={<DarkTooltip />} cursor={false} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function LineMetric({ data, dataKey, name, stroke }) {
  if (!data.length) return <ChartEmpty>No data in this window.</ChartEmpty>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis dataKey="shortLabel" tick={AXIS_TICK} stroke="#475569" />
        <YAxis tick={AXIS_TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} width={52} />
        <ReferenceLine y={0} stroke="#64748b" />
        <Tooltip content={<DarkTooltip />} cursor={false} />
        <Line type="monotone" dataKey={dataKey} name={name} stroke={stroke} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const DETAIL_SUBTABS = [
  { id: "days", label: "Days / times" },
  { id: "price", label: "Price / volume" },
  { id: "instrument", label: "Instrument" },
  { id: "market", label: "Market behavior" },
  { id: "winloss", label: "Win / loss / expectation" },
  { id: "liq", label: "Liquidity" },
];

export default function ReportsDetailed() {
  const ctx = useOutletContext() ?? {};
  const applied = ctx.appliedReportFilters ?? DEFAULT_REPORT_FILTERS;
  const { reportTrades: trades } = useRawAndReportTrades();
  const [rangeDays, setRangeDays] = useState(30);
  const [subTab, setSubTab] = useState("days");

  const filtered = useMemo(() => filterTradesForReport(trades, applied), [trades, applied]);
  const scoped = useMemo(() => tradesInLastDays(filtered, rangeDays), [filtered, rangeDays]);
  const stats = useMemo(() => computeDashboardStats(scoped), [scoped]);
  const filtersOn = reportFiltersActive(applied);

  const profitFactor = useMemo(() => computeProfitFactor(scoped), [scoped]);
  const { maxConsecutiveWins, maxConsecutiveLosses } = useMemo(() => maxConsecutiveStreaks(scoped), [scoped]);
  const pfDisplay =
    profitFactor === null ? "∞" : Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : "—";

  const scratchN = useMemo(() => scratchTradeCount(scoped), [scoped]);
  const scratchPct = stats.tradeCount ? ((scratchN / stats.tradeCount) * 100).toFixed(1) : "0";
  const stdDev = useMemo(() => computeTradePnlStdDev(scoped), [scoped]);

  const execAgg = useMemo(() => aggregateFilteredTradesMetrics(scoped), [scoped]);
  const scopedHasFeeCols = useMemo(
    () =>
      scoped.some((t) =>
        (t.fills ?? []).some((f) => f && ("commission" in f || "miscFees" in f)),
      ),
    [scoped],
  );

  const kellyVal = useMemo(() => {
    if (!stats.tradeCount) return null;
    const p = stats.winCount / stats.tradeCount;
    return kellyFraction(p, stats.avgWin, stats.avgLoss);
  }, [stats.winCount, stats.tradeCount, stats.avgWin, stats.avgLoss]);

  const sqnVal = useMemo(() => systemQualityNumber(scoped, stdDev), [scoped, stdDev]);
  const kRatioVal = useMemo(() => kRatioFromDailyPnL(scoped), [scoped]);
  const pRandomVal = useMemo(
    () => winRateVsRandomPValue(stats.winCount, stats.tradeCount),
    [stats.winCount, stats.tradeCount],
  );

  const distinctDays = useMemo(() => new Set(scoped.map((t) => t.date).filter(Boolean)).size, [scoped]);
  const avgDailyPnl = distinctDays ? stats.totalPnl / distinctDays : 0;
  const avgTradePnl = stats.tradeCount ? stats.totalPnl / stats.tradeCount : 0;
  const totalVol = useMemo(() => scoped.reduce((s, t) => s + (Number(t.volume) || 0), 0), [scoped]);
  const avgDailyVol = distinctDays ? totalVol / distinctDays : 0;
  const avgPerShare =
    totalVol > 0 ? scoped.reduce((s, t) => s + tradeSignedAmountForAggregation(t), 0) / totalVol : 0;

  const wdMon = useMemo(() => byWeekdayMonFirst(stats.byWeekday), [stats.byWeekday]);
  const byHour = useMemo(() => aggregateByHour(scoped), [scoped]);
  const byMonth = useMemo(
    () =>
      aggregateByMonth(scoped).map((m) => ({
        ...m,
        name: formatMonthLabel(m.name),
      })),
    [scoped],
  );
  const byDur = useMemo(() => aggregateByReportDurationBuckets(scoped), [scoped]);
  const intraMulti = useMemo(() => aggregateIntradayMultiday(scoped, filtered), [scoped, filtered]);
  const byHoldMin = useMemo(() => aggregateByHoldMinuteBuckets(scoped), [scoped]);

  const byPriceDetail = useMemo(() => aggregateByDetailedPriceBucket(scoped), [scoped]);
  const byShareVol = useMemo(() => aggregateByShareVolumeBucket(scoped), [scoped]);
  const symbolRows = useMemo(() => aggregateBySymbolPnL(scoped), [scoped]);
  const symbol20 = useMemo(() => symbolTopAndBottom(symbolRows, 20), [symbolRows]);
  const byInstrumentVol = useMemo(() => aggregateByVolumeBucket(scoped), [scoped]);
  const byDayTone = useMemo(() => aggregateByCalendarDayTone(scoped), [scoped]);
  const byNotional = useMemo(() => aggregateByNotionalBucket(scoped), [scoped]);
  const byFillCount = useMemo(() => aggregateByFillCountBucket(scoped), [scoped]);
  const byAvgFillQty = useMemo(() => aggregateByAvgFillQtyBucket(scoped), [scoped]);
  const grossWL = useMemo(() => grossWinLossTotals(scoped), [scoped]);
  const dailySeries = useMemo(() => buildDailySeriesForRange(scoped, rangeDays), [scoped, rangeDays]);
  const drawdownSeries = useMemo(() => buildDrawdownSeries(dailySeries), [dailySeries]);

  const pieDataWinLoss = useMemo(() => {
    const rows = [];
    if (stats.winCount) rows.push({ name: "Winning", value: stats.winCount, color: CHART_GREEN });
    if (stats.lossCount) rows.push({ name: "Losing", value: stats.lossCount, color: CHART_RED });
    if (stats.breakevenCount) rows.push({ name: "Breakeven", value: stats.breakevenCount, color: "#64748b" });
    return rows;
  }, [stats.winCount, stats.lossCount, stats.breakevenCount]);

  const winLossCompareRows = useMemo(
    () => [
      { name: "Gross wins", pnl: grossWL.grossWins, trades: stats.winCount },
      { name: "Gross losses", pnl: grossWL.grossLosses, trades: stats.lossCount },
    ],
    [grossWL, stats.winCount, stats.lossCount],
  );

  const expectationRow = useMemo(
    () => [{ name: "Expectation", pnl: avgTradePnl, trades: stats.tradeCount }],
    [avgTradePnl, stats.tradeCount],
  );

  const statsDetailedRows = useMemo(() => {
    const winPct = stats.tradeCount ? ((stats.winCount / stats.tradeCount) * 100).toFixed(1) : "0";
    const lossPct = stats.tradeCount ? ((stats.lossCount / stats.tradeCount) * 100).toFixed(1) : "0";
    const holdWin =
      stats.hasHoldData && stats.avgHoldWin != null ? `${(stats.avgHoldWin / 60).toFixed(0)} min` : "—";
    const holdLoss =
      stats.hasHoldData && stats.avgHoldLoss != null ? `${(stats.avgHoldLoss / 60).toFixed(0)} min` : "—";
    const pRandom =
      pRandomVal != null ? `p=${pRandomVal.toFixed(3)} (two-sided vs 50% win rate)` : "—";

    /** @type {StatsCellSpec[][]} */
    const rows = [];

    rows.push(
      [
        { label: "Total gain/loss", value: formatMoney(stats.totalPnl), valueClass: pnlClass(stats.totalPnl) },
        { label: "Largest gain", value: formatMoney(stats.maxWin), valueClass: "green" },
        { label: "Largest loss", value: formatMoney(stats.maxLoss), valueClass: "red" },
      ],
      [
        { label: "Avg daily gain/loss", value: formatMoney(avgDailyPnl), valueClass: pnlClass(avgDailyPnl) },
        { label: "Avg daily volume", value: avgDailyVol.toFixed(0) },
        { label: "Avg per-share gain/loss", value: `$${avgPerShare.toFixed(4)}` },
      ],
      [
        { label: "Avg trade gain/loss", value: formatMoney(avgTradePnl), valueClass: pnlClass(avgTradePnl) },
        { label: "Avg winning trade", value: formatMoney(stats.avgWin), valueClass: "green" },
        { label: "Avg losing trade", value: formatMoney(stats.avgLoss), valueClass: "red" },
      ],
      [
        { label: "Total number of trades", value: String(stats.tradeCount) },
        { label: "Number of winning trades", value: `${stats.winCount} (${winPct}%)` },
        { label: "Number of losing trades", value: `${stats.lossCount} (${lossPct}%)` },
      ],
      [
        {
          label: "Avg win",
          value: stats.winCount > 0 ? formatMoney(stats.avgWin) : "—",
          valueClass: stats.winCount > 0 ? "green" : undefined,
        },
        {
          label: "Avg loss",
          value: stats.lossCount > 0 ? formatMoney(stats.avgLoss) : "—",
          valueClass: stats.lossCount > 0 ? "red" : undefined,
        },
        {
          label: "Avg R:R",
          labelTitle: "Average win ÷ |average loss| (mean winner size vs mean loser size).",
          value:
            stats.winCount > 0 &&
            stats.lossCount > 0 &&
            Math.abs(stats.avgLoss) > 1e-9
              ? (stats.avgWin / Math.abs(stats.avgLoss)).toFixed(2)
              : "—",
        },
      ],
      [
        { label: "Scratch trades", value: `${scratchN} (${scratchPct}%)` },
        { label: "Avg hold (winners)", value: holdWin },
        { label: "Avg hold (losers)", value: holdLoss },
      ],
      [
        { label: "Trade P&L std dev", value: `$${stdDev.toFixed(2)}` },
        { label: "Max consecutive wins", value: String(maxConsecutiveWins) },
        { label: "Max consecutive losses", value: String(maxConsecutiveLosses) },
      ],
      [
        { label: "Kelly %", value: kellyVal != null ? `${(kellyVal * 100).toFixed(1)}%` : "—" },
        { label: "SQN", value: sqnVal != null ? sqnVal.toFixed(2) : "—" },
        { label: "Probability (random)", value: pRandom },
      ],
      [
        {
          label: "Total commissions",
          value: scopedHasFeeCols ? formatMoney(-execAgg.totalCommissionsPaid) : "—",
          valueClass: scopedHasFeeCols ? pnlClass(-execAgg.totalCommissionsPaid) : undefined,
        },
        { label: "K-ratio", value: kRatioVal != null ? kRatioVal.toFixed(2) : "—" },
        { label: "Profit factor", value: pfDisplay },
      ],
      [
        {
          label: "Avg position MAE",
          value: execAgg.avgReplayMae != null ? formatMoney(-execAgg.avgReplayMae) : "—",
          valueClass: execAgg.avgReplayMae != null ? "red" : undefined,
        },
        {
          label: "Total fees",
          value: scopedHasFeeCols ? formatMoney(-execAgg.totalFeesPaid) : "—",
          valueClass: scopedHasFeeCols ? pnlClass(-execAgg.totalFeesPaid) : undefined,
        },
        stats.hasMfeMae
          ? { label: "Avg MFE", value: formatMoney(stats.avgMfe), valueClass: "green" }
          : { placeholder: true, text: "Optional MFE/MAE on trades unlocks excursion stats." },
      ],
      [
        {
          label: "Avg position MFE",
          value: execAgg.avgReplayMfe != null ? formatMoney(execAgg.avgReplayMfe) : "—",
          valueClass: execAgg.avgReplayMfe != null ? "green" : undefined,
        },
        null,
        stats.hasMfeMae
          ? { label: "Avg MAE", value: formatMoney(stats.avgMae), valueClass: "red" }
          : null,
      ],
    );

    return rows;
  }, [
    stats,
    avgDailyPnl,
    avgTradePnl,
    scratchN,
    scratchPct,
    stdDev,
    kellyVal,
    scopedHasFeeCols,
    execAgg,
    avgDailyVol,
    avgPerShare,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    sqnVal,
    kRatioVal,
    pRandomVal,
    pfDisplay,
  ]);

  return (
    <>
      <div className="reports-overview-toolbar">
        <p className="reports-filter-summary">
          <strong>{scoped.length}</strong> trades in last {rangeDays} days
          {filtersOn ? (
            <>
              {" "}
              (after filters on <strong>{filtered.length}</strong> total matches)
            </>
          ) : null}
          .
        </p>
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
      </div>

      <div className="card reports-detailed-card">
        <div className="reports-detailed-title-row">
          <h2 className="reports-detailed-title">Stats</h2>
          <MetricHintIcon text={REPORTS_STATS_BLOCK_HINT} />
        </div>
        <p className="reports-detailed-sub">
          Filtered trades in the selected day window (same strip as Overview). Gross figures unless noted.
        </p>
        <div className="reports-detailed-stats-wrap">
          <table className="reports-detailed-stats-table">
            <tbody>
              {statsDetailedRows.map((cells, ri) => (
                <tr key={ri}>
                  {cells.map((spec, ci) => (
                    <StatsCell key={ci} spec={spec} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="reports-detailed-subtabs">
        {DETAIL_SUBTABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`reports-detailed-subtab ${subTab === t.id ? "active" : ""}`}
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "market" && (
        <p className="reports-detailed-panel-hint">
          Day tone uses your net P&amp;L for each calendar day (all trades that day in this window). Notional ≈ |avg fill ×
          volume| when fills exist.
        </p>
      )}
      {subTab === "liq" && (
        <p className="reports-detailed-panel-hint">
          Liquidity-style splits from execution data: how many fills per trade and typical fill size.
        </p>
      )}

      {subTab === "days" && (
        <div className="reports-detailed-widgets">
          <div className="reports-detailed-widget-row">
            <ChartCard title="Trade distribution by day of week" hint="Trade count per weekday (Mon–Sun)">
              <HBarCount rows={wdMon.map((w) => ({ name: w.name, trades: w.trades }))} />
            </ChartCard>
            <ChartCard title="Performance by day of week" hint="Sum of P&amp;L per weekday">
              <HBarPnl rows={wdMon.map((w) => ({ name: w.name, pnl: w.pnl, trades: w.trades }))} />
            </ChartCard>
          </div>
          <div className="reports-detailed-widget-row">
            <ChartCard title="Trade distribution by hour of day" hint="Opening time on trade row">
              <HBarCount rows={byHour.map((h) => ({ name: h.name, trades: h.trades }))} />
            </ChartCard>
            <ChartCard title="Performance by hour of day" hint="Sum of P&amp;L by hour">
              <HBarPnl rows={byHour} />
            </ChartCard>
          </div>
          <div className="reports-detailed-widget-row">
            <ChartCard title="Trade distribution by month" hint="Count per calendar month">
              <HBarCount rows={byMonth.map((m) => ({ name: m.name, trades: m.trades }))} />
            </ChartCard>
            <ChartCard title="Performance by month" hint="P&amp;L per calendar month">
              <HBarPnl rows={byMonth} />
            </ChartCard>
          </div>
          <div className="reports-detailed-widget-row">
            <ChartCard title="Trade distribution by session length" hint="First to last fill on trade date">
              <HBarCount rows={byDur.map((d) => ({ name: d.name, trades: d.trades }))} />
            </ChartCard>
            <ChartCard title="Performance by session length" hint="P&amp;L by duration bucket">
              <HBarPnl rows={byDur} />
            </ChartCard>
          </div>
          <div className="reports-detailed-widget-row">
            <ChartCard title="Intraday vs multiday (count)" hint="Multiday when fills span multiple dates">
              <HBarCount rows={intraMulti} />
            </ChartCard>
            <ChartCard title="Intraday vs multiday (P&amp;L)" hint="Sum of P&amp;L">
              <HBarPnl rows={intraMulti} />
            </ChartCard>
          </div>
          <div className="reports-detailed-widget-row">
            <ChartCard title="Trade distribution by intraday hold" hint="Minutes from first to last fill">
              <HBarCount rows={byHoldMin.map((d) => ({ name: d.name, trades: d.trades }))} />
            </ChartCard>
            <ChartCard title="Performance by intraday hold" hint="P&amp;L by hold-time bucket">
              <HBarPnl rows={byHoldMin} />
            </ChartCard>
          </div>
        </div>
      )}

      {subTab === "price" && (
        <div className="reports-detailed-widgets">
          <div className="reports-detailed-widget-row">
            <ChartCard title="Trade distribution by price" hint="Average fill price (VWAP) per trade">
              <HBarCount rows={byPriceDetail.map((r) => ({ name: r.name, trades: r.trades }))} />
            </ChartCard>
            <ChartCard title="Performance by price" hint="Sum of P&amp;L by fill-price bucket">
              <HBarPnl rows={byPriceDetail} />
            </ChartCard>
          </div>
          <div className="reports-detailed-widget-row">
            <ChartCard title="Distribution by volume traded" hint="Per-trade total volume (shares/contracts)">
              <HBarCount rows={byShareVol.map((r) => ({ name: r.name, trades: r.trades }))} />
            </ChartCard>
            <ChartCard title="Performance by volume traded" hint="P&amp;L by share-volume bucket">
              <HBarPnl rows={byShareVol} />
            </ChartCard>
          </div>
        </div>
      )}

      {subTab === "instrument" && (
        <div className="reports-detailed-widgets">
          <div className="reports-detailed-widget-row">
            <ChartCard title="Performance by symbol — top 20" hint="Highest total P&amp;L per ticker">
              <HBarPnl rows={symbol20.top} yAxisWidth={76} />
            </ChartCard>
            <ChartCard title="Performance by symbol — bottom 20" hint="Lowest total P&amp;L per ticker">
              <HBarPnl rows={symbol20.bottom} yAxisWidth={76} />
            </ChartCard>
          </div>
          <div className="reports-detailed-widget-row">
            <ChartCard title="Distribution by instrument volume" hint="Total shares/contracts on the trade row">
              <HBarCount rows={byInstrumentVol.map((r) => ({ name: r.name, trades: r.trades }))} />
            </ChartCard>
            <ChartCard title="Performance by instrument volume" hint="P&amp;L by cumulative volume bucket">
              <HBarPnl rows={byInstrumentVol} />
            </ChartCard>
          </div>
        </div>
      )}

      {subTab === "market" && (
        <div className="reports-detailed-widgets">
          <div className="reports-detailed-widget-row">
            <ChartCard title="Trade distribution by calendar day tone" hint="Green / flat / red = that day’s net P&amp;L">
              <HBarCount rows={byDayTone.map((r) => ({ name: r.name, trades: r.trades }))} yAxisWidth={140} />
            </ChartCard>
            <ChartCard title="Performance by calendar day tone" hint="Your P&amp;L on trades opened on those days">
              <HBarPnl rows={byDayTone} yAxisWidth={140} />
            </ChartCard>
          </div>
          <div className="reports-detailed-widget-row">
            <ChartCard title="Trade distribution by notional" hint="Approx. dollars at risk (avg fill × volume)">
              <HBarCount rows={byNotional.map((r) => ({ name: r.name, trades: r.trades }))} yAxisWidth={120} />
            </ChartCard>
            <ChartCard title="Performance by notional" hint="Sum of P&amp;L by size bucket">
              <HBarPnl rows={byNotional} yAxisWidth={120} />
            </ChartCard>
          </div>
        </div>
      )}

      {subTab === "winloss" && (
        <div className="reports-detailed-widgets">
          <div className="reports-detailed-widget-row">
            <ChartCard title="Win / loss ratio" hint="Share of trades by outcome">
              <WinLossDonutCompact pieData={pieDataWinLoss} winRate={stats.winRate} />
            </ChartCard>
            <ChartCard title="Win / loss P&amp;L comparison" hint="Gross dollars from winners vs losers">
              <HBarPnl rows={winLossCompareRows} />
            </ChartCard>
          </div>
          <div className="reports-detailed-widget-row">
            <ChartCard title="Trade expectation" hint="Average P&amp;L per trade in this window">
              <HBarPnl rows={expectationRow} />
            </ChartCard>
            <ChartCard title="Cumulative P&amp;L" hint="Running total by calendar day in the selected range">
              <LineMetric data={dailySeries} dataKey="cumulative" name="Cumulative P&amp;L" stroke={CHART_GREEN} />
            </ChartCard>
          </div>
          <div className="reports-detailed-widget-row reports-detailed-widget-row--single">
            <ChartCard title="Cumulative drawdown" hint="Cumulative P&amp;L minus peak-to-date (same daily series)">
              <LineMetric data={drawdownSeries} dataKey="drawdown" name="Drawdown" stroke={CHART_RED} />
            </ChartCard>
          </div>
        </div>
      )}

      {subTab === "liq" && (
        <div className="reports-detailed-widgets">
          <div className="reports-detailed-widget-row">
            <ChartCard title="Trade distribution by fill count" hint="Number of execution rows per trade">
              <HBarCount rows={byFillCount.map((r) => ({ name: r.name, trades: r.trades }))} yAxisWidth={120} />
            </ChartCard>
            <ChartCard title="Performance by fill count" hint="P&amp;L grouped by execution count">
              <HBarPnl rows={byFillCount} yAxisWidth={120} />
            </ChartCard>
          </div>
          <div className="reports-detailed-widget-row">
            <ChartCard title="Trade distribution by avg fill size" hint="Mean |quantity| per fill when fills exist">
              <HBarCount rows={byAvgFillQty.map((r) => ({ name: r.name, trades: r.trades }))} yAxisWidth={120} />
            </ChartCard>
            <ChartCard title="Performance by avg fill size" hint="P&amp;L by typical fill size bucket">
              <HBarPnl rows={byAvgFillQty} yAxisWidth={120} />
            </ChartCard>
          </div>
        </div>
      )}
    </>
  );
}
