import { format, parseISO, subDays, subMonths, subYears } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  chartIntervalToAlpacaTimeframe,
  intervalHistoryKey,
  isDailyLikeInterval,
} from "../lib/chartIntervals";
import { assertLiveChartProxyOrThrow, chartProxyUrl } from "../lib/chartApiEnv";
import { fetchMassiveStockBars } from "./massiveBars";

/**
 * Calendar days before the trade date (intraday). Wide window so we can request deep history; the
 * bar cap below trims what we keep (newest-first fetch) so the trade day stays in range.
 */
const LOOKBACK_DAYS = {
  1: 60,
  3: 90,
  5: 120,
  15: 180,
  30: 240,
  60: 400,
  120: 520,
  240: 730,
};

/** Hard cap on bars fetched (also limits pagination). */
const MAX_BARS_CAP = {
  1: 25_000,
  3: 25_000,
  5: 25_000,
  15: 25_000,
  30: 25_000,
  60: 25_000,
  120: 30_000,
  240: 35_000,
  D: 5000,
  W: 780,
};

/**
 * @param {Response} res
 * @param {string} text
 * @returns {object}
 */
function parseAlpacaJsonBody(res, text) {
  const trimmed = (text ?? "").trim();

  if (!trimmed) {
    if (res.ok) return {};
    const err = new Error(
      `Alpaca returned an empty body (HTTP ${res.status}). Check your network and that the URL is correct.`,
    );
    err.status = res.status;
    throw err;
  }

  const lower = trimmed.slice(0, 64).toLowerCase();
  if (lower.startsWith("<!doctype") || lower.startsWith("<html") || trimmed.startsWith("<")) {
    const err = new Error(
      "Received a web page instead of market data. Use npm run dev, or set VITE_CHART_API_ORIGIN to your Vercel chart proxy and rebuild.",
    );
    err.status = res.status;
    err.isHtmlFallback = true;
    throw err;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const snip = trimmed.slice(0, 200).replace(/\s+/g, " ");
    const err = new Error(
      `Alpaca response was not JSON (HTTP ${res.status}). Start of body: ${snip}`,
    );
    err.status = res.status;
    throw err;
  }
}

export { chartIntervalToAlpacaTimeframe };

export function isDailyInterval(interval) {
  return isDailyLikeInterval(interval);
}

/**
 * Wide Alpaca range for deep history; the chart fits the loaded bar span on first paint.
 * @param {string} tradeIsoDate - YYYY-MM-DD
 * @param {string} chartInterval - UI value (see `chartIntervals.js`)
 * @returns {{ start: string, end: string, maxTotalBars: number }}
 */
export function chartHistoryQuery(tradeIsoDate, chartInterval) {
  const dailyLike = isDailyLikeInterval(chartInterval);
  const trade = parseISO(tradeIsoDate);
  const today = new Date();
  const key = intervalHistoryKey(chartInterval);
  const maxTotalBars = MAX_BARS_CAP[key] ?? MAX_BARS_CAP[1];

  if (dailyLike) {
    const yearsBack = chartInterval === "W" ? 10 : 5;
    const start = subYears(trade, yearsBack);
    return {
      start: format(start, "yyyy-MM-dd"),
      end: tradeIsoDate,
      maxTotalBars,
    };
  }

  const lookbackDays = LOOKBACK_DAYS[key] ?? LOOKBACK_DAYS[1];
  const startLocal = subDays(trade, lookbackDays);
  const startStr = format(startLocal, "yyyy-MM-dd");
  const start = fromZonedTime(`${startStr}T00:00:00`, "America/New_York");

  let end = fromZonedTime(`${tradeIsoDate}T23:59:59.999`, "America/New_York");
  const endMs = Math.min(end.getTime(), today.getTime());
  end = new Date(endMs);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    maxTotalBars,
  };
}

/**
 * Default visible window on intraday charts (NY time on `tradeIsoDate`).
 * @param {string} tradeIsoDate
 * @param {boolean} daily
 * @param {"full" | "extended" | "regular"} [sessionWindow]
 * @returns {{ from: string | number, to: string | number }}
 */
