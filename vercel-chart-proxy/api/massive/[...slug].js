/**
 * Proxies GET /api/massive/* → https://api.massive.com/* and appends apiKey
 * Set env: MASSIVE_API_KEY
 * Optional: ALLOWED_ORIGIN (default *) for CORS
 */

function applyCors(req, res) {
  const allow = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  const apiKey = process.env.MASSIVE_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Missing MASSIVE_API_KEY on Vercel" }));
    return;
  }

  const slug = req.query.slug;
  const rest = Array.isArray(slug) ? slug.join("/") : String(slug || "");
  const u = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  const target = new URL(`https://api.massive.com/${rest}`);
  u.searchParams.forEach((value, key) => {
    if (key === "slug") return;
    target.searchParams.set(key, value);
  });
  target.searchParams.set("apiKey", apiKey);

  const upstream = await fetch(target.toString());
  const text = await upstream.text();
  const ct = upstream.headers.get("content-type");
  if (ct) res.setHeader("content-type", ct);
  res.statusCode = upstream.status;
  res.end(text);
};
