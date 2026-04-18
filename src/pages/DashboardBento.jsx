import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Label,
  BarChart,
  Bar,
} from "recharts";
import { formatMoney, pnlClass } from "../storage/storage";
import { CHART_GREEN, CHART_RED } from "../lib/chartPalette";
import MetricHintIcon from "../components/MetricHintIcon";
import { DASHBOARD_STAT_TILE_HINTS, detailedStatHint } from "../lib/metricHints";
const GRID_STROKE = "#2a3140";
const AXIS_TICK = { fill: "#94a3b8", fontSize: 11 };

export function DarkTooltip({ active, payload, label }) {
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

export function ChartEmpty({ children }) {
  return <div className="chart-empty">{children}</div>;
}

/** @param {object} props @param {Record<string, number>} [props.viewBox] @param {number} props.winRate */
function WinLossDonutCenter({ viewBox, winRate }) {
  if (!viewBox) return null;
  const cx =
    typeof viewBox.cx === "number"
      ? viewBox.cx
      : typeof viewBox.x === "number" && typeof viewBox.width === "number"
        ? viewBox.x + viewBox.width / 2
        : null;
  const cy =
    typeof viewBox.cy === "number"
      ? viewBox.cy
      : typeof viewBox.y === "number" && typeof viewBox.height === "number"
        ? viewBox.y + viewBox.height / 2
        : null;
  if (cx == null || cy == null) return null;
  const pct = typeof winRate === "number" && Number.isFinite(winRate) ? `${winRate.toFixed(1)}%` : "—";
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="dashboard-donut-center">
      <tspan x={cx} dy="-0.32em" className="dashboard-donut-pct">
        {pct}
      </tspan>
      <tspan x={cx} dy="1.28em" className="dashboard-donut-sub">
        Win rate
      </tspan>
    </text>
  );
}

export function StatTile({ label, value, hint }) {
  return (
    <div className="card dashboard-stat-tile">
      <div className="dashboard-stat-tile-label-row">
        <div className="dashboard-stat-tile-label">{label}</div>
        {hint ? <MetricHintIcon text={hint} /> : null}
      </div>
      <div className="dashboard-stat-tile-value">{value}</div>
    </div>
  );
}

/** @param {{ name: string, pnl: number }[]} rows */
export function RankedBarList({ rows, empty }) {
  if (!rows.length) {
    return <ChartEmpty>{empty}</ChartEmpty>;
  }
  const max = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1e-6);
  return (
    <div className="dashboard-ranked-list">
      {rows.map((r) => (
        <div key={r.name} className="dashboard-ranked-row">
          <div className="dashboard-ranked-name">{r.name}</div>
          <div className="dashboard-ranked-track">
            <div
              className={`dashboard-ranked-fill ${r.pnl >= 0 ? "is-pos" : "is-neg"}`}
              style={{ width: `${Math.min(100, (Math.abs(r.pnl) / max) * 100)}%` }}
            />
          </div>
          <div className={`dashboard-ranked-pnl ${pnlClass(r.pnl)}`}>{formatMoney(r.pnl)}</div>
        </div>
      ))}
    </div>
  );
}

export function ProfitFactorBlock({ factor, hintText }) {
  const label =
    factor == null ? "—" : factor === Infinity ? "∞" : Number.isFinite(factor) ? factor.toFixed(2) : "—";
  const ratio = factor == null || !Number.isFinite(factor) ? 0 : Math.min(1, factor / 2.5);
  const pfHint = String(hintText ?? "").trim();
  return (
    <div className="card dashboard-pf-block">
      <div className="dashboard-pf-value">{label}</div>
      <div className="dashboard-pf-label-row">
        <div className="dashboard-pf-label">Profit factor</div>
        {pfHint ? <MetricHintIcon text={pfHint} /> : null}
      </div>
      <div className="dashboard-pf-meter" aria-hidden>
        <div className="dashboard-pf-meter-bg" />
        <div className="dashboard-pf-meter-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="dashboard-pf-note">Gross wins ÷ gross losses</p>
    </div>
  );
}

