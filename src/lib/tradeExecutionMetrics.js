/**
 * Metrics derived from imported fills (Thinkorswim-style): fees, gross vs net, and
 * fill-sequence approximations for MFE/MAE when tick data is unavailable.
 */

/**
 * @param {object} trade
 * @returns {number}
 */
export function sumFillField(trade, key) {
  const fills = trade?.fills;
  if (!Array.isArray(fills)) return 0;
  return fills.reduce((s, f) => {
    const v = Number(f?.[key]);
    return s + (Number.isFinite(v) ? v : 0);
  }, 0);
}

/** Commissions column from import (typically negative). Returns total signed sum. */
export function tradeCommissionsSigned(trade) {
  return sumFillField(trade, "commission");
}

/** Misc / regulatory fees (typically negative). */
export function tradeMiscFeesSigned(trade) {
  return sumFillField(trade, "miscFees");
}

/** Sum of AMOUNT cells (market consideration before fees), when present. */
export function tradeAmountSum(trade) {
  return sumFillField(trade, "amount");
}

/** Positive dollars paid in commissions + misc (0 if unknown). */
export function tradeFeesPaid(trade) {
  const c = tradeCommissionsSigned(trade);
  const m = tradeMiscFeesSigned(trade);
  if (c === 0 && m === 0 && !(trade?.fills ?? []).some((f) => f && ("commission" in f || "miscFees" in f))) {
    return 0;
  }
  return Math.max(0, -(c + m));
}

/**
 * Gross market P&amp;L from amount column when present; else falls back to closed P&amp;L.
 * @param {object} trade
 */
export function tradeGrossPnl(trade) {
  const fills = trade?.fills ?? [];
  if (!fills.length) return Number(trade?.pnl) || 0;
  const hasAmount = fills.some((f) => f && f.amount != null && Number.isFinite(Number(f.amount)));
  if (!hasAmount) return Number(trade?.pnl) || 0;
  return Math.round(tradeAmountSum(trade) * 100) / 100;
}

/**
 * Cash P&amp;L including per-row misc and commissions: sum of fill **`netCash`** when fills carry it;
 * otherwise falls back to stored **`trade.pnl`**.
 * @param {object} trade
 */
export function tradeNetPnl(trade) {
  const fills = trade?.fills ?? [];
  let sum = 0;
  let n = 0;
  for (const f of fills) {
    if (f?.netCash == null || !Number.isFinite(Number(f.netCash))) continue;
    sum += Number(f.netCash);
    n += 1;
  }
  if (n > 0) return Math.round(sum * 100) / 100;
  return Math.round((Number(trade?.pnl) || 0) * 100) / 100;
}

/**
 * One trade’s contribution to day / symbol totals: sum fill **`AMOUNT`** when present (Schwab cash grid),
 * else **`netCash`**, else stored **`pnl`**. Matches statement **Profits and Losses** / spreadsheet
 * `day_pnl[date] += AMOUNT` behavior.
 * @param {object} trade
 * @returns {number}
 */
export function tradeSignedAmountForAggregation(trade) {
  const fills = trade?.fills;
  if (Array.isArray(fills) && fills.length > 0) {
    let sum = 0;
    let any = false;
    for (const f of fills) {
      if (f == null) continue;
      const raw =
        f.amount != null && Number.isFinite(Number(f.amount)) ? f.amount : f.netCash;
      if (raw == null) continue;
      const v = Number(raw);
      if (Number.isFinite(v)) {
        any = true;
        sum += v;
      }
    }
    if (any) return Math.round(sum * 100) / 100;
  }
  return Math.round((Number(trade?.pnl) || 0) * 100) / 100;
}

/**
 * Replay fills with average-cost inventory; track unrealized at each mark and
 * best single exit-leg P&amp;L.
 * @param {object} trade
 */
