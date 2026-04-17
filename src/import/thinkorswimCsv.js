/**
 * Parse Thinkorswim / Schwab account statement CSV.
 * - Cash Balance: TYPE=TRD rows (cash amounts, commissions).
 * - Account Trade History: full-period stock/ETF fills with Net Price (Schwab omits many months
 *   from the short Cash TRD block; this section carries Jan–Mar, etc.).
 * Rows are deduped when the same execution appears in both sections.
 */

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { normalizeWallTime } from "../api/alpacaBars";

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
  return (
    t.startsWith("DATE,TIME,TYPE") &&
    t.includes("DESCRIPTION") &&
    t.includes("BALANCE") &&
    t.includes("REF")
  );
}

/** Equity cash section ends; later CSV may still contain Account Trade History — do not stop the whole file. */
function isCashSectionHardStop(line) {
  const t = line.trim();
  return t.startsWith("Futures Statements") || t.startsWith("Forex Statements");
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
 */
function buildTradeFromFills(group, date, symbol, tradeId) {
  const sorted = [...group].sort((a, b) => a.time.localeCompare(b.time));
  let volume = 0;
  let pnl = 0;
  for (const g of sorted) {
    volume += g.quantity;
    pnl += g.netCash;
  }
  pnl = Math.round(pnl * 100) / 100;
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

/**
 * @param {object[]} fills - parsed TRD fill rows (`date`, `symbol`, `time`, `side`, `quantity`, …)
 * @param {"merge" | "split" | "normal"} mode
 * @returns {object[]}
 */
export function groupFillsIntoTrades(fills, mode) {
  if (mode === "split") {
    const trades = fills.map((f) => buildTradeFromFills([f], f.date, f.symbol, f.id));
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
      trades.push(buildTradeFromFills(group, date, symbol, `agg-${date}-${symbol}`));
    }
    trades.sort(sortTradesDesc);
    return trades;
  }

  /* normal — round-trip by net position (BOT adds qty, SOLD subtracts) */
  const byKey = new Map();
  for (const f of fills) {
    const key = `${f.date}|${f.symbol}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(f);
  }
  const trades = [];
  let seq = 0;
  for (const [key, group] of byKey) {
    const [date, symbol] = key.split("|");
    group.sort((a, b) => a.time.localeCompare(b.time));
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
        seq += 1;
        trades.push(buildTradeFromFills(cur, date, symbol, `tos-${date}-${symbol}-r${seq}`));
        cur = [];
      }
    }
    if (cur.length) {
      seq += 1;
      trades.push(buildTradeFromFills(cur, date, symbol, `tos-${date}-${symbol}-r${seq}`));
    }
  }
  trades.sort(sortTradesDesc);
  return trades;
}

/**
 * @param {string} text - full CSV file text
 * @param {{ groupingMode?: "merge" | "split" | "normal" }} [options]
 * @returns {{ trades: object[], fillsSkipped: number, errors: string[] }}
 */
export function parseThinkorswimAccountCsv(text, options = {}) {
  const groupingMode = options.groupingMode ?? "merge";
  const lines = text.split(/\r?\n/);
  let inCash = false;
  const fills = [];
  const errors = [];

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
    if (isCashSectionTotalRow(fields)) {
      continue;
    }

    if (fields.length < 8) continue;

    const dateRaw = String(fields[0] ?? "")
      .trim()
      .replace(/^\uFEFF/, "");
    if (!/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateRaw)) {
      continue;
    }

    const type = stripCell(fields[2]);
    if (type !== "TRD") continue;

    const time = stripCell(fields[1]);
    const ref = stripCell(fields[3]);
    const desc = fields[4] ?? "";
    const misc = parseMoneyCell(fields[5]);
    const comm = parseMoneyCell(fields[6]);
    const amount = parseMoneyCell(fields[7]);

    const parsed = parseTradeDescription(desc);
    if (!parsed) {
      errors.push(`Line ${li + 1}: could not parse description`);
      continue;
    }

    const sessionDate = tradeSessionDateIsoFromTos(dateRaw, time);
    if (!sessionDate) {
      errors.push(`Line ${li + 1}: bad date`);
      continue;
    }

    const netCash = amount + misc + comm;
    const fillId = `tos-${ref}-${sessionDate}-${time}-${parsed.symbol}-${parsed.qty}-${parsed.side}`;

    fills.push({
      id: fillId,
      date: sessionDate,
      time,
      ref,
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
  }

  const trdKeys = new Set(fills.map((f) => fillExecutionDedupKey(f)));
  const athFills = parseAccountTradeHistoryFills(lines);
  for (const f of athFills) {
    const k = fillExecutionDedupKey(f);
    if (trdKeys.has(k)) continue;
    fills.push(f);
    trdKeys.add(k);
  }

  const trades = groupFillsIntoTrades(fills, groupingMode);

  /* Merge-mode P/L from summed fills can diverge from Schwab ATH vs cash; align to statement P/L Day. */
  if (groupingMode === "merge" && fills.length) {
    const pnlDayBySymbol = parseProfitsAndLossesPnlDayBySymbol(lines);
    if (pnlDayBySymbol.size) {
      let maxFillDate = fills[0].date;
      for (const f of fills) {
        if (f.date > maxFillDate) maxFillDate = f.date;
      }
      for (const t of trades) {
        if (t.date !== maxFillDate) continue;
        const sym = String(t.symbol).toUpperCase();
        if (!pnlDayBySymbol.has(sym)) continue;
        t.pnl = pnlDayBySymbol.get(sym);
        t.pnlSource = "statement-p-l-day";
      }
    }
  }

  return { trades, fillsSkipped: 0, errors };
}