export function DashboardBento({
  rangeDays,
  tradesScoped,
  dailySeries,
  drawdownSeries,
  stats,
  pieData,
  holdBarData,
  avgWinLossData,
  largestData,
  mfeMaeData,
  winRateBar,
  byHour,
  byPrice,
  byVolume,
  byMonth,
  byTag,
  profitFactor,
  maxWinStreak,
  maxLossStreak,
}) {
  const dailyPnlBars = dailySeries.map((d) => ({
    ...d,
    absPnl: Math.abs(d.pnl),
    fill: d.pnl >= 0 ? CHART_GREEN : CHART_RED,
  }));

  return (
    <div className="dashboard-bento">
      <div className="card dashboard-bento-cell dashboard-bento-span-8 panel-cumulative">
        <div className="panel-title">Cumulative P&amp;L ({rangeDays} days)</div>
        <div className="chart-area chart-area-tall">
          {tradesScoped.length === 0 ? (
            <ChartEmpty>No trades in this range.</ChartEmpty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="shortLabel" tick={AXIS_TICK} stroke="#475569" />
                <YAxis tick={AXIS_TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} width={56} />
                <Tooltip content={<DarkTooltip />} cursor={false} />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  name="Cumulative P&L"
                  stroke={CHART_GREEN}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="dashboard-bento-stack dashboard-bento-span-4">
        <div className="card dashboard-panel panel-widget dashboard-winloss-panel">
          <div className="panel-title">Winning vs losing</div>
          <div className="chart-area chart-area-short dashboard-winloss-chart-area">
            {pieData.length === 0 ? (
              <ChartEmpty>No completed trades.</ChartEmpty>
            ) : (
              <div className="dashboard-winloss-inner">
                <div className="dashboard-winloss-donut">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                      <defs>
                        <linearGradient id="dashboard-donut-win" x1="0.5" y1="0" x2="0.5" y2="1">
                          <stop offset="0%" stopColor="#6ee7b7" stopOpacity="1" />
                          <stop offset="100%" stopColor="#34d399" stopOpacity="1" />
                        </linearGradient>
                        <linearGradient id="dashboard-donut-loss" x1="0.5" y1="0" x2="0.5" y2="1">
                          <stop offset="0%" stopColor="#fda4af" stopOpacity="1" />
                          <stop offset="100%" stopColor="#f43f5e" stopOpacity="1" />
                        </linearGradient>
                        <linearGradient id="dashboard-donut-flat" x1="0.5" y1="0" x2="0.5" y2="1">
                          <stop offset="0%" stopColor="#64748b" />
                          <stop offset="100%" stopColor="#475569" />
                        </linearGradient>
                      </defs>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius="64%"
                        outerRadius="84%"
                        paddingAngle={1.15}
                        cornerRadius={3}
                        stroke="rgba(15, 18, 26, 0.35)"
                        strokeWidth={0.75}
                        isAnimationActive
                      >
                        {pieData.map((entry) => {
                          let fill = entry.color;
                          if (entry.name === "Winning") fill = "url(#dashboard-donut-win)";
                          else if (entry.name === "Losing") fill = "url(#dashboard-donut-loss)";
                          else if (entry.name === "Breakeven") fill = "url(#dashboard-donut-flat)";
                          return <Cell key={entry.name} fill={fill} />;
                        })}
                        <Label
                          position="center"
                          content={(labelProps) => <WinLossDonutCenter {...labelProps} winRate={stats.winRate} />}
                        />
                      </Pie>
                      <Tooltip content={<DarkTooltip />} cursor={false} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="dashboard-winloss-legend" aria-label="Trade outcome breakdown">
                  {(() => {
                    const total = pieData.reduce((s, d) => s + d.value, 0);
                    return pieData.map((entry) => {
                      const pct = total > 0 ? (entry.value / total) * 100 : 0;
                      const key = entry.name.toLowerCase();
                      return (
                        <li
                          key={entry.name}
                          className={`dashboard-winloss-legend-row dashboard-winloss-legend-row--${key}`}
                        >
                          <span className="dashboard-winloss-legend-dot" aria-hidden />
                          <span className="dashboard-winloss-legend-name">{entry.name}</span>
                          <span className="dashboard-winloss-legend-count">{entry.value}</span>
                          <span className="dashboard-winloss-legend-pct">{pct.toFixed(0)}%</span>
                        </li>
                      );
                    });
                  })()}
                </ul>
              </div>
            )}
          </div>
        </div>
        <div className="dashboard-stat-twin">
          <StatTile label="Max win streak" value={String(maxWinStreak)} hint={DASHBOARD_STAT_TILE_HINTS.maxWinStreak} />
          <StatTile label="Max loss streak" value={String(maxLossStreak)} hint={DASHBOARD_STAT_TILE_HINTS.maxLossStreak} />
        </div>
        <ProfitFactorBlock factor={profitFactor} hintText={detailedStatHint("Profit factor")} />
      </div>

      <div className="card dashboard-bento-cell dashboard-bento-span-6 panel-cumulative">
        <div className="panel-title">Daily P&amp;L ({rangeDays} days)</div>
        <div className="chart-area chart-area-mid">
          {tradesScoped.length === 0 ? (
            <ChartEmpty>No trades.</ChartEmpty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyPnlBars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="shortLabel" tick={AXIS_TICK} stroke="#475569" />
                <YAxis tick={AXIS_TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} width={52} />
                <Tooltip content={<DarkTooltip />} cursor={false} />
                <Bar dataKey="pnl" name="P&L" radius={[4, 4, 0, 0]} cursor={false}>
                  {dailyPnlBars.map((e) => (
                    <Cell key={e.date} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card dashboard-bento-cell dashboard-bento-span-6 panel-cumulative">
        <div className="panel-title">Daily volume</div>
        <div className="chart-area chart-area-mid">
          {tradesScoped.length === 0 ? (
            <ChartEmpty>No trades.</ChartEmpty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="shortLabel" tick={AXIS_TICK} stroke="#475569" />
                <YAxis tick={AXIS_TICK} stroke="#475569" width={48} />
                <Tooltip content={<DarkTooltip />} cursor={false} />
                <Bar dataKey="volume" name="Volume" fill={CHART_GREEN} radius={[4, 4, 0, 0]} cursor={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card dashboard-bento-cell dashboard-bento-span-6 panel-cumulative">
        <div className="panel-title">Cumulative drawdown</div>
        <div className="chart-area chart-area-mid">
          {tradesScoped.length === 0 ? (
            <ChartEmpty>No trades.</ChartEmpty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={drawdownSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="shortLabel" tick={AXIS_TICK} stroke="#475569" />
                <YAxis tick={AXIS_TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} width={52} />
                <Tooltip content={<DarkTooltip />} cursor={false} />
                <Line
                  type="monotone"
                  dataKey="drawdown"
                  name="Drawdown"
                  stroke={CHART_RED}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card dashboard-bento-cell dashboard-bento-span-6 panel-widget">
        <div className="panel-title">Avg win vs avg loss ($)</div>
        <div className="chart-area chart-area-short">
          {tradesScoped.length === 0 ? (
            <ChartEmpty>No trades.</ChartEmpty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={avgWinLossData}
                margin={{ top: 4, right: 16, left: 72, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" tick={AXIS_TICK} stroke="#475569" width={70} />
                <Tooltip content={<DarkTooltip />} cursor={false} />
                <Bar dataKey="value" cursor={false} radius={[0, 6, 6, 0]}>
                  {avgWinLossData.map((e) => (
                    <Cell key={e.name} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card dashboard-bento-cell dashboard-bento-span-8 panel-widget">
        <div className="panel-title">Largest win vs largest loss ($)</div>
        <div className="chart-area chart-area-short">
          {tradesScoped.length === 0 ? (
            <ChartEmpty>No trades.</ChartEmpty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={largestData}
                margin={{ top: 4, right: 16, left: 88, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" tick={AXIS_TICK} stroke="#475569" width={86} />
                <Tooltip content={<DarkTooltip />} cursor={false} />
                <Bar dataKey="value" cursor={false} radius={[0, 6, 6, 0]}>
                  {largestData.map((e) => (
                    <Cell key={e.name} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card dashboard-bento-cell dashboard-bento-span-4 panel-widget">
        <div className="panel-title">Hold time (win vs loss)</div>
        <div className="chart-area chart-area-short">
          {!stats.hasHoldData ? (
            <ChartEmpty>
              Optional <code className="inline-code">holdMinutes</code> on trades unlocks this.
            </ChartEmpty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={holdBarData}
                margin={{ top: 4, right: 16, left: 56, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} stroke="#475569" tickFormatter={(v) => `${v}h`} />
                <YAxis type="category" dataKey="name" tick={AXIS_TICK} stroke="#475569" width={54} />
                <Tooltip
                  cursor={false}
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <div className="chart-tooltip">
                        <div className="chart-tooltip-row">
                          <span>{payload[0].payload.name}</span>
                          <span>{Number(payload[0].value).toFixed(2)} h</span>
                        </div>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="hours" cursor={false} radius={[0, 6, 6, 0]}>
                  {holdBarData.map((e) => (
                    <Cell key={e.name} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card dashboard-bento-cell dashboard-bento-span-4 panel-widget">
        <div className="panel-title">Win %</div>
        <div className="chart-area chart-area-short">
          {tradesScoped.length === 0 ? (
            <ChartEmpty>No trades.</ChartEmpty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={winRateBar} margin={{ top: 12, right: 12, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="name" tick={AXIS_TICK} stroke="#475569" />
                <YAxis domain={[0, 100]} tick={AXIS_TICK} stroke="#475569" tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<DarkTooltip />} cursor={false} />
                <Bar dataKey="value" name="Win rate" fill={CHART_GREEN} radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card dashboard-bento-cell dashboard-bento-span-4 panel-widget">
        <div className="panel-title">P&amp;L by weekday</div>
        <div className="chart-area chart-area-short">
          {tradesScoped.length === 0 ? (
            <ChartEmpty>No trades.</ChartEmpty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byWeekday} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="name" tick={AXIS_TICK} stroke="#475569" />
                <YAxis tick={AXIS_TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} width={48} />
                <Tooltip content={<DarkTooltip />} cursor={false} />
                <Bar dataKey="pnl" name="P&L" radius={[4, 4, 0, 0]} cursor={false}>
                  {stats.byWeekday.map((e) => (
                    <Cell key={e.name} fill={e.pnl >= 0 ? CHART_GREEN : CHART_RED} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card dashboard-bento-cell dashboard-bento-span-4 panel-widget">
        <div className="panel-title">Avg MFE vs MAE ($)</div>
        <div className="chart-area chart-area-short">
          {!stats.hasMfeMae ? (
            <ChartEmpty>
              Optional <code className="inline-code">mfe</code> / <code className="inline-code">mae</code> fields.
            </ChartEmpty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={mfeMaeData} margin={{ top: 4, right: 16, left: 64, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" tick={AXIS_TICK} stroke="#475569" width={62} />
                <Tooltip content={<DarkTooltip />} cursor={false} />
                <Bar dataKey="value" cursor={false} radius={[0, 6, 6, 0]}>
                  {mfeMaeData.map((e) => (
                    <Cell key={e.name} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card dashboard-bento-cell dashboard-bento-span-6 panel-bottomish">
        <div className="panel-title">P&amp;L by hour (open time)</div>
        <RankedBarList rows={byHour.map((h) => ({ name: h.name, pnl: h.pnl }))} empty="No time data." />
      </div>

      <div className="card dashboard-bento-cell dashboard-bento-span-6 panel-bottomish">
        <div className="panel-title">P&amp;L by avg fill price</div>
        <RankedBarList rows={byPrice.map((b) => ({ name: b.name, pnl: b.pnl }))} empty="No price data." />
      </div>

      <div className="card dashboard-bento-cell dashboard-bento-span-6 panel-bottomish">
        <div className="panel-title">P&amp;L by share volume (day)</div>
        <RankedBarList rows={byVolume.map((b) => ({ name: b.name, pnl: b.pnl }))} empty="No volume buckets." />
      </div>

      <div className="card dashboard-bento-cell dashboard-bento-span-6 panel-bottomish">
        <div className="panel-title">P&amp;L by month</div>
        {byMonth.length === 0 ? (
          <ChartEmpty>No trades.</ChartEmpty>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="name" tick={AXIS_TICK} stroke="#475569" />
              <YAxis tick={AXIS_TICK} stroke="#475569" tickFormatter={(v) => `$${v}`} width={52} />
              <Tooltip content={<DarkTooltip />} cursor={false} />
              <Bar dataKey="pnl" name="P&L" radius={[4, 4, 0, 0]} cursor={false}>
                {byMonth.map((e) => (
                  <Cell key={e.name} fill={e.pnl >= 0 ? CHART_GREEN : CHART_RED} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card dashboard-bento-cell dashboard-bento-span-6 panel-bottomish">
        <div className="panel-title">Tag breakdown</div>
        <RankedBarList rows={byTag} empty="No tags — add tags on a trade page." />
      </div>

      <div className="card dashboard-bento-cell dashboard-bento-span-6 panel-bottomish">
        <div className="panel-title">Total fees (import)</div>
        <StatTile label="Not in CSV shape yet" value="—" hint={DASHBOARD_STAT_TILE_HINTS.totalFeesImport} />
      </div>
    </div>
  );
}
