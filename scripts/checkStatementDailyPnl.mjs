import { readFileSync } from "node:fs";
import { parseThinkorswimAccountCsv } from "../src/import/thinkorswimCsv.js";
import { groupTradesByDate } from "../src/storage/storage.js";

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node scripts/checkStatementDailyPnl.mjs <path-to-AccountStatement.csv>");
  process.exit(1);
}

/** From your April 2026 calendar screenshot */
const expected = {
  "2026-04-01": { pnl: -462.28, trades: 10 },
  "2026-04-02": { pnl: -67.84, trades: 6 },
  "2026-04-06": { pnl: 402.76, trades: 7 },
  "2026-04-07": { pnl: -1602.02, trades: 8 },
  "2026-04-08": { pnl: -47.59, trades: 6 },
  "2026-04-09": { pnl: 29.7, trades: 8 },
  "2026-04-10": { pnl: -193.29, trades: 6 },
  "2026-04-13": { pnl: 256.7, trades: 5 },
  "2026-04-14": { pnl: -1071.28, trades: 10 },
  "2026-04-15": { pnl: -300.41, trades: 6 },
  "2026-04-16": { pnl: -164.05, trades: 4 },
};

const text = readFileSync(csvPath, "utf8");

for (const mode of ["merge", "normal", "split"]) {
  const { trades, errors } = parseThinkorswimAccountCsv(text, { groupingMode: mode });
  const g = groupTradesByDate(trades);
  console.log(`\n=== groupingMode: ${mode} | parsed trades: ${trades.length} | parse errors: ${errors.length}`);
  for (const d of Object.keys(expected)) {
    const day = g[d];
    const exp = expected[d];
    if (!day) {
      console.log(d, "no trades this day in this CSV");
      continue;
    }
    const okP = Math.abs(day.pnl - exp.pnl) < 0.02;
    const okT = day.trades === exp.trades;
    console.log(
      d,
      okP && okT ? "OK" : "DIFF",
      `pnl ${day.pnl.toFixed(2)} vs calendar ${exp.pnl}`,
      `| trades ${day.trades} vs ${exp.trades}`,
    );
  }
}
