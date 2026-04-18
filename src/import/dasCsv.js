/**
 * DAS Trader Pro execution CSV (e.g. **Trades.csv** auto-export: Setup → Other Configuration).
 * Header row required; column names are matched flexibly (Symb / Symbol, Qty / Quantity, etc.).
 */

import { normalizeWallTime } from "../api/alpacaBars";
import {
  groupFillsIntoTrades,
  parseTosDateToIso,
  tradeSessionDateIsoFromTos,
} from "./thinkorswimCsv";

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
  let t = String(s ?? "").trim();
  if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1);
  return t.replace(/^\uFEFF/, "").replace(/^="?/, "").replace(/"$/, "");
}

/** @param {string} h */
function normKey(h) {
  return stripCell(h).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * @param {string[]} headerCells
 * @param {Record<string, string[]>} aliases key → acceptable header substrings (normalized contains)
 */
function buildHeaderIndex(headerCells, aliases) {
  const keys = headerCells.map((c) => normKey(c));
  /** @type {Record<string, number>} */
  const out = {};
  for (const [logical, candidates] of Object.entries(aliases)) {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!k) continue;
      if (candidates.some((want) => k === want || k.includes(want))) {
        out[logical] = i;
        break;
      }
    }
  }
  return out;
}

/** @returns {{ dateRaw: string, timeRaw: string } | null} */
function splitDateTimeOneCell(cell) {
  const s = stripCell(cell);
  const iso = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2}(?::\d{2})?)/.exec(s);
  if (iso) return { dateRaw: iso[1], timeRaw: iso[2] };
  const us = /^(\d{1,2}\/\d{1,2}\/\d{2,4})[ T](\d{1,2}:\d{2}(?::\d{2})?)/.exec(s);
  if (us) return { dateRaw: us[1], timeRaw: us[2] };
  return null;
}

function sessionDateIso(dateRaw, timeRaw) {
  const t = normalizeWallTime(timeRaw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return dateRaw;
  const iso = parseTosDateToIso(dateRaw);
  if (!iso) return null;
  const shifted = tradeSessionDateIsoFromTos(dateRaw, t);
  return shifted ?? iso;
}

/** @param {string} sideRaw @returns {"BOT"|"SOLD"|null} */
function mapDasSide(sideRaw) {
  const u = stripCell(sideRaw).toUpperCase().replace(/\s+/g, "");
  if (["BUY", "BOT", "B", "COVER", "COVR"].includes(u)) return "BOT";
  if (["SELL", "SOLD", "SLD", "S", "SHORT"].includes(u)) return "SOLD";
  if (u.startsWith("B")) return "BOT";
  if (u.startsWith("S")) return "SOLD";
  return null;
}

const HEADER_ALIASES = {
  symbol: ["symb", "symbol", "sym", "ticker", "issue"],
  side: ["side", "bs", "buysell"],
  price: ["price", "px", "fillprice", "avgprice", "prc"],
  qty: ["qty", "quantity", "size", "shares", "filled"],
  time: ["time", "exectime", "executiontime", "timestamp", "datetime"],
  date: ["date", "tradedate", "orderdate"],
};

/**
 * @param {string[]} fields
 * @param {Record<string, number>} idx
 */
function rowDateTimeParts(fields, idx) {
  if (idx.date >= 0 && idx.time >= 0) {
    return {
      dateRaw: stripCell(fields[idx.date] ?? ""),
      timeRaw: stripCell(fields[idx.time] ?? ""),
    };
  }
  if (idx.time >= 0) return splitDateTimeOneCell(fields[idx.time] ?? "");
  return null;
}

/**
 * @param {string} text
 * @param {{ groupingMode?: "merge" | "split" | "normal" }} [options]
 * @returns {{ trades: object[], errors: string[] }}
 */
export function parseDasTradesCsv(text, options = {}) {
  const groupingMode = options.groupingMode ?? "normal";
  const errors = [];
  const lines = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((ln) => ln.trim().length > 0);

  if (lines.length < 2) {
    return { trades: [], errors: ["CSV is empty or has no data rows."] };
  }

  const header = parseCsvLine(lines[0]);
  const idx = buildHeaderIndex(header, HEADER_ALIASES);

  if (idx.symbol == null || idx.side == null || idx.price == null || idx.qty == null) {
    errors.push(
      "DAS CSV: need header columns for symbol (Symb/Symbol), side, price, and quantity (Qty). Optional date + time or a single DateTime column.",
    );
    return { trades: [], errors };
  }

  if (idx.time == null) {
    errors.push("DAS CSV: need a Time (or DateTime) column, or separate Date + Time columns.");
    return { trades: [], errors };
  }

  let probe = null;
  for (let li = 1; li < lines.length; li++) {
    const fields = parseCsvLine(lines[li]);
    if (fields.every((c) => !stripCell(c))) continue;
    probe = fields;
    break;
  }
  if (!probe) {
    return { trades: [], errors: ["DAS CSV: no data rows."] };
  }
  const probeDt = rowDateTimeParts(probe, idx);
  if (!probeDt?.dateRaw || !stripCell(probeDt.timeRaw ?? "")) {
    errors.push(
      "DAS CSV: could not read date/time from the first row — use Date + Time columns or one DateTime column (e.g. 2026-01-15 09:30:01).",
    );
    return { trades: [], errors };
  }

  /** @type {object[]} */
  const fills = [];

  for (let li = 1; li < lines.length; li++) {
    const fields = parseCsvLine(lines[li]);
    if (fields.every((c) => !stripCell(c))) continue;

    const symbol = stripCell(fields[idx.symbol] ?? "").toUpperCase();
    const side = mapDasSide(fields[idx.side] ?? "");
    const qty = Math.abs(Number(String(stripCell(fields[idx.qty] ?? "")).replace(/,/g, "")));
    const price = Number.parseFloat(String(stripCell(fields[idx.price] ?? "")).replace(/,/g, ""));
    if (!symbol || !side || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) {
      errors.push(`Line ${li + 1}: skipped (missing symbol, side, qty, or price).`);
      continue;
    }

    const parts = rowDateTimeParts(fields, idx);
    if (!parts?.dateRaw || !stripCell(parts.timeRaw ?? "")) {
      errors.push(`Line ${li + 1}: could not parse date/time.`);
      continue;
    }
    const { dateRaw, timeRaw } = parts;

    const time = normalizeWallTime(timeRaw);
    const sessionDate = sessionDateIso(dateRaw, time);
    if (!sessionDate) {
      errors.push(`Line ${li + 1}: bad date "${dateRaw}".`);
      continue;
    }

    const amount = side === "BOT" ? -qty * price : qty * price;
    const fillId = `das-${sessionDate}-${time}-${symbol}-${qty}-${side}-${li}`;

    fills.push({
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
      netCash: amount,
      description: `${side} ${qty} ${symbol} @${price}`,
    });
  }

  if (fills.length === 0) {
    return { trades: [], errors: errors.length ? errors : ["No valid DAS execution rows found."] };
  }

  const trades = groupFillsIntoTrades(fills, groupingMode).map((t) => ({ ...t, source: "das" }));
  return { trades, errors };
}