export function tradeDayVisibleRange(tradeIsoDate, daily, sessionWindow = "full") {
  if (daily) {
    const t = parseISO(tradeIsoDate);
    const from = format(subMonths(t, 6), "yyyy-MM-dd");
    return { from, to: tradeIsoDate };
  }
  const tz = "America/New_York";
  if (sessionWindow === "regular") {
    const from = Math.floor(
      fromZonedTime(`${tradeIsoDate}T09:30:00`, tz).getTime() / 1000,
    );
    const to = Math.floor(fromZonedTime(`${tradeIsoDate}T16:00:00`, tz).getTime() / 1000);
    return { from, to };
  }
  if (sessionWindow === "extended") {
    const from = Math.floor(fromZonedTime(`${tradeIsoDate}T04:00:00`, tz).getTime() / 1000);
    const to = Math.floor(fromZonedTime(`${tradeIsoDate}T20:00:00`, tz).getTime() / 1000);
    return { from, to };
  }
  const from = Math.floor(fromZonedTime(`${tradeIsoDate}T00:00:00`, tz).getTime() / 1000);
  const to = Math.floor(fromZonedTime(`${tradeIsoDate}T23:59:59`, tz).getTime() / 1000);
  return { from, to };
}

/**
 * Intraday default viewport for the trade execution chart: previous NY session’s after-hours
 * (4:00pm–8:00pm ET) through the trade date’s session end, so evening context before the trade day
 * is not clipped off. Regular mode stays trade-day RTH only.
 * @param {string} tradeIsoDate
 * @param {"full" | "extended" | "regular"} [sessionWindow]
 * @returns {{ from: number, to: number }}
 */
export function tradeExecutionInitialVisibleRange(tradeIsoDate, sessionWindow = "full") {
  if (sessionWindow === "regular") {
    return /** @type {{ from: number, to: number }} */ (tradeDayVisibleRange(tradeIsoDate, false, "regular"));
  }
  const tz = "America/New_York";
  const prevIso = format(subDays(parseISO(tradeIsoDate), 1), "yyyy-MM-dd");
  const from = Math.floor(fromZonedTime(`${prevIso}T16:00:00`, tz).getTime() / 1000);

  if (sessionWindow === "extended") {
    const to = Math.floor(fromZonedTime(`${tradeIsoDate}T20:00:00`, tz).getTime() / 1000);
    return { from, to };
  }

  const to = Math.floor(fromZonedTime(`${tradeIsoDate}T23:59:59`, tz).getTime() / 1000);
  return { from, to };
}

/**
 * Trade execution chart: default intraday viewport on `tradeIsoDate` (NY wall clock).
 * 6:30am → 1:00pm Eastern — morning session context without zooming to fills.
 * @param {string} tradeIsoDate YYYY-MM-DD
 * @returns {{ from: number, to: number }} unix seconds UTC
 */
export function tradeExecutionDefaultIntradayWindowNy(tradeIsoDate) {
  const tz = "America/New_York";
  const from = Math.floor(fromZonedTime(`${tradeIsoDate}T06:30:00`, tz).getTime() / 1000);
  const to = Math.floor(fromZonedTime(`${tradeIsoDate}T13:00:00`, tz).getTime() / 1000);
  return { from, to };
}

/**
 * US equities session boundaries on `tradeIsoDate` (America/New_York wall times → unix seconds UTC).
 * @param {string} tradeIsoDate YYYY-MM-DD
 */
export function getNySessionUnixBounds(tradeIsoDate) {
  const tz = "America/New_York";
  return {
    extendedOpen: Math.floor(fromZonedTime(`${tradeIsoDate}T04:00:00`, tz).getTime() / 1000),
    regularOpen: Math.floor(fromZonedTime(`${tradeIsoDate}T09:30:00`, tz).getTime() / 1000),
    regularClose: Math.floor(fromZonedTime(`${tradeIsoDate}T16:00:00`, tz).getTime() / 1000),
    extendedClose: Math.floor(fromZonedTime(`${tradeIsoDate}T20:00:00`, tz).getTime() / 1000),
    dayOpen: Math.floor(fromZonedTime(`${tradeIsoDate}T00:00:00`, tz).getTime() / 1000),
    dayClose: Math.floor(fromZonedTime(`${tradeIsoDate}T23:59:59`, tz).getTime() / 1000),
  };
}

