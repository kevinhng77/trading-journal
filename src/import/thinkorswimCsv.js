/**
 * Schwab / Thinkorswim **Account Statement** CSV import.
 *
 * **Trade P&amp;L** (stored on each merged/split trade) is the sum of **`AMOUNT`** on those rows so it
 * matches Schwab / TOS **Profits and Losses** and symbol P/L grids. **Misc + commissions** stay on each
 * fill; **`netCash`** (AMOUNT + misc + comm) remains for true cash impact and the trade detail “net incl.
 * row fees” line.
 *
 * **Normal grouping** walks each symbol’s fills in chronological order (all session dates in the file) and
 * merges a round trip into **one** journal trade dated on the **flat** day (closing session), including multi-day
 * swings. **Merge** mode still aggregates by symbol **per session day** only.
 *
 * **Detection order**
 * 1. Lines after a **Cash Balance**–style header until **Futures / Forex Statements** (normal export).
 * 2. If that yields **no** TRD rows, a **full-file scan** (same column shape) so spreadsheet saves still work.
 *
 * **`fillsSource: "cashTrdPlusAth"`** (optional): add **Account Trade History** fills not deduped to a TRD line.
 * Default is **cash TRD only** — no silent ATH fallback when there are zero TRD rows.
 */

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { normalizeWallTime } from "../api/alpacaBars";
import { sumSchwabLineConsiderationFromFills } from "../lib/schwabConsiderationPnl.js";

const NY_TZ = "America/New_York";

/**
 * @param {string} dateRaw - M/D/YY from CSV
 * @param {string} timeRaw - TIME cell
 * @returns {string | null} YYYY-MM-DD in US Eastern
 */