export function computeFillReplayStats(trade) {
  const sorted = [...(trade?.fills ?? [])].sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? "")));
  if (sorted.length === 0) {
    return {
      mfeDollars: null,
      maeDollars: null,
      maxAbsShares: 0,
      bestExitDollars: null,
      exitEfficiency: null,
    };
  }

  let pos = 0;
  let avgCost = 0;
  let maxFav = 0;
  let maxAdv = 0;
  let maxAbs = 0;
  let bestExit = null;

  const unrealized = (mark) => {
    if (pos === 0 || !Number.isFinite(avgCost)) return 0;
    if (pos > 0) return pos * (mark - avgCost);
    return -pos * (avgCost - mark);
  };

  for (const f of sorted) {
    const p = Number(f.price);
    const qty = Math.abs(Number(f.quantity));
    const side = String(f.side || "").toUpperCase();
    const delta = side === "BOT" ? qty : side === "SOLD" ? -qty : 0;
    if (!Number.isFinite(p) || !delta) continue;

    const u = unrealized(p);
    if (u > maxFav) maxFav = u;
    if (u < -maxAdv) maxAdv = -u;
    maxAbs = Math.max(maxAbs, Math.abs(pos));

    if (pos !== 0 && Math.sign(delta) !== Math.sign(pos)) {
      const closeQty = Math.min(Math.abs(pos), Math.abs(delta));
      let leg = 0;
      if (pos > 0) leg = closeQty * (p - avgCost);
      else leg = closeQty * (avgCost - p);
      if (bestExit === null || leg > bestExit) bestExit = leg;
    }

    const newPos = pos + delta;
    if (pos === 0) {
      pos = delta;
      avgCost = p;
    } else if (Math.sign(pos) === Math.sign(delta)) {
      avgCost = (Math.abs(pos) * avgCost + Math.abs(delta) * p) / Math.abs(newPos);
      pos = newPos;
    } else {
      if (Math.abs(delta) < Math.abs(pos)) {
        pos = newPos;
      } else if (Math.abs(delta) === Math.abs(pos)) {
        pos = 0;
        avgCost = 0;
      } else {
        pos = newPos;
        avgCost = p;
      }
    }
    maxAbs = Math.max(maxAbs, Math.abs(pos));
  }

  const net = tradeSignedAmountForAggregation(trade);
  const mfe = sorted.length >= 2 ? Math.round(maxFav * 100) / 100 : null;
  const mae = sorted.length >= 2 ? Math.round(maxAdv * 100) / 100 : null;
  const eff =
    mfe != null && mfe > 1e-6 && Number.isFinite(net) ? Math.round((net / mfe) * 1000) / 1000 : null;

  return {
    mfeDollars: mfe,
    maeDollars: mae,
    maxAbsShares: maxAbs,
    bestExitDollars: bestExit != null ? Math.round(bestExit * 100) / 100 : null,
    exitEfficiency: eff,
  };
}

/**
 * Aggregate fees / gross / replay stats for a list of trades (e.g. one journal day).
 * @param {object[]} rows
 */
export function aggregateDayExecutionMetrics(rows) {
  if (!rows?.length) {
    return {
      feesPaid: 0,
      grossPnl: 0,
      netPnl: 0,
      avgMfe: null,
      avgMae: null,
      hasReplay: false,
    };
  }
  let fees = 0;
  let gross = 0;
  let net = 0;
  const mfes = [];
  const maes = [];
  for (const t of rows) {
    fees += tradeFeesPaid(t);
    gross += tradeGrossPnl(t);
    net += tradeSignedAmountForAggregation(t);
    const r = computeFillReplayStats(t);
    if (r.mfeDollars != null) mfes.push(r.mfeDollars);
    if (r.maeDollars != null) maes.push(r.maeDollars);
  }
  const avgMfe = mfes.length ? mfes.reduce((a, b) => a + b, 0) / mfes.length : null;
  const avgMae = maes.length ? maes.reduce((a, b) => a + b, 0) / maes.length : null;
  return {
    feesPaid: Math.round(fees * 100) / 100,
    grossPnl: Math.round(gross * 100) / 100,
    netPnl: Math.round(net * 100) / 100,
    avgMfe: avgMfe != null ? Math.round(avgMfe * 100) / 100 : null,
    avgMae: avgMae != null ? Math.round(avgMae * 100) / 100 : null,
    hasReplay: mfes.length > 0 && maes.length > 0,
  };
}