/**
 * Count intraday bars whose time falls in extended hours (4am–8pm ET) on `tradeIsoDate`.
 * @param {object[]} bars - Alpaca- or Massive-shaped bars (`t` parseable by Date)
 * @param {string} tradeIsoDate - YYYY-MM-DD
 */
export function barsTouchingExtendedSession(bars, tradeIsoDate) {
  if (!tradeIsoDate || !bars?.length) return 0;
  const { from, to } = tradeDayVisibleRange(tradeIsoDate, false, "extended");
  let n = 0;
  for (const b of bars) {
    const sec = Math.floor(new Date(b.t).getTime() / 1000);
    if (sec >= from && sec <= to) n += 1;
  }
  return n;
}

/**
 * @param {string} timeStr - e.g. "9:30:15"
 * @returns {string} HH:mm:ss
 */
export function normalizeWallTime(timeStr) {
  const t = String(timeStr ?? "").trim();
  const parts = t.split(":").map((p) => p.trim());
  if (parts.length < 2) return "12:00:00";
  const h = parts[0].padStart(2, "0");
  const m = parts[1].padStart(2, "0");
  let s = parts[2] ?? "00";
  s = String(s).replace(/\D/g, "").slice(0, 2).padStart(2, "0") || "00";
  return `${h}:${m}:${s}`;
}

/**
 * @param {string} isoDate - YYYY-MM-DD
 * @param {string} timeStr - wall clock in `timeZone`
 * @param {string} timeZone - IANA
 * @returns {number} Unix seconds UTC
 */
export function fillWallTimeToUnixSeconds(isoDate, timeStr, timeZone) {
  const wall = `${isoDate}T${normalizeWallTime(timeStr)}`;
  const d = fromZonedTime(wall, timeZone);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Fetches bars newest-first internally then returns ascending time order.
 * When the requested window has more than `maxTotalBars` points, Alpaca `sort=asc` would keep only
 * the oldest slice and drop the trade day / after-hours — `sort=desc` keeps the tail of the range.
 *
 * @param {object} params
 * @param {string} params.symbol
 * @param {string} params.timeframe
 * @param {string} params.start
 * @param {string} params.end
 * @param {string} [params.feed]
 * @param {number} [params.maxTotalBars]
 * @param {number} [params.maxPages] - cap sequential Alpaca pages (10k bars/page) to limit latency
 * @returns {Promise<{ bars: object[], truncated: boolean }>}
 */
export async function fetchAlpacaStockBars({
  symbol,
  timeframe,
  start,
  end,
  feed,
  maxTotalBars = 25_000,
  maxPages = 10,
}) {
  assertLiveChartProxyOrThrow();

  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const clipStart = Number.isFinite(startMs);
  const clipEnd = Number.isFinite(endMs);

  /** Newest → oldest while paging; reversed before return. */
  const out = [];
  let pageToken = null;
  let truncated = false;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      symbols: symbol,
      timeframe,
      start,
      end,
      adjustment: "split",
      sort: "desc",
      limit: "10000",
    });
    if (feed) params.set("feed", feed);
    if (pageToken) params.set("page_token", pageToken);

    const res = await fetch(chartProxyUrl("alpaca", `/v2/stocks/bars?${params.toString()}`));
    const text = await res.text();
    const data = parseAlpacaJsonBody(res, text);

    if (!res.ok) {
      const msg = data.message || data.error || text || res.statusText;
      const err = new Error(typeof msg === "string" ? msg : `Alpaca error ${res.status}`);
      err.status = res.status;
      throw err;
    }

    const chunk = data.bars?.[symbol] ?? [];
    let reachedBeforeStart = false;
    for (const b of chunk) {
      const t = new Date(b.t).getTime();
      if (!Number.isFinite(t)) continue;
      if (clipEnd && t > endMs) continue;
      if (clipStart && t < startMs) {
        reachedBeforeStart = true;
        break;
      }
      out.push(b);
      if (out.length >= maxTotalBars) {
        truncated = true;
        break;
      }
    }

    if (truncated || reachedBeforeStart) break;

    pageToken = data.next_page_token;
    if (!pageToken) break;
  }

  out.reverse();
  return { bars: out, truncated };
}