export function tradeSessionDateIsoFromTos(dateRaw, timeRaw) {
  const iso = parseTosDateToIso(dateRaw);
  if (!iso) return null;
  try {
    const wall = `${iso}T${normalizeWallTime(timeRaw)}`;
    const d = fromZonedTime(wall, NY_TZ);
    if (Number.isNaN(d.getTime())) return iso;
    return formatInTimeZone(d, NY_TZ, "yyyy-MM-dd");
  } catch {
    return iso;
  }
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (!inQ && c === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function stripCell(s) {
  let t = (s ?? "").trim();
  if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1);
  return t.replace(/^="?/, "").replace(/"$/, "");
}

/** ($1,234.56) or -$1.2 or "1,234.56" or empty */
export function parseMoneyCell(raw) {
  const s = stripCell(String(raw ?? "")).replace(/,/g, "").trim();
  if (!s) return 0;
  const negParen = /^\((.+)\)$/.exec(s);
  const body = negParen ? negParen[1] : s.replace(/^\$/, "");
  const n = Number.parseFloat(body.replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(n)) return 0;
  return negParen ? -Math.abs(n) : n;
}

/** M/D/YY or MM/DD/YY → YYYY-MM-DD (US interpretation) */
export function parseTosDateToIso(dateStr) {
  const s = stripCell(dateStr);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (!m) return null;
  let month = Number(m[1]);
  const day = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** BOT +100 ELAB @4.9799 | "SOLD -1,000 AIXI @.353" | CUSIP tickers like 73017P409 */
export function parseTradeDescription(descRaw) {
  let s = stripCell(descRaw);
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  s = s.replace(/([+-]?\d),(\d)/g, "$1$2");
  const re = /^(BOT|SOLD)\s+([+-]?\d+(?:\.\d+)?)\s+(\S+)\s+@([\d.]+)/i;
  const m = re.exec(s);
  if (!m) return null;
  const side = m[1].toUpperCase();
  const qty = Math.abs(Number(m[2]));
  const symbol = m[3].toUpperCase();
  const price = Number(m[4]);
  if (!qty || !symbol || Number.isNaN(price)) return null;
  return { side, qty, symbol, price };
}

function isCashBalanceHeader(line) {
  const t = line.trim();
  const u = t.toUpperCase();
  /** Schwab export is uppercased; Excel re-exports often change case and still skip the title row. */
  return (
    u.startsWith("DATE,TIME,TYPE") &&
    u.includes("DESCRIPTION") &&
    u.includes("BALANCE") &&
    u.includes("REF")
  );
}

/** Equity cash section ends; later CSV may still contain Account Trade History — do not stop the whole file. */
function isCashSectionHardStop(line) {
  const t = line.trim().toUpperCase();
  return t.startsWith("FUTURES STATEMENTS") || t.startsWith("FOREX STATEMENTS");
}

/**
 * Subtotal row inside the equity Cash grid (not a trade). Do not toggle `inCash` off here:
 * Schwab often inserts TOTAL immediately before Futures; TRD rows only appear before that,
 * but turning off the cash section would skip any TRD lines that could appear between TOTAL
 * and the Futures Statements header on other exports.
 */
function isCashSectionTotalRow(fields) {
  const first = (fields[0] ?? "").trim();
  if (first) return false;
  return fields.some((c) => String(c).trim().toUpperCase() === "TOTAL");
}

/** Same execution in Cash TRD vs Account Trade History (Schwab duplicates recent days). */
function fillExecutionDedupKey(f) {
  const t = normalizeWallTime(f.time ?? "");
  return `${f.date}|${t}|${String(f.symbol).toUpperCase()}|${f.side}|${f.quantity}`;
}

/** @param {string} line */
function isAccountTradeHistoryTableHeader(line) {
  const t = line.trim();
  return t.includes("Exec Time") && t.includes("Symbol") && (t.includes("Net Price") || t.includes("Price"));
}

function isProfitsAndLossesTableHeader(line) {
  const t = line.trim();
  return t.startsWith("Symbol,") && t.includes("P/L Day") && t.includes("Description");
}

/**
 * Schwab statement "Profits and Losses" grid — P/L Day per symbol (matches TOS P/L Day).
 * @param {string[]} lines
 * @returns {Map<string, number>}
 */
export function parseProfitsAndLossesPnlDayBySymbol(lines) {
  const map = new Map();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "Profits and Losses") continue;
    const headerLine = lines[i + 1] ?? "";
    if (!isProfitsAndLossesTableHeader(headerLine)) continue;

    const headerFields = parseCsvLine(headerLine);
    const symbolIdx = headerFields.findIndex((h) => String(stripCell(h)).trim().toUpperCase() === "SYMBOL");
    let pnlDayIdx = -1;
    for (let k = 0; k < headerFields.length; k++) {
      const t = String(stripCell(headerFields[k] ?? "")).trim().toUpperCase();
      if (t === "P/L DAY" || (t.includes("P/L") && t.includes("DAY") && !t.includes("YTD"))) {
        pnlDayIdx = k;
        break;
      }
    }
    if (symbolIdx < 0) continue;
    if (pnlDayIdx < 0 && headerFields.length > 4) pnlDayIdx = 4;
    if (pnlDayIdx < 0) continue;

    for (let j = i + 2; j < lines.length; j++) {
      const raw = lines[j];
      if (!raw.trim()) continue;
      const fields = parseCsvLine(raw);
      const symCell = stripCell(fields[symbolIdx] ?? "").trim();
      if (!symCell) {
        const joined = fields.map((c) => stripCell(c)).join(" ").toUpperCase();
        if (joined.includes("OVERALL TOTALS") || joined.includes("SUBTOTAL")) break;
        continue;
      }
      const symUpper = symCell.toUpperCase();
      if (/^(SUBTOTALS?|OVERALL\b)/i.test(symUpper)) break;

      const pnlDayVal = parseMoneyCell(fields[pnlDayIdx] ?? "");
      map.set(symUpper, Math.round(pnlDayVal * 100) / 100);
    }
    break;
  }
  return map;
}

/**
 * @param {string} cell - e.g. "4/16/26 12:44:36"
 * @returns {{ dateRaw: string, time: string } | null}
 */
function parseSchwabExecDateTime(cell) {
  const s = stripCell(String(cell ?? "")).trim();
  const m = /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2}:\d{2})(?:\.\d+)?$/.exec(s);
  if (!m) return null;
  return { dateRaw: m[1], time: m[2] };
}

/**
 * Schwab "Account Trade History" grid (leading comma rows) — carries fills for the full statement
 * range when the Cash Balance TRD block is only a short tail.
 * @param {string[]} lines
 */
