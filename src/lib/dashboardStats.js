import { groupTradesByDate } from "../storage/storage";
import { stableTradeId } from "../storage/tradeLookup";
import { getTradeTags, getTradeSetups } from "./tradeTags";
import { computeFillReplayStats, tradeSignedAmountForAggregation } from "./tradeExecutionMetrics";
import {
  getTradeDurationSeconds,
  tradeMatchesDurationBucket,
  REPORT_DURATION_OPTIONS,
  tradeIsMultiday,
} from "./tradeDuration";

/** Local calendar date as YYYY-MM-DD */
export function localISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday → Sunday ISO date strings for the week containing `anchor` */
export function getWeekDatesMondayStart(anchor = new Date()) {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    out.push(localISODate(x));
  }
  return out;
}

export function getDayAggregate(grouped, dateStr) {
  return (
    grouped[dateStr] || {
      date: dateStr,
      pnl: 0,
      trades: 0,
      volume: 0,
      rows: [],
    }
  );
}

const TRADE_DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Latest `trade.date` in the list (lexicographic = chronological for ISO dates).
 * Ignores dates more than `maxFutureDaysFromToday` after local today so bad imports do not blow up ranges.
 * @param {object[]} trades
 * @param {{ maxFutureDaysFromToday?: number }} [opts]
 * @returns {string | null}
 */
export function latestTradeCalendarDate(trades, opts = {}) {
  const capDaysRaw = opts.maxFutureDaysFromToday ?? 400;
  const capDays = Number.isFinite(capDaysRaw) && capDaysRaw > 0 ? capDaysRaw : 400;
  const cap = new Date();
  cap.setHours(0, 0, 0, 0);
  cap.setDate(cap.getDate() + capDays);
  const capIso = localISODate(cap);
  let best = null;
  for (const t of trades ?? []) {
    const d = String(t?.date ?? "").trim();
    if (!TRADE_DATE_ISO_RE.test(d)) continue;
    if (d > capIso) continue;
    if (!best || d > best) best = d;
  }
  return best;
}

/**
 * Anchor for the dashboard “This week” strip: today, or the latest trade day if it is still in the future
 * (e.g. Schwab statement “through” date imported before that calendar day).
 * @param {object[]} trades
 */
export function dashboardWeekAnchorDate(trades) {
  const latestIso = latestTradeCalendarDate(trades);
  if (!latestIso) return new Date();
  const lt = new Date(`${latestIso}T12:00:00`);
  const now = new Date();
  if (Number.isNaN(lt.getTime())) return now;
  return lt > now ? lt : now;
}

export function tradesInLastDays(trades, numDays) {
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  let end = todayEnd;
  const latestIso = latestTradeCalendarDate(trades);
  if (latestIso) {
    const lt = new Date(`${latestIso}T12:00:00`);
    if (!Number.isNaN(lt.getTime())) {
      const ltEnd = new Date(lt);
      ltEnd.setHours(23, 59, 59, 999);
      if (ltEnd > end) end = ltEnd;
    }
  }
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (numDays - 1));
  return trades.filter((t) => {
    if (!t.date) return false;
    const td = new Date(`${t.date}T12:00:00`);
    if (Number.isNaN(td.getTime())) return false;
    return td >= start && td <= end;
  });
}

export function buildDailySeriesForRange(trades, numDays) {
  let end = new Date();
  end.setHours(0, 0, 0, 0);
  const latestIso = latestTradeCalendarDate(trades);
  if (latestIso) {
    const lt = new Date(`${latestIso}T12:00:00`);
    if (!Number.isNaN(lt.getTime())) {
      const ltDay = new Date(lt);
      ltDay.setHours(0, 0, 0, 0);
      if (ltDay > end) end = ltDay;
    }
  }
  const grouped = groupTradesByDate(trades);
  const series = [];
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const key = localISODate(d);
    const g = grouped[key] || { pnl: 0, trades: 0, volume: 0 };
    series.push({
      date: key,
      shortLabel: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      pnl: g.pnl,
      volume: g.volume,
      tradeCount: g.trades,
    });
  }
  let cum = 0;
  for (const row of series) {
    cum += row.pnl;
    row.cumulative = cum;
  }
  return series;
}

const REPORT_DAILY_SPAN_MAX_DAYS = 800;

/**
 * Every calendar day from start through end (inclusive), local time. Capped for chart performance.
 * @param {string} startISO YYYY-MM-DD
 * @param {string} endISO YYYY-MM-DD
 * @returns {string[]}
 */
