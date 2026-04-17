/** Smoke test: GET /api/health → 200 JSON + CORS */
module.exports = (req, res) => {
  const allow = String(process.env.ALLOWED_ORIGIN ?? "").trim().replace(/\/$/, "") || "*";
  res.setHeader("Access-Control-Allow-Origin", allow === "*" ? "*" : allow);
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ ok: true, service: "chart-proxy" }));
};
