/**
 * Massive (formerly Polygon-style) stock aggregates — useful when Alpaca SIP / ETH coverage is thin.
 * Dev server proxies /api/massive → https://api.massive.com with MASSIVE_API_KEY as apiKey query param.
 */

import { assertLiveChartProxyOrThrow, chartProxyUrl } from "../lib/chartApiEnv";

/**
 * @param {Response} res
 * @param {string} text
 */
function parseMassiveJson(res, text) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    const err = new Error(`Massive returned empty body (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  const lower = trimmed.slice(0, 64).toLowerCase();
  if (lower.startsWith("<!doctype") || lower.startsWith("<html") || trimmed.startsWith("<")) {
    const err = new Error(
      "Received HTML instead of Massive JSON. Use npm run dev, or set VITE_CHART_API_ORIGIN and deploy the vercel-chart-proxy with MASSIVE_API_KEY.",
    );
    err.status = res.status;
    err.isHtmlFallback = true;
    throw err;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const err = new Error(`Massive response was not JSON (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
}

/** @param {string} alpacaTimeframe - e.g. 1Min, 5Min */
function massiveMultSpan(alpacaTimeframe) {
  switch (alpacaTimeframe) {
    case "2Min":
      return { mult: 2, span: "minute" };
    case "3Min":
      return { mult: 3, span: "minute" };
    case "5Min":
      return { mult: 5, span: "minute" };
    case "15Min":
      return { mult: 15, span: "minute" };
    case "30Min":
      return { mult: 30, span: "minute" };
    case "1Hour":
      return { mult: 1, span: "hour" };
    case "2Hour":
      return { mult: 2, span: "hour" };
    case "4Hour":
      return { mult: 4, span: "hour" };
    case "1Day":
      return { mult: 1, span: "day" };
    case "1Week":
      return { mult: 1, span: "week" };
    case "1Min":
    default:
      return { mult: 1, span: "minute" };
  }
}

/**
 * @param {string} nextAbsUrl
 * @returns {string | null} pathname + search for same-origin /api/massive proxy
 */
function proxiedMassivePath(nextAbsUrl) {
  try {
    const u = new URL(nextAbsUrl);
    if (u.hostname !== "api.massive.com") return null;
    u.searchParams.delete("apiKey");
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

/**
 * @param {object} r - Massive aggregate result
 * @returns {object} bar shaped like Alpaca for alpacaBarToLightweight
 */
function massiveResultToBar(r) {
  const t = r.t;
  return {
    t: typeof t === "number" ? t : String(t),
    o: r.o,
    h: r.h,
    l: r.l,
    c: r.c,
    v: r.v ?? 0,
  };
}

/**
 * @param {object} params
 * @param {string} params.symbol
 * @param {string} params.timeframe - Alpaca style: 1Min | 5Min | …
 * @param {string} params.start - ISO or yyyy-MM-dd
 * @param {string} params.end - ISO or yyyy-MM-dd
 * @param {boolean} params.daily
 * @param {number} [params.maxTotalBars]
 * @param {number} [params.maxPages]
 */
export async function fetchMassiveStockBars({
  symbol,
  timeframe,
  start,
  end,
  daily,
  maxTotalBars = 50_000,
  maxPages = 10,
}) {
  assertLiveChartProxyOrThrow();

  const sym = String(symbol || "").toUpperCase();
  const { mult, span } = massiveMultSpan(timeframe);

  let pathFrom;
  let pathTo;
  if (daily) {
    pathFrom = String(start).slice(0, 10);
    pathTo = String(end).slice(0, 10);
  } else {
    const a = Date.parse(start);
    const b = Date.parse(end);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      const err = new Error("Massive: invalid start/end for intraday range");
      err.status = 400;
      throw err;
    }
    pathFrom = String(a);
    pathTo = String(b);
  }

  let url = chartProxyUrl(
    "massive",
    `/v2/aggs/ticker/${encodeURIComponent(sym)}/range/${mult}/${span}/${pathFrom}/${pathTo}?adjusted=true&sort=asc&limit=50000`,
  );

  const out = [];
  let truncated = false;

  for (let page = 0; page < maxPages; page++) {
    const res = await fetch(url);
    const text = await res.text();
    const data = parseMassiveJson(res, text);

    if (!res.ok) {
      const msg = data.message || data.error || data.errorMessage || text || res.statusText;
      const err = new Error(typeof msg === "string" ? msg : `Massive error ${res.status}`);
      err.status = res.status;
      throw err;
    }

    if (data.status && String(data.status).toUpperCase() !== "OK") {
      const err = new Error(typeof data.message === "string" ? data.message : `Massive status ${data.status}`);
      err.status = res.status;
      throw err;
    }

    const results = Array.isArray(data.results) ? data.results : [];
    for (const r of results) {
      out.push(massiveResultToBar(r));
      if (out.length >= maxTotalBars) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;

    const next = data.next_url;
    if (!next || typeof next !== "string") break;
    const rel = proxiedMassivePath(next);
    if (!rel) break;
    url = chartProxyUrl("massive", `${rel.startsWith("/") ? "" : "/"}${rel}`);
  }

  return { bars: out, truncated };
}
