/** @param {Record<string, string>} map @param {string} key */
function pick(map, key) {
  return map[key] ?? null;
}

/** Explanations for Detailed → Stats grid (label text must match exactly). */
export const DETAILED_STAT_HINTS = {
  "Total gain/loss": "Sum of closed trade P&L (net) for all trades in the selected day window and filters.",
  "Largest gain": "Single best winning trade by P&L in this window.",
  "Largest loss": "Single worst losing trade by P&L (most negative) in this window.",
  "Avg daily gain/loss": "Total P&L divided by number of distinct calendar days that have at least one trade.",
  "Avg daily volume": "Total share/contract volume divided by those same distinct trading days.",
  "Avg per-share gain/loss": "Total P&L divided by total volume — rough dollars per share across the window.",
  "Avg trade gain/loss": "Mean P&L per trade (total P&L ÷ trade count).",
  "Avg winning trade": "Mean P&L among trades that closed green (breakevens excluded from denominator).",
  "Avg losing trade": "Mean P&L among losing trades (typically a negative dollar amount).",
  "Total number of trades": "How many trades fall in the window after filters.",
  "Number of winning trades": "Count of trades with positive net P&L and their share of all trades.",
  "Number of losing trades": "Count of trades with negative net P&L and their share of all trades.",
  "Avg win": "Same as average dollar size of winners; shown next to avg loss for quick comparison.",
  "Avg loss": "Average dollar size of losers (signed negative).",
  "Avg R:R":
    "Average win ÷ absolute average loss — compares typical winner size to typical loser size (not the same as reward:risk on entry).",
  "Scratch trades": "Trades tagged as scratch (or zero P&L bucket) — quick read on how many tiny/no-impact trades you took.",
  "Avg hold (winners)": "Mean hold time in minutes for winning trades when hold time is recorded on the trade.",
  "Avg hold (losers)": "Mean hold time in minutes for losing trades when hold time is recorded.",
  "Trade P&L std dev": "Standard deviation of per-trade net P&L — higher means more dispersion in outcomes.",
  "Max consecutive wins": "Longest streak of back-to-back winning trades in session order.",
  "Max consecutive losses": "Longest streak of back-to-back losing trades in session order.",
  "Kelly %": "Kelly criterion fraction from win rate and avg win/loss — sizing heuristic; often capped in real trading.",
  SQN: "System Quality Number (Van Tharp): signal-to-noise style score from trade P&L vs variability; interpret with sample size.",
  "Probability (random)": "Two-sided p-value vs a 50% win rate under a simple binomial model — descriptive, not a full edge test.",
  "Total commissions": "Sum of imported commission amounts (shown as cash outflow when your file has comm columns on fills).",
  "K-ratio": "Slope of an equity curve regression on cumulative P&L vs time — trend consistency of returns.",
  "Profit factor":
    "Gross winning dollars divided by gross losing dollars; below 1 means losers outweigh winners in gross terms.",
  "Avg position MAE": "Mean maximum adverse excursion from fill replay (dollars) — how far trades went against you while open.",
  "Total fees": "Commissions plus regulatory/misc fees from import when present.",
  "Avg MFE": "Mean maximum favorable excursion stored on trades — best unrealized profit during the trade when you track MFE.",
  "Avg position MFE": "Mean favorable excursion from fill replay — peak unrealized profit path implied by your fills.",
  "Avg MAE": "Mean maximum adverse excursion stored on trades — worst drawdown while open when you track MAE.",
};

/** @param {string} label */
export function detailedStatHint(label) {
  const k = String(label ?? "").trim();
  if (!k) return null;
  return (
    DETAILED_STAT_HINTS[k] ??
    `${k}: value is computed from trades in the selected day window after your Reports filters (Detailed tab).`
  );
}

export const REPORTS_STATS_BLOCK_HINT =
  "Summary metrics for trades in the selected day range after the global Reports filters. Gross-style figures unless a row says otherwise.";

