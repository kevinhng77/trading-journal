/**
 * Proxies GET /api/alpaca/* → https://data.alpaca.markets/*
 * Set env: ALPACA_API_KEY_ID, ALPACA_API_SECRET_KEY
 * Optional: ALLOWED_ORIGIN (default *) for CORS from GitHub Pages
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

  const keyId = process.env.ALPACA_API_KEY_ID;
  const secret = process.env.ALPACA_API_SECRET_KEY;
  if (!keyId || !secret) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Missing ALPACA_API_KEY_ID or ALPACA_API_SECRET_KEY on Vercel" }));
    return;
  }

  const slug = req.query.slug;
  const rest = Array.isArray(slug) ? slug.join("/") : String(slug || "");
  const u = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  const target = new URL(`https://data.alpaca.markets/${rest}`);
  u.searchParams.forEach((value, key) => {
    if (key === "slug") return;
    target.searchParams.set(key, value);
  });

  const upstream = await fetch(target.toString(), {
    headers: {
      "APCA-API-KEY-ID": keyId,
      "APCA-API-SECRET-KEY": secret,
    },
  });

  const text = await upstream.text();
  const ct = upstream.headers.get("content-type");
  if (ct) res.setHeader("content-type", ct);
  res.statusCode = upstream.status;
  res.end(text);
};
