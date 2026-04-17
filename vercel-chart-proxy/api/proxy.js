/**
 * Single serverless entry for Alpaca + Massive (rewrites from /api/alpaca/* and /api/massive/*).
 * Env: ALPACA_API_KEY_ID, ALPACA_API_SECRET_KEY, MASSIVE_API_KEY, optional ALLOWED_ORIGIN
 */

function corsAllowOrigin() {
  const raw = String(process.env.ALLOWED_ORIGIN ?? "").trim();
  if (!raw || raw === "*") return "*";
  return raw.replace(/\/$/, "");
}

function applyCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", corsAllowOrigin());
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
  try {
    if (applyCors(req, res)) return;

    const u = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const service = String(u.searchParams.get("service") || "").toLowerCase();
    const pathPart = String(u.searchParams.get("p") || "").replace(/^\/+/, "");

    if (service !== "alpaca" && service !== "massive") {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Invalid or missing service (alpaca|massive)" }));
      return;
    }

    if (service === "alpaca") {
      const keyId = process.env.ALPACA_API_KEY_ID;
      const secret = process.env.ALPACA_API_SECRET_KEY;
      if (!keyId || !secret) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Missing ALPACA_API_KEY_ID or ALPACA_API_SECRET_KEY on Vercel" }));
        return;
      }
      const target = new URL(`https://data.alpaca.markets/${pathPart}`);
      u.searchParams.forEach((value, key) => {
        if (key === "service" || key === "p") return;
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
      return;
    }

    const apiKey = process.env.MASSIVE_API_KEY;
    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Missing MASSIVE_API_KEY on Vercel" }));
      return;
    }
    const target = new URL(`https://api.massive.com/${pathPart}`);
    u.searchParams.forEach((value, key) => {
      if (key === "service" || key === "p") return;
      target.searchParams.set(key, value);
    });
    target.searchParams.set("apiKey", apiKey);
    const upstream = await fetch(target.toString());
    const text = await upstream.text();
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("content-type", ct);
    res.statusCode = upstream.status;
    res.end(text);
  } catch (e) {
    if (!res.headersSent) {
      applyCors(req, res);
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: String(e?.message || e) }));
    }
  }
};
