import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/** Trim and strip optional surrounding ' or " from .env values */
function envAlpacaValue(raw) {
  let s = String(raw ?? "").trim();
  if (
    s.length >= 2 &&
    ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"')))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/** KEY=value lines; # comments; values may be quoted */
function loadDotenvFile(filename) {
  const p = resolve(process.cwd(), filename);
  if (!existsSync(p)) return {};
  const out = {};
  const text = readFileSync(p, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...loadDotenvFile("keys.env") };
  const alpacaKey = envAlpacaValue(env.ALPACA_API_KEY_ID);
  const alpacaSecret = envAlpacaValue(env.ALPACA_API_SECRET_KEY);
  const massiveApiKey = envAlpacaValue(env.MASSIVE_API_KEY);

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api/alpaca": {
          target: "https://data.alpaca.markets",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/alpaca/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              if (alpacaKey) proxyReq.setHeader("APCA-API-KEY-ID", alpacaKey);
              if (alpacaSecret) proxyReq.setHeader("APCA-API-SECRET-KEY", alpacaSecret);
            });
          },
        },
        "/api/massive": {
          target: "https://api.massive.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/massive/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              if (!massiveApiKey) return;
              const pathWithQuery = proxyReq.path || "";
              const sep = pathWithQuery.includes("?") ? "&" : "?";
              proxyReq.path = `${pathWithQuery}${sep}apiKey=${encodeURIComponent(massiveApiKey)}`;
            });
          },
        },
      },
    },
  };
});