/**
 * Portfolio-level stats for a filtered trade list (reports, etc.).
 * @param {object[]} trades
 */
export function aggregateFilteredTradesMetrics(trades) {
  const list = trades ?? [];
  let commSigned = 0;
  let miscSigned = 0;
  let gross = 0;
  let net = 0;
  const mfes = [];
  const maes = [];
  for (const t of list) {
    commSigned += tradeCommissionsSigned(t);
    miscSigned += tradeMiscFeesSigned(t);
    gross += tradeGrossPnl(t);
    net += tradeSignedAmountForAggregation(t);
    const r = computeFillReplayStats(t);
    if (r.mfeDollars != null) mfes.push(r.mfeDollars);
    if (r.maeDollars != null) maes.push(r.maeDollars);
  }
  const totalCommissionsPaid = Math.round(Math.max(0, -commSigned) * 100) / 100;
  const totalMiscPaid = Math.round(Math.max(0, -miscSigned) * 100) / 100;
  const totalFeesPaid = Math.round(Math.max(0, -(commSigned + miscSigned)) * 100) / 100;
  return {
    totalCommissionsPaid,
    totalMiscPaid,
    totalFeesPaid,
    grossPnl: Math.round(gross * 100) / 100,
    netPnl: Math.round(net * 100) / 100,
    avgReplayMfe: mfes.length ? Math.round((mfes.reduce((a, b) => a + b, 0) / mfes.length) * 100) / 100 : null,
    avgReplayMae: maes.length ? Math.round((maes.reduce((a, b) => a + b, 0) / maes.length) * 100) / 100 : null,
  };
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26). */
function normCdf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/**
 * Two-sided p-value for H0: true win rate = 50% (coin flip), normal approx.
 * @param {number} wins
 * @param {number} n decided trades
 */
export function winRateVsRandomPValue(wins, n) {
  if (n < 1) return null;
  const z = (wins - n * 0.5) / Math.sqrt(n * 0.25);
  const p = 2 * (1 - normCdf(Math.abs(z)));
  return Math.max(0, Math.min(1, p));
}

/**
 * Kelly fraction (full Kelly) for binary outcomes: f* = p - (1-p)/b, b = avgWin/|avgLoss|.
 * @param {number} p win rate 0..1
 * @param {number} avgWin
 * @param {number} avgLoss negative number
 */
export function kellyFraction(p, avgWin, avgLoss) {
  if (p <= 0 || p >= 1) return null;
  const lossAbs = Math.abs(avgLoss);
  if (lossAbs < 1e-9 || avgWin <= 0) return null;
  const b = avgWin / lossAbs;
  const f = p - (1 - p) / b;
  return Number.isFinite(f) ? f : null;
}

/**
 * Van Tharp-style SQN using per-trade R = pnl / stddev(pnl).
 * @param {object[]} trades
 * @param {number} stdDev population std dev of pnl
 */
export function systemQualityNumber(trades, stdDev) {
  const n = trades?.length ?? 0;
  if (n < 2 || !stdDev || stdDev < 1e-9) return null;
  const mean = trades.reduce((s, t) => s + tradeSignedAmountForAggregation(t), 0) / n;
  return (Math.sqrt(n) * mean) / stdDev;
}

/**
 * K-ratio style: mean / stdev of daily P&amp;L in window.
 * @param {object[]} trades
 */
export function kRatioFromDailyPnL(trades) {
  const byDay = {};
  for (const t of trades ?? []) {
    const d = t.date;
    if (!d) continue;
    byDay[d] = (byDay[d] || 0) + tradeSignedAmountForAggregation(t);
  }
  const vals = Object.values(byDay);
  if (vals.length < 2) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v =
    vals.reduce((s, x) => s + (x - mean) ** 2, 0) / (vals.length > 1 ? vals.length - 1 : 1);
  const sd = Math.sqrt(v);
  if (sd < 1e-9) return null;
  return mean / sd;
}