/** Compare table: first column labels → explanation (Δ column shares one hint). */
export const COMPARE_STAT_HINTS = {
  Metric: "Name of the statistic. Values in the next columns are for Group A, Group B, then B minus A.",
  "Group A": "Results for trades matching only Group A’s filters (left column of filters).",
  "Group B": "Results for trades matching only Group B’s filters (right column of filters).",
  "Δ (B − A)": "Difference: Group B value minus Group A value for that row. For P&L, positive means B was larger.",
  Trades: "Number of trades matching that group’s own filters (not the global Reports strip).",
  NetPnL: "Sum of closed trade net P&L for every trade in the cohort.",
  "Win rate": "Winning trades ÷ (winners + losers); breakevens excluded from the denominator.",
  "Wins / losses": "Counts of winning and losing trades; breakeven count shown when non-zero.",
  "Avg winning trade": "Average dollar P&L among winning trades in the cohort.",
  "Avg losing trade": "Average dollar P&L among losing trades (negative).",
  "Profit factor": "Gross profit from winners divided by gross loss from losers; ∞-like when there are no losers.",
  "Largest win": "Best single-trade net P&L in the cohort.",
  "Largest loss": "Worst single-trade net P&L (most negative).",
  "Avg hold (winners)": "Mean minutes in the trade for winners when hold time is stored.",
  "Avg hold (losers)": "Mean minutes in the trade for losers when hold time is stored.",
  "Avg MFE": "Mean stored maximum favorable excursion (dollars) when MFE exists on trades.",
  "Avg MAE": "Mean stored maximum adverse excursion (dollars) when MAE exists on trades.",
};

/** Monthly table: stable column ids for Reports → Table. */
export const REPORTS_TABLE_COLUMN_HINTS = {
  colMonth: "Calendar month in the selected year.",
  colStart: "Account balance at the start of the month — entered by you; stored only in this browser.",
  colEnd: "Account balance at month end — entered by you; used with Start for balance % change.",
  colPnlTrades:
    "Sum of imported trade net P&L for trades whose date falls in that month (after Reports filters).",
  colDeltaBalances:
    "End balance minus start balance when both are filled — not the same as trade P&L if you deposit or withdraw.",
  colPctBalances: "Percentage return from start to end balance: (End − Start) ÷ Start.",
  colPctTradesStart:
    "Trade P&L for the month as a percent of starting balance — compares closed-trade result to account size.",
  colWireOut: "Withdrawals you log for the month (positive number = cash taken out).",
  colYearTotal: "Sums P&L (trades) and wire-out across months; balance columns are not rolled up here.",
};

/** Trade detail snapshot: stable keys for <SnapshotDt hintKey="…" />. */
export const TRADE_SNAPSHOT_HINTS = {
  sharesTraded: "Total volume on the trade row (shares or contracts).",
  closedPnlNet: "Net profit or loss for the round trip after fees as stored on the trade.",
  grossPnl: "Market P&L from fill amounts when the import has amount columns; otherwise matches net.",
  commissionsFees: "Total paid commissions and misc fees from fill rows when your broker file includes those columns.",
  fillCount: "Number of execution lines attached to this trade.",
  bestExitPnl:
    "Largest single reducing fill versus average-cost inventory from fill replay (approximation from executions).",
  positionMfe: "Peak unrealized profit in dollars during the fill replay while the position was open.",
  positionMae: "Maximum adverse excursion in dollars during replay — how far underwater the worst mark was.",
  priceMfeMae: "Approximate per-share favorable and adverse excursion using replay dollars divided by max absolute size.",
  exitEfficiency: "Closed net P&L divided by replay MFE when MFE is meaningful — how much of the best run you captured.",
};

export const REPORTS_OVERVIEW_CHART_HINTS = {
  grossDaily:
    "Each bar is one calendar day: sum of net P&L for all trades on that day after your Reports filters. Green = positive day, red = negative.",
  grossCumulative:
    "Running sum of the same daily net P&L through the range — shows equity curve at the day level.",
  dailyVolume: "Total share or contract volume recorded on trades for each calendar day.",
  winPct:
    "Per calendar day: winning trades ÷ all trades that day (0% when no trades). Useful for consistency vs dollar P&L.",
};

export const REPORTS_DRAWDOWN_CHART_HINT =
  "Underwater chart: each point is cumulative P&L minus the running peak up to that day — zero at new highs, negative when you are off the peak.";

export const REPORTS_DRAWDOWN_WORSEN_WEEKDAY_HINT =
  "When drawdown deepens vs the prior calendar day, the extra dollar depth is counted toward that weekday (Mon–Fri only).";

export const REPORTS_DRAWDOWN_DOW_PNL_HINT =
  "Sum of net P&L on each weekday across the same chart window (Mon–Fri), after your Reports filters.";

export const REPORTS_DRAWDOWN_CUM_MA_HINT =
  "Rolling average of cumulative day-level net P&L (20 trading days in the series). Smoother read on equity trend.";