/**
 * Prefer consolidated tape (SIP) for pre/post market; then delayed SIP; then IEX (mostly regular hours).
 * Optionally falls back to Massive aggregates when ETH is empty or only IEX is available.
 * @param {object} params
 * @param {string} [params.tradeIsoDate] - YYYY-MM-DD (trade day) for extended-session detection
 * @param {string} [params.chartInterval] - UI interval 1 | 5 | 15 | 60 | D
 * @returns {Promise<{ bars: object[], feedUsed: string | null, truncated: boolean }>}
 */
export async function fetchBarsWithFeedFallback({
  symbol,
  timeframe,
  start,
  end,
  maxTotalBars,
  tradeIsoDate: _tradeIsoDate,
  chartInterval,
}) {
  void _tradeIsoDate;
  const attempts = [
    { feed: "sip", label: "sip" },
    { feed: "delayed_sip", label: "delayed_sip" },
    { feed: "iex", label: "iex" },
  ];

  let lastErr = null;
  /** @type {{ bars: object[], feedUsed: string | null, truncated: boolean }} */
  let result = { bars: [], feedUsed: null, truncated: false };

  for (const { feed, label } of attempts) {
    try {
      const { bars, truncated } = await fetchAlpacaStockBars({
        symbol,
        timeframe,
        start,
        end,
        feed,
        maxTotalBars,
        maxPages: 10,
      });
      if (bars.length) {
        result = { bars, feedUsed: label, truncated };
        break;
      }
    } catch (e) {
      lastErr = e;
      if (e.status === 403 || e.status === 401) continue;
      // Older accounts may not recognize delayed_sip; skip to IEX instead of failing the whole chart.
      if (e.status === 400 && label === "delayed_sip") continue;
      throw e;
    }
  }

  const daily = isDailyInterval(chartInterval ?? "");

  /** Second network round-trip only when Alpaca returned nothing or only IEX (no SIP). */
  const shouldTryMassive = daily ? result.bars.length === 0 : result.bars.length === 0 || result.feedUsed === "iex";

  if (shouldTryMassive) {
    try {
      const m = await fetchMassiveStockBars({
        symbol,
        timeframe,
        start,
        end,
        daily,
        maxTotalBars,
        maxPages: 8,
      });
      if (m.bars.length) {
        if (result.bars.length === 0) {
          return { bars: m.bars, feedUsed: "massive", truncated: m.truncated };
        }
        if (result.feedUsed === "iex") {
          return { bars: m.bars, feedUsed: "massive", truncated: m.truncated };
        }
      }
    } catch {
      /* keep Alpaca result */
    }
  }

  if (result.bars.length === 0 && lastErr) throw lastErr;
  return result;
}

/**
 * @param {object} bar - Alpaca bar
 * @param {boolean} daily
 */
export function alpacaBarToLightweight(bar, daily) {
  if (daily) {
    const sessionDay = formatInTimeZone(new Date(bar.t), "America/New_York", "yyyy-MM-dd");
    return {
      time: sessionDay,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
    };
  }
  const sec = Math.floor(new Date(bar.t).getTime() / 1000);
  return {
    time: sec,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
  };
}

export function alpacaBarToVolumeHistogram(bar, daily) {
  const candle = alpacaBarToLightweight(bar, daily);
  const up = bar.c >= bar.o;
  return {
    time: candle.time,
    value: bar.v ?? 0,
    /* Thinkorswim-style: green up-volume, red down-volume */
    color: up ? "rgba(8, 153, 129, 0.72)" : "rgba(242, 54, 69, 0.72)",
  };
}

/**
 * @param {number[]} barTimesAsc
 * @param {number} targetUnix
 */
export function snapUnixToNearestBarTime(barTimesAsc, targetUnix) {
  if (!barTimesAsc.length) return targetUnix;

  const targetMin = Math.floor(targetUnix / 60);
  let sameMinute = null;
  let sameMinuteDist = Infinity;
  for (const t of barTimesAsc) {
    if (Math.floor(t / 60) !== targetMin) continue;
    const a = Math.abs(t - targetUnix);
    if (a < sameMinuteDist) {
      sameMinuteDist = a;
      sameMinute = t;
    }
  }
  if (sameMinute != null) return sameMinute;

  let best = barTimesAsc[0];
  let bestAbs = Math.abs(best - targetUnix);
  for (const t of barTimesAsc) {
    const a = Math.abs(t - targetUnix);
    if (a < bestAbs) {
      bestAbs = a;
      best = t;
    }
  }
  return best;
}
