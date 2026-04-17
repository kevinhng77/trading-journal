/**
 * Production chart calls go to `VITE_CHART_API_ORIGIN` (e.g. a Vercel proxy) so secrets stay off GitHub Pages.
 * Local dev uses same-origin `/api/*` from Vite (vite.config.js).
 * @returns {string} origin only, no trailing slash, or "" when using dev proxy
 */
export function chartApiBaseUrl() {
  if (import.meta.env.DEV) return "";
  return String(import.meta.env.VITE_CHART_API_ORIGIN || "")
    .trim()
    .replace(/\/$/, "");
}

/**
 * @returns {boolean}
 */
export function isLiveChartDataAvailable() {
  if (import.meta.env.DEV) return true;
  return Boolean(chartApiBaseUrl());
}

/** @throws {Error & { code?: string }} */
export function assertLiveChartProxyOrThrow() {
  if (isLiveChartDataAvailable()) return;
  const err = new Error(
    "Charts need npm run dev with Alpaca keys in .env, or set VITE_CHART_API_ORIGIN to your Vercel chart proxy URL and rebuild (see vercel-chart-proxy folder).",
  );
  err.code = "CHART_PROXY_UNAVAILABLE";
  throw err;
}

/**
 * @param {"alpaca"|"massive"} service
 * @param {string} pathAndQuery - path starting with `/v2/...` plus optional `?query`
 */
export function chartProxyUrl(service, pathAndQuery) {
  const p = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  const base = chartApiBaseUrl();
  const rel = `/api/${service}${p}`;
  if (base) return `${base}${rel}`;
  return rel;
}
