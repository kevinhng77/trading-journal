// src/import/thinkorswimCsv.js
import { formatInTimeZone as formatInTimeZone2, fromZonedTime as fromZonedTime2 } from "date-fns-tz";

// src/api/alpacaBars.js
import { format, parseISO, subDays, subMonths, subYears } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
function normalizeWallTime(timeStr) {
  const t = String(timeStr ?? "").trim();
  const parts = t.split(":").map((p) => p.trim());
  if (parts.length < 2) return "12:00:00";
  const h = parts[0].padStart(2, "0");
  const m = parts[1].padStart(2, "0");
  let s = parts[2] ?? "00";
  s = String(s).replace(/\D/g, "").slice(0, 2).padStart(2, "0") || "00";
  return `${h}:${m}:${s}`;
}

// src/import/thinkorswimCsv.js
var NY_TZ = "America/New_York";
function tradeSessionDateIsoFromTos(dateRaw, timeRaw) {
  const iso = parseTosDateToIso(dateRaw);
  if (!iso) return null;
  try {
    const wall = `${iso}T${normalizeWallTime(timeRaw)}`;
    const d = fromZonedTime2(wall, NY_TZ);
    if (Number.isNaN(d.getTime())) return iso;
    return formatInTimeZone2(d, NY_TZ, "yyyy-MM-dd");
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
function parseMoneyCell(raw) {
  const s = stripCell(String(raw ?? "")).replace(/,/g, "").trim();
  if (!s) return 0;
  const negParen = /^\((.+)\)$/.exec(s);
  const body = negParen ? negParen[1] : s.replace(/^\$/, "");
  const n = Number.parseFloat(body.replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(n)) return 0;
  return negParen ? -Math.abs(n) : n;
}
function parseTosDateToIso(dateStr) {
  const s = stripCell(dateStr);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (!m) return null;
  let month = Number(m[1]);
  const day = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2e3;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function parseTradeDescription(descRaw) {
  let s = stripCell(descRaw);
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  s = s.replace(/([+-]?\d),(\d)/g, "$1$2");
  const re = /^(BOT|SOLD)\s+([+-]?\d+)\s+([A-Z][A-Z0-9.]*)\s+@([\d.]+)/i;
  const m = re.exec(s);
  if (!m) return null;
  const side = m[1].toUpperCase();
  const qty = Math.abs(Number(m[2], 10));
  const symbol = m[3].toUpperCase();
  const price = Number(m[4]);
  if (!qty || !symbol || Number.isNaN(price)) return null;
  return { side, qty, symbol, price };
}
function isCashBalanceHeader(line) {
  const t = line.trim();
  return t.startsWith("DATE,TIME,TYPE") && t.includes("DESCRIPTION") && t.includes("BALANCE") && t.includes("REF");
}
function shouldEndCashSection(line, fields) {
  const t = line.trim();
  if (t.startsWith("Futures Statements") || t.startsWith("Forex Statements")) return true;
  const first = (fields[0] ?? "").trim();
  if (!first && fields.some((c) => String(c).toUpperCase() === "TOTAL")) return true;
  return false;
}
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
      description: x.description
    }))
  };
}
function sortTradesDesc(a, b) {
  const c = b.date.localeCompare(a.date);
  return c !== 0 ? c : a.symbol.localeCompare(b.symbol);
}
function groupFillsIntoTrades(fills, mode) {
  if (mode === "split") {
    const trades2 = fills.map((f) => buildTradeFromFills([f], f.date, f.symbol, f.id));
    trades2.sort(sortTradesDesc);
    return trades2;
  }
  if (mode === "merge") {
    const byKey2 = /* @__PURE__ */ new Map();
    for (const f of fills) {
      const key = `${f.date}|${f.symbol}`;
      if (!byKey2.has(key)) byKey2.set(key, []);
      byKey2.get(key).push(f);
    }
    const trades2 = [];
    for (const [key, group] of byKey2) {
      const [date, symbol] = key.split("|");
      trades2.push(buildTradeFromFills(group, date, symbol, `agg-${date}-${symbol}`));
    }
    trades2.sort(sortTradesDesc);
    return trades2;
  }
  const byKey = /* @__PURE__ */ new Map();
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
function parseThinkorswimAccountCsv(text, options = {}) {
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
    if (shouldEndCashSection(line, fields)) break;
    if (fields.length < 8) continue;
    const dateRaw = String(fields[0] ?? "").trim().replace(/^\uFEFF/, "");
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
      description: stripCell(desc)
    });
  }
  const trades = groupFillsIntoTrades(fills, groupingMode);
  return { trades, fillsSkipped: 0, errors };
}
export {
  groupFillsIntoTrades,
  parseMoneyCell,
  parseThinkorswimAccountCsv,
  parseTosDateToIso,
  parseTradeDescription,
  tradeSessionDateIsoFromTos
};