export function enumerateDatesInclusive(startISO, endISO) {
  const a = String(startISO ?? "").trim();
  const b = String(endISO ?? "").trim();
  if (!a || !b) return [];
  const start = new Date(`${a}T12:00:00`);
  const end = new Date(`${b}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const out = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(localISODate(cur));
    cur.setDate(cur.getDate() + 1);
    if (out.length > 2500) break;
  }
  if (out.length > REPORT_DAILY_SPAN_MAX_DAYS) return out.slice(out.length - REPORT_DAILY_SPAN_MAX_DAYS);
  return out;
}

/**
 * One row per calendar day between `startISO` and `endISO` (inclusive), filled from `trades`.
 * Same row shape as {@link buildDailySeriesForRange} (including `cumulative`).
 * @param {object[]} trades
 * @param {string} startISO
 * @param {string} endISO
 */
export function buildDailySeriesForDateSpan(trades, startISO, endISO) {
  const grouped = groupTradesByDate(trades);
  const dates = enumerateDatesInclusive(startISO, endISO);
  const series = dates.map((key) => {
    const d = new Date(`${key}T12:00:00`);
    const g = grouped[key] || { pnl: 0, trades: 0, volume: 0 };
    return {
      date: key,
      shortLabel: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      pnl: g.pnl,
      volume: g.volume,
      tradeCount: g.trades,
    };
  });
  let cum = 0;
  for (const row of series) {
    cum += row.pnl;
    row.cumulative = cum;
  }
  return series;
}

/** Sum of trade P&L for filtered sets. */
export function sumTradePnl(trades) {
  return trades.reduce((s, t) => s + tradeSignedAmountForAggregation(t), 0);
}

export function computeDashboardStats(trades) {
  const wins = [];
  const losses = [];
  let breakeven = 0;
  const weekday = [0, 1, 2, 3, 4, 5, 6].map(() => ({ pnl: 0, trades: 0 }));
  const winHolds = [];
  const lossHolds = [];

  trades.forEach((t) => {
    const p = tradeSignedAmountForAggregation(t);
    const hm = t.holdMinutes != null && t.holdMinutes !== "" ? Number(t.holdMinutes) : null;
    if (p > 0) {
      wins.push(p);
      if (hm != null && !Number.isNaN(hm)) winHolds.push(hm);
    } else if (p < 0) {
      losses.push(p);
      if (hm != null && !Number.isNaN(hm)) lossHolds.push(hm);
    } else {
      breakeven += 1;
    }
    if (t.date) {
      const dow = new Date(`${t.date}T12:00:00`).getDay();
      weekday[dow].pnl += p;
      weekday[dow].trades += 1;
    }
  });

  const avgWin = wins.length ? wins.reduce((s, v) => s + v, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, v) => s + v, 0) / losses.length : 0;
  const maxWin = wins.length ? Math.max(...wins) : 0;
  const maxLoss = losses.length ? Math.min(...losses) : 0;
  const holdAvg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);

  const decided = wins.length + losses.length;
  const winRate = decided > 0 ? (wins.length / decided) * 100 : 0;

  const weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byWeekday = weekday.map((w, i) => ({
    name: weekdayShort[i],
    pnl: w.pnl,
    trades: w.trades,
  }));

  const mfeVals = trades.map((t) => Number(t.mfe)).filter((n) => !Number.isNaN(n));
  const maeVals = trades.map((t) => Number(t.mae)).filter((n) => !Number.isNaN(n));
  const avgMfe = mfeVals.length ? mfeVals.reduce((s, v) => s + v, 0) / mfeVals.length : null;
  const avgMae = maeVals.length ? maeVals.reduce((s, v) => s + v, 0) / maeVals.length : null;

  return {
    tradeCount: trades.length,
    totalPnl: sumTradePnl(trades),
    winCount: wins.length,
    lossCount: losses.length,
    breakevenCount: breakeven,
    avgWin,
    avgLoss,
    maxWin,
    maxLoss,
    winRate,
    avgHoldWin: holdAvg(winHolds),
    avgHoldLoss: holdAvg(lossHolds),
    hasHoldData: winHolds.length > 0 || lossHolds.length > 0,
    byWeekday,
    avgMfe,
    avgMae,
    hasMfeMae: avgMfe != null && avgMae != null,
  };
}

/** @param {{ cumulative: number }[]} dailySeries */
export function buildDrawdownSeries(dailySeries) {
  let peak = -Infinity;
  return dailySeries.map((row) => {
    const cum = Number(row.cumulative) || 0;
    peak = Math.max(peak, cum);
    return {
      ...row,
      drawdown: cum - peak,
    };
  });
}

/**
 * @param {{ drawdown?: number, tradeCount?: number }[]} series
 * @param {number} a
 * @param {number} b
 */
function summarizeDrawdownSlice(series, a, b) {
  let minDrawdown = 0;
  let trades = 0;
  for (let j = a; j <= b; j++) {
    minDrawdown = Math.min(minDrawdown, Number(series[j].drawdown) || 0);
    trades += Number(series[j].tradeCount) || 0;
  }
  return { minDrawdown, trades, days: b - a + 1 };
}

/**
 * Episodes where equity is below the running peak (drawdown &lt; 0).
 * @param {{ date?: string, drawdown: number, tradeCount?: number }[]} ddSeries
 */
export function analyzeDrawdownEpisodes(ddSeries) {
  const n = ddSeries.length;
  if (!n) {
    return {
      maxDrawdown: 0,
      avgDrawdown: null,
      daysInDrawdown: 0,
      avgDaysPerEpisode: null,
      avgTradesPerEpisode: null,
      episodeCount: 0,
    };
  }

  const episodes = [];
  let inEp = false;
  let epStart = 0;
  for (let i = 0; i < n; i++) {
    const dd = Number(ddSeries[i].drawdown) || 0;
    const underwater = dd < 0;
    if (underwater && !inEp) {
      inEp = true;
      epStart = i;
    } else if (!underwater && inEp) {
      episodes.push(summarizeDrawdownSlice(ddSeries, epStart, i - 1));
      inEp = false;
    }
  }
  if (inEp) episodes.push(summarizeDrawdownSlice(ddSeries, epStart, n - 1));

  let maxDrawdown = 0;
  for (const row of ddSeries) {
    maxDrawdown = Math.min(maxDrawdown, Number(row.drawdown) || 0);
  }

  const daysInDrawdown = episodes.reduce((s, e) => s + e.days, 0);
  const avgDrawdown =
    episodes.length > 0 ? episodes.reduce((s, e) => s + e.minDrawdown, 0) / episodes.length : null;
  const avgDaysPerEpisode = episodes.length > 0 ? daysInDrawdown / episodes.length : null;
  const avgTradesPerEpisode =
    episodes.length > 0 ? episodes.reduce((s, e) => s + e.trades, 0) / episodes.length : null;

  return {
    maxDrawdown,
    avgDrawdown,
    daysInDrawdown,
    avgDaysPerEpisode,
    avgTradesPerEpisode,
    episodeCount: episodes.length,
  };
}

/**
 * When drawdown deepens vs the prior day, add that dollar amount to the weekday bucket (Mon–Fri).
 * @param {{ date?: string, drawdown: number }[]} ddSeries
 */
export function drawdownWorseningByWeekday(ddSeries) {
  const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const pnl = [0, 0, 0, 0, 0];
  for (let i = 1; i < ddSeries.length; i++) {
    const prev = Number(ddSeries[i - 1].drawdown) || 0;
    const cur = Number(ddSeries[i].drawdown) || 0;
    if (cur >= prev) continue;
    const worsen = prev - cur;
    const ds = ddSeries[i].date;
    if (!ds) continue;
    const dow = new Date(`${String(ds)}T12:00:00`).getDay();
    if (dow >= 1 && dow <= 5) pnl[dow - 1] += worsen;
  }
  return SHORT.map((name, i) => ({ name, amount: pnl[i] }));
}

/** Sum of daily net P&amp;L by weekday (Mon–Fri) in the same window. */
export function dailyPnlByWeekdayMonFri(dailySeries) {
  const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const pnl = [0, 0, 0, 0, 0];
  for (const row of dailySeries) {
    if (!row.date) continue;
    const dow = new Date(`${String(row.date)}T12:00:00`).getDay();
    if (dow >= 1 && dow <= 5) pnl[dow - 1] += Number(row.pnl) || 0;
  }
  return SHORT.map((name, i) => ({ name, pnl: pnl[i] }));
}

/** Rolling mean of cumulative equity (window days, inclusive). */
export function cumulativeMovingAverageSeries(dailySeries, window = 20) {
  return dailySeries.map((row, i) => {
    const a = Math.max(0, i - window + 1);
    let s = 0;
    for (let j = a; j <= i; j++) s += Number(dailySeries[j].cumulative) || 0;
    const len = i - a + 1;
    return {
      ...row,
      cumMa: len ? s / len : Number(row.cumulative) || 0,
    };
  });
}

/** Rolling population std dev of daily net P&amp;L. */
export function dailyPnlRollingStdDevSeries(dailySeries, window = 10) {
  return dailySeries.map((row, i) => {
    const a = Math.max(0, i - window + 1);
    const slice = [];
    for (let j = a; j <= i; j++) slice.push(Number(dailySeries[j].pnl) || 0);
    const len = slice.length;
    const mean = len ? slice.reduce((x, y) => x + y, 0) / len : 0;
    const v = len ? slice.reduce((x, y) => x + (y - mean) ** 2, 0) / len : 0;
    return {
      ...row,
      pnlVol: Math.sqrt(v),
    };
  });
}

/** Gross wins / gross losses (standard profit factor). */
export function computeProfitFactor(trades) {
  let grossWin = 0;
  let grossLoss = 0;
  for (const t of trades) {
    const p = tradeSignedAmountForAggregation(t);
    if (p > 0) grossWin += p;
    else if (p < 0) grossLoss += -p;
  }
  if (grossLoss === 0) return grossWin > 0 ? null : 0;
  return grossWin / grossLoss;
}

/** Chronological ascending (session order). */
export function sortTradesChronoAsc(trades) {
  return [...trades].sort((a, b) => {
    const c = String(a.date).localeCompare(String(b.date));
    if (c !== 0) return c;
    return String(a.time || "00:00:00").localeCompare(String(b.time || "00:00:00"));
  });
}

/** Moving average of closed-trade net P&amp;L over the last `window` trades (chronological). */
export function tradePnlMovingAverageSeries(trades, window = 20) {
  const sorted = sortTradesChronoAsc(trades);
  return sorted.map((t, i) => {
    const a = Math.max(0, i - window + 1);
    let s = 0;
    for (let j = a; j <= i; j++) s += Number(sorted[j].pnl) || 0;
    const len = i - a + 1;
    return {
      index: i + 1,
      tradeAvgPnl: len ? s / len : 0,
      date: t.date,
    };
  });
}

export function maxConsecutiveStreaks(trades) {
  const sorted = sortTradesChronoAsc(trades);
  let maxW = 0;
  let maxL = 0;
  let curW = 0;
  let curL = 0;
  for (const t of sorted) {
    const p = tradeSignedAmountForAggregation(t);
    if (p > 0) {
      curW += 1;
      curL = 0;
      maxW = Math.max(maxW, curW);
    } else if (p < 0) {
      curL += 1;
      curW = 0;
      maxL = Math.max(maxL, curL);
    } else {
      curW = 0;
      curL = 0;
    }
  }
  return { maxConsecutiveWins: maxW, maxConsecutiveLosses: maxL };
}

/** Volume-weighted average price from fills, or null. */
export function tradeAvgFillPrice(trade) {
  const fills = trade?.fills;
  if (!fills?.length) return null;
  let sumPx = 0;
  let sumQ = 0;
  for (const f of fills) {
    const q = Number(f.quantity) || 0;
    const p = Number(f.price);
    if (!q || Number.isNaN(p)) continue;
    sumPx += p * q;
    sumQ += q;
  }
  return sumQ ? sumPx / sumQ : null;
}

const PRICE_BUCKETS = [
  { key: "< $2", min: 0, max: 2 },
  { key: "$2 – $5", min: 2, max: 5 },
  { key: "$5 – $10", min: 5, max: 10 },
  { key: "$10 – $20", min: 10, max: 20 },
  { key: "$20+", min: 20, max: Infinity },
];

/** @returns {{ name: string, pnl: number, trades: number }[]} */
export function aggregateByPriceBucket(trades) {
  const buckets = PRICE_BUCKETS.map((b) => ({ name: b.key, pnl: 0, trades: 0 }));
  for (const t of trades) {
    const px = tradeAvgFillPrice(t);
    if (px == null || Number.isNaN(px)) continue;
    const p = tradeSignedAmountForAggregation(t);
    const idx = PRICE_BUCKETS.findIndex((b) => px >= b.min && px < b.max);
    if (idx < 0) continue;
    buckets[idx].pnl += p;
    buckets[idx].trades += 1;
  }
  return buckets.filter((b) => b.trades > 0);
}

/** @returns {{ name: string, pnl: number, trades: number }[]} hour 0–23 */
export function aggregateByHour(trades) {
  const hours = Array.from({ length: 24 }, (_, h) => ({ name: `${h}:00`, hour: h, pnl: 0, trades: 0 }));
  for (const t of trades) {
    const m = String(t.time || "").match(/^(\d{1,2})/);
    const h = m ? Math.min(23, Math.max(0, parseInt(m[1], 10))) : 12;
    const p = tradeSignedAmountForAggregation(t);
    hours[h].pnl += p;
    hours[h].trades += 1;
  }
  return hours.filter((x) => x.trades > 0);
}

/** @returns {{ name: string, pnl: number, trades: number }[]} */
export function aggregateByMonth(trades) {
  const map = new Map();
  for (const t of trades) {
    const d = String(t.date || "");
    const key = d.length >= 7 ? d.slice(0, 7) : "";
    if (!key) continue;
    const cur = map.get(key) || { pnl: 0, trades: 0 };
    cur.pnl += tradeSignedAmountForAggregation(t);
    cur.trades += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      name: key,
      shortLabel: key.replace("-", " · "),
      pnl: v.pnl,
      trades: v.trades,
    }));
}

const VOL_BUCKETS = [
  { key: "0 – 49k", min: 0, max: 49_999 },
  { key: "50k – 99k", min: 50_000, max: 99_999 },
  { key: "100k – 249k", min: 100_000, max: 249_999 },
  { key: "250k+", min: 250_000, max: Infinity },
];

/** @returns {{ name: string, pnl: number, trades: number }[]} */
export function aggregateByVolumeBucket(trades) {
  const buckets = VOL_BUCKETS.map((b) => ({ name: b.key, pnl: 0, trades: 0 }));
  for (const t of trades) {
    const v = Number(t.volume) || 0;
    const p = tradeSignedAmountForAggregation(t);
    const idx = VOL_BUCKETS.findIndex((b) => {
      if (v < b.min) return false;
      if (b.max === Infinity) return true;
      return v <= b.max;
    });
    if (idx < 0) continue;
    buckets[idx].pnl += p;
    buckets[idx].trades += 1;
  }
  return buckets.filter((b) => b.trades > 0);
}

/** Monday-first slice of `computeDashboardStats().byWeekday` (Sun = index 0). */
export function byWeekdayMonFirst(byWeekday) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((i) => byWeekday[i] ?? { name: "", pnl: 0, trades: 0 });
}

/** Trades with |P&amp;L| below threshold (flat / scratch). */
export function scratchTradeCount(trades, eps = 0.01) {
  return trades.filter((t) => Math.abs(tradeSignedAmountForAggregation(t)) < eps).length;
}

/** Sample standard deviation of per-trade P&amp;L. */
export function computeTradePnlStdDev(trades) {
  const vals = trades.map((t) => tradeSignedAmountForAggregation(t));
  if (vals.length < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v = vals.reduce((s, x) => s + (x - mean) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(v);
}

/**
 * Count and P&amp;L by report duration bucket (first-to-last fill on session date).
 * @returns {{ name: string, key: string, trades: number, pnl: number }[]}
 */
export function aggregateByReportDurationBuckets(trades) {
  const opts = REPORT_DURATION_OPTIONS.filter((o) => o.value !== "all");
  const buckets = opts.map((o) => ({ name: o.label, key: o.value, trades: 0, pnl: 0 }));
  const noTime = { name: "(no session time)", key: "_na", trades: 0, pnl: 0 };
  let na = false;
  for (const t of trades) {
    const p = tradeSignedAmountForAggregation(t);
    const sec = getTradeDurationSeconds(t);
    if (sec == null) {
      noTime.trades += 1;
      noTime.pnl += p;
      na = true;
      continue;
    }
    let hit = false;
    for (const o of opts) {
      if (tradeMatchesDurationBucket(t, o.value)) {
        const b = buckets.find((x) => x.key === o.value);
        if (b) {
          b.trades += 1;
          b.pnl += p;
        }
        hit = true;
        break;
      }
    }
    if (!hit) {
      noTime.trades += 1;
      noTime.pnl += p;
      na = true;
    }
  }
  const out = buckets.filter((b) => b.trades > 0);
  if (na && noTime.trades > 0) out.push(noTime);
  return out;
}

/**
 * Intraday vs multiday (see {@link tradeIsMultiday} including open-leg pairing across rows).
 *
 * @param {object[]} trades Rows to count (e.g. last-N-days slice).
 * @param {object[]|undefined} [pairingPool] Full cohort for cross-row pairing (e.g. all filter-matched trades).
 *   If omitted, defaults to `trades` (pairing only sees the same slice — often wrong for charts).
 * @returns {{ name: string, trades: number, pnl: number }[]}
 */
export function aggregateIntradayMultiday(trades, pairingPool) {
  const pool = Array.isArray(pairingPool) && pairingPool.length ? pairingPool : trades;
  const intra = { name: "Intraday", trades: 0, pnl: 0 };
  const multi = { name: "Multiday", trades: 0, pnl: 0 };
  for (const t of trades) {
    const p = tradeSignedAmountForAggregation(t);
    if (tradeIsMultiday(t, pool)) {
      multi.trades += 1;
      multi.pnl += p;
    } else {
      intra.trades += 1;
      intra.pnl += p;
    }
  }
  return [intra, multi];
}

/**
 * Hold-time buckets (first fill → last fill) in minutes.
 * @returns {{ name: string, trades: number, pnl: number }[]}
 */
export function aggregateByHoldMinuteBuckets(trades) {
  const out = [
    { name: "< 1 min", trades: 0, pnl: 0 },
    { name: "1 – 5 min", trades: 0, pnl: 0 },
    { name: "5 – 30 min", trades: 0, pnl: 0 },
    { name: "30 min – 2 h", trades: 0, pnl: 0 },
    { name: "2 – 4 h", trades: 0, pnl: 0 },
    { name: "4 h+", trades: 0, pnl: 0 },
  ];
  let naN = 0;
  let naPnl = 0;
  for (const t of trades) {
    const sec = getTradeDurationSeconds(t);
    const p = tradeSignedAmountForAggregation(t);
    if (sec == null) {
      naN += 1;
      naPnl += p;
      continue;
    }
    const min = sec / 60;
    let idx = 5;
    if (min < 1) idx = 0;
    else if (min < 5) idx = 1;
    else if (min < 30) idx = 2;
    else if (min < 120) idx = 3;
    else if (min < 240) idx = 4;
    out[idx].trades += 1;
    out[idx].pnl += p;
  }
  const rows = out.filter((r) => r.trades > 0);
  if (naN > 0) rows.push({ name: "(no session time)", trades: naN, pnl: naPnl });
  return rows;
}

/**
 * Sum P&amp;L by label (tags or setups). Each trade contributes its full P&amp;L once per label on that trade.
 * Trades with no labels roll into `emptyBucketName`.
 * @param {object[]} trades
 * @param {(trade: object) => string[]} getLabels
 * @param {string} emptyBucketName
 * @param {number} [maxRows]
 * @returns {{ name: string, pnl: number, trades: number }[]}
 */
function aggregateByTradeLabels(trades, getLabels, emptyBucketName, maxRows = 14) {
  /** @type {Map<string, { pnl: number, tradeIds: Set<string> }>} */
  const map = new Map();
  function bump(key, tradeId, p) {
    let cur = map.get(key);
    if (!cur) {
      cur = { pnl: 0, tradeIds: new Set() };
      map.set(key, cur);
    }
    cur.pnl += p;
    cur.tradeIds.add(tradeId);
  }
  for (const t of trades) {
    const p = tradeSignedAmountForAggregation(t);
    const tradeId = String(stableTradeId(t));
    const labels = getLabels(t);
    if (!labels.length) {
      bump(emptyBucketName, tradeId, p);
    } else {
      for (const name of labels) {
        bump(name, tradeId, p);
      }
    }
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, pnl: v.pnl, trades: v.tradeIds.size }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, maxRows);
}

/** Tag → summed P&amp;L (each trade counted once per tag). */
export function aggregateByTag(trades) {
  return aggregateByTradeLabels(trades, getTradeTags, "(untagged)", 14);
}

/** Setup → summed P&amp;L (each trade counted once per setup label). */
export function aggregateBySetup(trades) {
  return aggregateByTradeLabels(trades, getTradeSetups, "(no setup)", 14);
}

/**
 * @param {object[]} trades
 * @param {(t: object) => string[]} getLabels
 * @param {string} emptyLabel
 * @returns {{ name: string, pnl: number, trades: number, volume: number }[]}
 */
function buildLabelPnLVolumeRows(trades, getLabels, emptyLabel) {
  /** @type {Map<string, { pnl: number, tradeIds: Set<string>, volume: number }>} */
  const map = new Map();
  function bump(key, tradeId, p, vol) {
    let cur = map.get(key);
    if (!cur) {
      cur = { pnl: 0, tradeIds: new Set(), volume: 0 };
      map.set(key, cur);
    }
    cur.pnl += p;
    cur.tradeIds.add(tradeId);
    cur.volume += vol;
  }
  for (const t of trades) {
    const p = tradeSignedAmountForAggregation(t);
    const vol = Number(t.volume) || 0;
    const tradeId = String(stableTradeId(t));
    const labels = getLabels(t);
    if (!labels.length) bump(emptyLabel, tradeId, p, vol);
    else for (const name of labels) bump(name, tradeId, p, vol);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, pnl: v.pnl, trades: v.tradeIds.size, volume: v.volume }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
}

/** All tags with summed net P&amp;L, trade count, and volume (volume summed per tag row like P&amp;L). */
export function buildTagPnLVolumeRows(trades) {
  return buildLabelPnLVolumeRows(trades, getTradeTags, "(untagged)");
}

/** All setups with summed net P&amp;L, trade count, and volume. */
export function buildSetupPnLVolumeRows(trades) {
  return buildLabelPnLVolumeRows(trades, getTradeSetups, "(no setup)");
}

/**
 * Trades that carry two or more labels — one row per distinct multiset (sorted join).
 * @param {object[]} trades
 * @param {(t: object) => string[]} getLabels
 * @returns {{ name: string, pnl: number, trades: number, volume: number }[]}
 */
function buildLabelCombinationRows(trades, getLabels) {
  /** @type {Map<string, { pnl: number, tradeIds: Set<string>, volume: number }>} */
  const map = new Map();
  for (const t of trades) {
    const labels = getLabels(t);
    if (labels.length < 2) continue;
    const key = [...labels].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })).join(" · ");
    const p = tradeSignedAmountForAggregation(t);
    const vol = Number(t.volume) || 0;
    const tradeId = String(stableTradeId(t));
    let cur = map.get(key);
    if (!cur) {
      cur = { pnl: 0, tradeIds: new Set(), volume: 0 };
      map.set(key, cur);
    }
    if (cur.tradeIds.has(tradeId)) continue;
    cur.tradeIds.add(tradeId);
    cur.pnl += p;
    cur.volume += vol;
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, pnl: v.pnl, trades: v.tradeIds.size, volume: v.volume }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
}

export function buildTagCombinationRows(trades) {
  return buildLabelCombinationRows(trades, getTradeTags);
}

export function buildSetupCombinationRows(trades) {
  return buildLabelCombinationRows(trades, getTradeSetups);
}

/**
 * Per-label stats from trades that carry that label (trade counted once per label).
 * @returns {{ name: string, pnl: number, trades: number, volume: number, winPct: number | null, profitFactor: number | null, avgPosMfe: number | null, avgPosMae: number | null }[]}
 */
function buildLabelDetailedRows(trades, getLabels, emptyLabel) {
  /** @type {Map<string, object[]>} */
  const by = new Map();
  function add(key, trade) {
    let arr = by.get(key);
    if (!arr) {
      arr = [];
      by.set(key, arr);
    }
    arr.push(trade);
  }
  for (const t of trades) {
    const labels = getLabels(t);
    if (!labels.length) add(emptyLabel, t);
    else for (const name of labels) add(name, t);
  }
  const rows = [];
  for (const [name, list] of by) {
    let wins = 0;
    let losses = 0;
    for (const t of list) {
      const p = tradeSignedAmountForAggregation(t);
      if (p > 0) wins += 1;
      else if (p < 0) losses += 1;
    }
    const decided = wins + losses;
    const winPct = decided > 0 ? (wins / decided) * 100 : null;
    const profitFactor = computeProfitFactor(list);
    let mfeSum = 0;
    let maeSum = 0;
    let mfeN = 0;
    let maeN = 0;
    for (const t of list) {
      const r = computeFillReplayStats(t);
      if (r?.mfeDollars != null && Number.isFinite(r.mfeDollars)) {
        mfeSum += r.mfeDollars;
        mfeN += 1;
      }
      if (r?.maeDollars != null && Number.isFinite(r.maeDollars)) {
        maeSum += r.maeDollars;
        maeN += 1;
      }
    }
    const avgPosMfe = mfeN ? mfeSum / mfeN : null;
    const avgPosMae = maeN ? maeSum / maeN : null;
    const pnl = list.reduce((s, t) => s + tradeSignedAmountForAggregation(t), 0);
    const volume = list.reduce((s, t) => s + (Number(t.volume) || 0), 0);
    rows.push({
      name,
      pnl,
      trades: list.length,
      volume,
      winPct,
      profitFactor,
      avgPosMfe,
      avgPosMae,
    });
  }
  rows.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
  return rows;
}

export function buildTagDetailedRows(trades) {
  return buildLabelDetailedRows(trades, getTradeTags, "(untagged)");
}

export function buildSetupDetailedRows(trades) {
  return buildLabelDetailedRows(trades, getTradeSetups, "(no setup)");
}

/** Last `count` calendar days ending today (ISO dates, oldest first). */
export function getRecentCalendarDays(count) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    out.push(localISODate(d));
  }
  return out;
}

/** Finer VWAP-style price buckets for Reports → Detailed (share price). */
const REPORT_DETAIL_PRICE_BUCKETS = [
  { name: "< $2", min: 0, max: 2 },
  { name: "$2 – $4.99", min: 2, max: 5 },
  { name: "$5 – $9.99", min: 5, max: 10 },
  { name: "$10 – $19.99", min: 10, max: 20 },
  { name: "$20 – $49.99", min: 20, max: 50 },
  { name: "$50 – $99.99", min: 50, max: 100 },
  { name: "$100 – $249.99", min: 100, max: 250 },
  { name: "$250 – $499.99", min: 250, max: 500 },
  { name: "$500 – $999.99", min: 500, max: 1000 },
  { name: "$1,000+", min: 1000, max: Infinity },
];

/** @returns {{ name: string, pnl: number, trades: number }[]} */
export function aggregateByDetailedPriceBucket(trades) {
  const rows = REPORT_DETAIL_PRICE_BUCKETS.map((b) => ({ name: b.name, pnl: 0, trades: 0 }));
  for (const t of trades) {
    const px = tradeAvgFillPrice(t);
    if (px == null || Number.isNaN(px)) continue;
    const p = tradeSignedAmountForAggregation(t);
    const idx = REPORT_DETAIL_PRICE_BUCKETS.findIndex((b) => px >= b.min && px < b.max);
    if (idx < 0) continue;
    rows[idx].pnl += p;
    rows[idx].trades += 1;
  }
  return rows.filter((r) => r.trades > 0);
}

const SHARE_VOLUME_DETAIL_BUCKETS = [
  { name: "1", min: 1, max: 1 },
  { name: "2 – 4", min: 2, max: 4 },
  { name: "5 – 9", min: 5, max: 9 },
  { name: "10 – 19", min: 10, max: 19 },
  { name: "20 – 49", min: 20, max: 49 },
  { name: "50 – 99", min: 50, max: 99 },
  { name: "100 – 199", min: 100, max: 199 },
  { name: "200 – 499", min: 200, max: 499 },
  { name: "500 – 999", min: 500, max: 999 },
  { name: "1k – 1,999", min: 1000, max: 1999 },
  { name: "2k – 2,999", min: 2000, max: 2999 },
  { name: "3k+", min: 3000, max: Infinity },
];

/** Per-trade share/contract count (`trade.volume`). */
export function aggregateByShareVolumeBucket(trades) {
  const rows = SHARE_VOLUME_DETAIL_BUCKETS.map((b) => ({ name: b.name, pnl: 0, trades: 0 }));
  for (const t of trades) {
    const v = Math.abs(Number(t.volume)) || 0;
    if (v <= 0) continue;
    const p = tradeSignedAmountForAggregation(t);
    const idx = SHARE_VOLUME_DETAIL_BUCKETS.findIndex((b) => v >= b.min && v <= b.max);
    if (idx < 0) continue;
    rows[idx].pnl += p;
    rows[idx].trades += 1;
  }
  return rows.filter((r) => r.trades > 0);
}

/** @returns {{ name: string, pnl: number, trades: number }[]} sorted by P&amp;L descending */
export function aggregateBySymbolPnL(trades) {
  const map = new Map();
  for (const t of trades) {
    const sym = String(t.symbol ?? "").trim() || "(no symbol)";
    const cur = map.get(sym) || { pnl: 0, trades: 0 };
    cur.pnl += tradeSignedAmountForAggregation(t);
    cur.trades += 1;
    map.set(sym, cur);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, pnl: v.pnl, trades: v.trades }))
    .sort((a, b) => b.pnl - a.pnl);
}

/**
 * @param {{ name: string, pnl: number, trades: number }[]} rows
 * @param {number} n
 */
export function symbolTopAndBottom(rows, n) {
  const top = [...rows].sort((a, b) => b.pnl - a.pnl).slice(0, n);
  const bottom = [...rows].sort((a, b) => a.pnl - b.pnl).slice(0, n);
  return { top, bottom };
}

/**
 * Buckets trades by whether that **calendar day’s net P&amp;L** (all trades that day) was positive, flat, or negative.
 * @returns {{ name: string, pnl: number, trades: number }[]}
 */
export function aggregateByCalendarDayTone(trades) {
  const grouped = groupTradesByDate(trades);
  const buckets = [
    { name: "Green day (net +)", pnl: 0, trades: 0 },
    { name: "Flat day (≈0)", pnl: 0, trades: 0 },
    { name: "Red day (net −)", pnl: 0, trades: 0 },
  ];
  const idxForDate = (dateStr) => {
    const g = grouped[dateStr];
    if (!g) return 2;
    const dayPnl = Number(g.pnl) || 0;
    if (dayPnl > 0.01) return 0;
    if (dayPnl < -0.01) return 2;
    return 1;
  };
  for (const t of trades) {
    if (!t.date) continue;
    const i = idxForDate(t.date);
    const p = tradeSignedAmountForAggregation(t);
    buckets[i].trades += 1;
    buckets[i].pnl += p;
  }
  return buckets.filter((b) => b.trades > 0);
}

function tradeNotionalUsd(trade) {
  const px = tradeAvgFillPrice(trade);
  const v = Math.abs(Number(trade.volume)) || 0;
  if (px == null || !Number.isFinite(px) || v <= 0) return null;
  return px * v;
}

const NOTIONAL_DETAIL_BUCKETS = [
  { name: "< $500", min: 0, max: 500 },
  { name: "$500 – $2k", min: 500, max: 2000 },
  { name: "$2k – $10k", min: 2000, max: 10_000 },
  { name: "$10k – $50k", min: 10_000, max: 50_000 },
  { name: "$50k+", min: 50_000, max: Infinity },
];

/** Approx. dollars at risk: |avg fill| × volume. */
export function aggregateByNotionalBucket(trades) {
  const rows = NOTIONAL_DETAIL_BUCKETS.map((b) => ({ name: b.name, pnl: 0, trades: 0 }));
  for (const t of trades) {
    const n = tradeNotionalUsd(t);
    if (n == null || n <= 0) continue;
    const p = tradeSignedAmountForAggregation(t);
    const idx = NOTIONAL_DETAIL_BUCKETS.findIndex((b) =>
      b.max === Infinity ? n >= b.min : n >= b.min && n < b.max,
    );
    if (idx < 0) continue;
    rows[idx].pnl += p;
    rows[idx].trades += 1;
  }
  return rows.filter((r) => r.trades > 0);
}

/** @returns {{ name: string, pnl: number, trades: number }[]} */
export function aggregateByFillCountBucket(trades) {
  const defs = [
    { name: "1 fill", min: 1, max: 1 },
    { name: "2 fills", min: 2, max: 2 },
    { name: "3 – 5 fills", min: 3, max: 5 },
    { name: "6 – 10 fills", min: 6, max: 10 },
    { name: "11+ fills", min: 11, max: Infinity },
  ];
  const rows = defs.map((b) => ({ name: b.name, pnl: 0, trades: 0 }));
  const noFills = { name: "(no fills)", pnl: 0, trades: 0 };
  for (const t of trades) {
    const p = tradeSignedAmountForAggregation(t);
    const n = (t.fills ?? []).length;
    if (n === 0) {
      noFills.trades += 1;
      noFills.pnl += p;
      continue;
    }
    const idx = defs.findIndex((b) => n >= b.min && n <= b.max);
    if (idx < 0) continue;
    rows[idx].trades += 1;
    rows[idx].pnl += p;
  }
  const out = rows.filter((r) => r.trades > 0);
  if (noFills.trades > 0) out.push(noFills);
  return out;
}

function tradeAvgAbsFillQty(trade) {
  const fills = trade.fills ?? [];
  if (!fills.length) return null;
  let sum = 0;
  for (const f of fills) {
    sum += Math.abs(Number(f.quantity)) || 0;
  }
  return sum / fills.length;
}

const AVG_FILL_QTY_BUCKETS = [
  { name: "< 10 sh", min: 0, max: 10 },
  { name: "10 – 99", min: 10, max: 100 },
  { name: "100 – 499", min: 100, max: 500 },
  { name: "500+", min: 500, max: Infinity },
];

/** Mean absolute fill size per execution (requires fills). */
export function aggregateByAvgFillQtyBucket(trades) {
  const rows = AVG_FILL_QTY_BUCKETS.map((b) => ({ name: b.name, pnl: 0, trades: 0 }));
  const na = { name: "(no fills)", pnl: 0, trades: 0 };
  for (const t of trades) {
    const p = tradeSignedAmountForAggregation(t);
    const avgQ = tradeAvgAbsFillQty(t);
    if (avgQ == null) {
      na.trades += 1;
      na.pnl += p;
      continue;
    }
    const idx = AVG_FILL_QTY_BUCKETS.findIndex((b) =>
      b.max === Infinity ? avgQ >= b.min : avgQ >= b.min && avgQ < b.max,
    );
    if (idx < 0) continue;
    rows[idx].trades += 1;
    rows[idx].pnl += p;
  }
  const out = rows.filter((r) => r.trades > 0);
  if (na.trades > 0) out.push(na);
  return out;
}

/** Gross sum of winning / losing trade P&amp;Ls (wins positive, losses negative). */
export function grossWinLossTotals(trades) {
  let wins = 0;
  let losses = 0;
  for (const t of trades) {
    const p = tradeSignedAmountForAggregation(t);
    if (p > 0) wins += p;
    else if (p < 0) losses += p;
  }
  return { grossWins: wins, grossLosses: losses };
}