function parseAccountTradeHistoryFills(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() !== "Account Trade History") {
      i += 1;
      continue;
    }
    const headerLine = lines[i + 1];
    if (!headerLine || !isAccountTradeHistoryTableHeader(headerLine)) {
      i += 1;
      continue;
    }
    i += 2;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        i += 1;
        continue;
      }
      const fields = parseCsvLine(line);
      if ((fields[0] ?? "").trim() !== "") {
        break;
      }
      const rawExec = stripCell(fields[1] ?? "");
      const parsedDt = parseSchwabExecDateTime(rawExec);
      if (!parsedDt) {
        break;
      }

      const spread = stripCell(fields[2] ?? "").toUpperCase();
      if (spread !== "STOCK" && spread !== "ETF") {
        i += 1;
        continue;
      }

      const sideRaw = stripCell(fields[3] ?? "").toUpperCase();
      if (sideRaw !== "BUY" && sideRaw !== "SELL") {
        i += 1;
        continue;
      }

      const qty = Math.abs(Number(String(fields[4] ?? "").replace(/^\+/, "")));
      const symbol = stripCell(fields[6] ?? "").toUpperCase();
      if (!symbol || !Number.isFinite(qty) || qty === 0) {
        i += 1;
        continue;
      }

      const netPriceRaw = stripCell(fields[11] ?? fields[10] ?? "");
      const price = Number.parseFloat(netPriceRaw.replace(/,/g, ""));
      if (!Number.isFinite(price) || price <= 0) {
        i += 1;
        continue;
      }

      const side = sideRaw === "BUY" ? "BOT" : "SOLD";
      const time = normalizeWallTime(parsedDt.time);
      const sessionDate = tradeSessionDateIsoFromTos(parsedDt.dateRaw, time);
      if (!sessionDate) {
        i += 1;
        continue;
      }

      const amount = side === "BOT" ? -qty * price : qty * price;
      const netCash = amount;
      const fillId = `ath-${sessionDate}-${time}-${symbol}-${qty}-${side}-${i + 1}`;

      out.push({
        id: fillId,
        date: sessionDate,
        time,
        ref: "",
        symbol,
        side,
        quantity: qty,
        price,
        amount,
        misc: 0,
        comm: 0,
        netCash,
        description: `${sideRaw} ${fields[4] ?? ""} ${symbol} @${price}`,
      });
      i += 1;
    }
  }
  return out;
}

/**
 * @param {object[]} group
 * @param {string} date
 * @param {string} symbol
 * @param {string} tradeId
 * @param {{ preferCashTrdNetForPnl?: boolean }} [opts]
 */
function buildTradeFromFills(group, date, symbol, tradeId, opts = {}) {
  const sorted = [...group].sort(compareFillsChrono);
  let volume = 0;
  let pnl = 0;
  /** Cash TRD rows carry `ref`; ATH synthetic fills use `ref: ""`. Prefer TRD rows for P/L when both appear. */
  const preferTrd = opts.preferCashTrdNetForPnl === true;
  const hasTrd = preferTrd && sorted.some((g) => String(g.ref ?? "").trim() !== "");
  const legs = sorted.filter((g) => !(hasTrd && String(g.ref ?? "").trim() === ""));
  for (const g of sorted) {
    volume += g.quantity;
  }
  pnl = sumSchwabLineConsiderationFromFills(legs);
  const executions = sorted.length;
  const time = sorted[0]?.time ?? "";
  return {
    id: tradeId,
    date,
    time,
    symbol,
    volume,
    executions,
    pnl,
    source: "thinkorswim",
    fills: sorted.map((x) => ({
      id: x.id,
      time: x.time,
      side: x.side,
      quantity: x.quantity,
      price: x.price,
      amount: x.amount,
      commission: x.comm,
      miscFees: x.misc,
      netCash: x.netCash,
      description: x.description,
    })),
  };
}

function sortTradesDesc(a, b) {
  const c = b.date.localeCompare(a.date);
  return c !== 0 ? c : a.symbol.localeCompare(b.symbol);
}

/** Chronological order for fills that may span multiple session dates. */
function compareFillsChrono(a, b) {
  const da = String(a.date ?? "");
  const db = String(b.date ?? "");
  const c = da.localeCompare(db);
  if (c !== 0) return c;
  return String(a.time ?? "").localeCompare(String(b.time ?? ""));
}

