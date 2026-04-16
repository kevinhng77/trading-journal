/**
 * Exponential moving average aligned to `closes` (same length, leading nulls until period is satisfied).
 * @param {number[]} closes
 * @param {number} period
 * @returns {(number | null)[]}
 */
export function computeEMA(closes, period) {
  const n = closes.length;
  const out = Array.from({ length: n }, () => null);
  if (period < 1 || n < period) return out;

  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i];
  out[period - 1] = sum / period;
  for (let i = period; i < n; i++) {
    out[i] = closes[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

/**
 * @param {{ time: unknown, close: number }[]} lwBars
 * @param {number} period
 * @returns {{ time: unknown, value: number }[]}
 */
export function emaLineDataFromBars(lwBars, period) {
  if (!lwBars.length || period < 1) return [];
  const closes = lwBars.map((b) => b.close);
  const ema = computeEMA(closes, period);
  const out = [];
  for (let i = 0; i < lwBars.length; i++) {
    const v = ema[i];
    if (v == null || Number.isNaN(v)) continue;
    out.push({ time: lwBars[i].time, value: v });
  }
  return out;
}

/**
 * Simple moving average (trailing window) aligned to closes.
 * @param {number[]} closes
 * @param {number} period
 * @returns {(number | null)[]}
 */
export function computeSMA(closes, period) {
  const n = closes.length;
  const out = Array.from({ length: n }, () => null);
  if (period < 1 || n < period) return out;
  for (let i = period - 1; i < n; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += closes[j];
    out[i] = s / period;
  }
  return out;
}

/**
 * @param {{ time: unknown, close: number }[]} lwBars
 * @param {number} period
 * @returns {{ time: unknown, value: number }[]}
 */
export function smaLineDataFromBars(lwBars, period) {
  if (!lwBars.length || period < 1) return [];
  const closes = lwBars.map((b) => b.close);
  const sma = computeSMA(closes, period);
  const out = [];
  for (let i = 0; i < lwBars.length; i++) {
    const v = sma[i];
    if (v == null || Number.isNaN(v)) continue;
    out.push({ time: lwBars[i].time, value: v });
  }
  return out;
}

