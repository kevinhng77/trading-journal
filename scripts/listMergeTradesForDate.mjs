import { readFileSync } from "node:fs";
import { parseThinkorswimAccountCsv } from "../src/import/thinkorswimCsv.js";

const csvPath = process.argv[2];
const date = process.argv[3];
const mode = process.argv[4] || "merge";
if (!csvPath || !date) {
  console.error("Usage: vite-node scripts/listMergeTradesForDate.mjs <csv> <YYYY-MM-DD> [merge|normal|split]");
  process.exit(1);
}
const text = readFileSync(csvPath, "utf8");
const { trades } = parseThinkorswimAccountCsv(text, { groupingMode: mode });
const rows = trades.filter((t) => t.date === date).sort((a, b) => a.symbol.localeCompare(b.symbol));
console.log(mode, "trades on", date, ":", rows.length);
for (const t of rows) console.log(t.symbol, "pnl", t.pnl, "vol", t.volume, "exec", t.executions);