/** Deterministic trade id from fill ids so re-import updates the same row. */
function stableRoundTripTradeId(symbol, fillsChrono) {
  const keys = fillsChrono.map((f) => String(f.id ?? "")).sort();
  let h = 2166136261 >>> 0;
  const s = keys.join("\x1e");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `tos-rt-${symbol}-${h.toString(16).padStart(8, "0")}`;
}

/**
 * @param {object[]} fills - parsed TRD fill rows (`date`, `symbol`, `time`, `side`, `quantity`, …)
 * @param {"merge" | "split" | "normal"} mode
 * @returns {object[]}
 */
export function groupFillsIntoTrades(fills, mode) {
  if (mode === "split") {
    const trades = fills.map((f) => buildTradeFromFills([f], f.date, f.symbol, f.id, {}));
    trades.sort(sortTradesDesc);
    return trades;
  }

  if (mode === "merge") {
    const byKey = new Map();
    for (const f of fills) {
      const key = `${f.date}|${f.symbol}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(f);
    }
    const trades = [];
    for (const [key, group] of byKey) {
      const [date, symbol] = key.split("|");
      trades.push(
        buildTradeFromFills(group, date, symbol, `agg-${date}-${symbol}`, { preferCashTrdNetForPnl: true }),
      );
    }
    trades.sort(sortTradesDesc);
    return trades;
  }

  /*
   * normal — round-trip by net position across all session dates per symbol.
   * BOT adds shares, SOLD subtracts; when flat, one trade is emitted dated on the **closing** fill’s session
   * (last chronological fill in that round trip). Still-open tails use the last activity date.
   */
  const bySymbol = new Map();
  for (const f of fills) {
    const symbol = String(f.symbol ?? "").toUpperCase();
    if (!symbol) continue;
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol).push(f);
  }
  const trades = [];
  for (const [symbol, group] of bySymbol) {
    group.sort(compareFillsChrono);
    let cur = [];
    let pos = 0;
    for (const f of group) {
      if (pos === 0) {
        cur = [f];
      } else {
        cur.push(f);
      }
      pos += f.side === "BOT" ? f.quantity : -f.quantity;
      if (pos === 0) {
        const closeDate = cur[cur.length - 1].date;
        const tradeId = stableRoundTripTradeId(symbol, cur);
        trades.push(
          buildTradeFromFills(cur, closeDate, symbol, tradeId, { preferCashTrdNetForPnl: true }),
        );
        cur = [];
      }
    }
    if (cur.length) {
      const lastDate = cur[cur.length - 1].date;
      const tradeId = stableRoundTripTradeId(symbol, cur);
      trades.push(
        buildTradeFromFills(cur, lastDate, symbol, tradeId, { preferCashTrdNetForPnl: true }),
      );
    }
  }
  trades.sort(sortTradesDesc);
  return trades;
}

/**
 * One CSV row: Schwab-style cash grid (`DATE, TIME, TYPE=TRD, … DESCRIPTION, AMOUNT`).
 * @param {string[]} fields
 * @param {number} li 0-based line index (for errors / stable ids)
 * @param {string[]} errors
 * @param {object[]} fills
 * @param {string} idPrefix
 * @returns {boolean}
 */
function tryAppendTrdFillFromRow(fields, li, errors, fills, idPrefix) {
  if (fields.length < 8) return false;

  const dateRaw = stripCell(String(fields[0] ?? ""))
    .trim()
    .replace(/^\uFEFF/, "");
  if (!/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateRaw)) return false;

  if (stripCell(fields[2]).toUpperCase() !== "TRD") return false;

  const time = stripCell(fields[1]);
  const ref = stripCell(fields[3]);
  const desc = fields[4] ?? "";
  const misc = parseMoneyCell(fields[5]);
  const comm = parseMoneyCell(fields[6]);
  const amount = parseMoneyCell(fields[7]);

  const parsed = parseTradeDescription(desc);
  if (!parsed) {
    errors.push(`Line ${li + 1}: TRD row, could not parse BOT/SOLD description`);
    return false;
  }

  const sessionDate = tradeSessionDateIsoFromTos(dateRaw, time);
  if (!sessionDate) {
    errors.push(`Line ${li + 1}: TRD row, bad session date`);
    return false;
  }

  const netCash = amount + misc + comm;
  const refKey = ref || `scan-${li + 1}`;
  const fillId = `${idPrefix}-${refKey}-${sessionDate}-${time}-${parsed.symbol}-${parsed.qty}-${parsed.side}`;

  fills.push({
    id: fillId,
    date: sessionDate,
    time,
    ref: ref || "",
    symbol: parsed.symbol,
    side: parsed.side,
    quantity: parsed.qty,
    price: parsed.price,
    amount,
    misc,
    comm,
    netCash,
    description: stripCell(desc),
  });
  return true;
}

/**
 * Collect TRD fills: bounded Cash grid first, then full-file scan if empty.
 * @param {string[]} lines
 * @param {string[]} errors
 */
function collectTrdFillsFromCsvLines(lines, errors) {
  const fills = [];
  let inCash = false;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!line.trim()) continue;

    if (isCashBalanceHeader(line)) {
      inCash = true;
      continue;
    }

    if (!inCash) continue;

    const fields = parseCsvLine(line);
    if (isCashSectionHardStop(line)) {
      inCash = false;
      continue;
    }
    if (isCashSectionTotalRow(fields)) continue;

    tryAppendTrdFillFromRow(fields, li, errors, fills, "tos");
  }

  if (fills.length === 0) {
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (!line.trim()) continue;
      tryAppendTrdFillFromRow(parseCsvLine(line), li, errors, fills, "tos-scan");
    }
    if (fills.length > 0) {
      errors.push(
        "TRD BOT/SOLD rows found via full-file scan (no standard Cash Balance window, or all TRD fell outside it).",
      );
    }
  }

  return fills;
}

/** Volume-weighted average BOT and SOLD prices from fills (merged / multi-leg trades). */
export function attachAvgBuySellPricesFromFills(trade) {
  const fills = trade?.fills;
  if (!Array.isArray(fills) || fills.length === 0) return;
  let botQty = 0;
  let botSum = 0;
  let soldQty = 0;
  let soldSum = 0;
  for (const f of fills) {
    const q = Math.abs(Number(f.quantity));
    const p = Number(f.price);
    if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0) continue;
    const side = String(f.side ?? "").toUpperCase();
    if (side === "BOT") {
      botQty += q;
      botSum += q * p;
    } else if (side === "SOLD") {
      soldQty += q;
      soldSum += q * p;
    }
  }
  if (botQty > 0) trade.avgBuyPrice = Math.round((botSum / botQty) * 1e6) / 1e6;
  if (soldQty > 0) trade.avgSellPrice = Math.round((soldSum / soldQty) * 1e6) / 1e6;
}

/**
 * @param {string} text - full CSV file text
 * @param {{
 *   groupingMode?: "merge" | "split" | "normal",
 *   fillsSource?: "cashTrdOnly" | "cashTrdPlusAth",
 * }} [options]
 * @returns {{ trades: object[], fillsSkipped: number, errors: string[] }}
 */
export function parseThinkorswimAccountCsv(text, options = {}) {
  const groupingMode = options.groupingMode ?? "merge";
  /** @type {"cashTrdOnly" | "cashTrdPlusAth"} */
  const fillsSource = options.fillsSource ?? "cashTrdOnly";
  const lines = text.split(/\r?\n/);
  const errors = [];
  const fills = collectTrdFillsFromCsvLines(lines, errors);
  const trdFillCount = fills.length;

  if (fillsSource === "cashTrdPlusAth") {
    const trdKeys = new Set(fills.map((f) => fillExecutionDedupKey(f)));
    const athFills = parseAccountTradeHistoryFills(lines);
    for (const f of athFills) {
      const k = fillExecutionDedupKey(f);
      if (trdKeys.has(k)) continue;
      fills.push(f);
      trdKeys.add(k);
    }
  } else if (fills.length === 0) {
    errors.push(
      'No TRD (BOT/SOLD) cash rows found. Use an Account Statement CSV with those lines, or import with fillsSource: "cashTrdPlusAth" to add Account Trade History.',
    );
  }

  const trades = groupFillsIntoTrades(fills, groupingMode);
  for (const t of trades) {
    attachAvgBuySellPricesFromFills(t);
    if (trdFillCount > 0) t.pnlSource = "cash-trd-bot-sold";
  }

  return { trades, fillsSkipped: 0, errors };
}
