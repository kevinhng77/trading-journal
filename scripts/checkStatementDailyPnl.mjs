/**
 * Print calendar-style day P&amp;L (merge grouping, Cash Balance TRD only) from a statement CSV.
 *
 * Usage: node scripts/checkStatementDailyPnl.mjs <path-to-AccountStatement.csv>
 */
import { readFileSync } from "node:fs";
import { parseThinkorswimAccountCsv } from "../src/import/thinkorswimCsv.js";
import { groupTradesByDate } from "../src/storage/storage.js";

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node scripts/checkStatementDailyPnl.mjs <path-to-AccountStatement.csv>");
  process.exit(1);
}

const text = readFileSync(csvPath, "utf8");
const { trades, errors } = parseThinkorswimAccountCsv(text, {
  groupingMode: "merge",
  fillsSource: "cashTrdOnly",
});
const g = groupTradesByDate(trades);

console.log(`Parsed merge trades: ${trades.length} | parse messages: ${errors.length}`);
if (errors.length) console.log(errors.join("\n"));

const dates = Object.keys(g).sort();
console.log("\nDay PnL (sum of signed cash per merged trade = Cash TRD basis)\n");
for (const d of dates) {
  const day = g[d];
  if (!day.trades && Math.abs(day.pnl) < 1e-9) continue;
  console.log(`${d}\t${day.pnl.toFixed(2)}\ttrades=${day.trades}`);
}