export const REPORTS_DRAWDOWN_VOL_HINT =
  "Rolling standard deviation of daily net P&L (10-day window in the series) — higher means more day-to-day swing.";

export const REPORTS_DRAWDOWN_EXPECT_HINT =
  "Average closed-trade net P&L over a rolling 20-trade window in chronological order after filters.";

/** Drawdown tab — summary tiles (label text must match). */
export const DRAWDOWN_STAT_HINTS = {
  "Average drawdown":
    "Mean of each underwater episode’s deepest drawdown (dollars below the prior peak). Episodes are contiguous calendar days below peak equity.",
  "Biggest drawdown": "Most negative cumulative drawdown from the running peak on any single day in the window.",
  "Average number of days in drawdown":
    "Average length (calendar days) of each underwater episode — from first day below peak until equity makes a new high.",
  "Number of days in drawdown":
    "Total calendar days in the window where equity was below the running peak (drawdown strictly below zero).",
  "Average trades in drawdown":
    "Across underwater episodes, average count of closed trades whose trade date falls on those drawdown days (from daily aggregates).",
};

/** @param {string} label */
export function drawdownStatHint(label) {
  const k = String(label ?? "").trim();
  if (!k) return null;
  return DRAWDOWN_STAT_HINTS[k] ?? `${k}: computed from the drawdown series in this report window.`;
}

export const REPORTS_WINLOSS_CHART_HINT =
  "Each bar is one calendar day’s net P&L after filters. Color shows winning vs losing vs no-trade days.";

/** Win vs Loss Days — two-column stats (label text must match). */
export const WINLOSS_DAY_STAT_HINTS = {
  "Total gain/loss":
    "Sum of net P&L on every calendar day in this column — only days that were net winning (or only net losing) for the chart window.",
  "Average daily gain/loss": "Total gain/loss in this column divided by the number of those winning (or losing) days.",
  "Average daily volume": "Total share/contract volume on those days divided by the number of days in this column.",
  "Average per-share gain/loss": "Column total P&L divided by total volume on those same days (rough dollars per share).",
  "Average trade gain/loss": "Column total P&L divided by total trade count on those days.",
  "Total number of trades": "All closed trades that fall on the winning days (or losing days) in this window after filters.",
};

/** @param {string} label */
export function winLossDayStatHint(label) {
  const k = String(label ?? "").trim();
  if (!k) return null;
  return (
    WINLOSS_DAY_STAT_HINTS[k] ??
    `${k}: derived from calendar-day buckets in the chart range after your Reports filters.`
  );
}

export const REPORTS_TAG_BREAKDOWN_CHART_HINT =
  "Each row is one tag or setup. A trade’s full P&L is counted toward every tag/setup on that trade; rows sorted by absolute P&L.";

export const REPORTS_TAG_BREAKDOWN_MODE_HINT =
  "Tags use trade tag chips; setups use setup chips. Switching only changes how rows are grouped — the bar chart updates the same way.";

export const REPORTS_CALENDAR_MONTH_HINT =
  "Mini grid: each number is a day; color is that day’s net P&L. Click a day to open the Journal for that date.";

export const REPORTS_CALENDAR_MONTHLY_PNL_HINT =
  "Sum of net P&L for trades dated in this month (after Reports filters). This is closed-trade P&L, not your account balance change.";

export const REPORTS_ADVANCED_TAB_HINT =
  "Build a custom scatter from closed trades after filters: any two numeric axes (P&L, hold time, volume, replay MFE/MAE, clock fields). Quick presets jump to common pairs.";

export const REPORTS_ADVANCED_SCATTER_HINT =
  "Each dot is one trade in date/time order. Green/red = net P&L sign. Optional marker size scales with |net P&L|. Tooltip shows symbol, date, and coordinates using the same axis definitions as the chart.";

/** Dashboard stat tiles (30 / 60 / 90 day window, trade date order). */
export const DASHBOARD_STAT_TILE_HINTS = {
  maxWinStreak:
    "Longest run of consecutive winning trades in chronological (trade date) order within the dashboard range (30, 60, or 90 days).",
  maxLossStreak:
    "Longest run of consecutive losing trades in chronological order within the same dashboard range.",
  totalFeesImport:
    "Commissions and fees are not summed on the dashboard until your import stores them (for example per-fill commission columns). Extend the CSV shape if you need a total here.",
};
