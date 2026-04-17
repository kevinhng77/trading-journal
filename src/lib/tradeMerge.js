import { groupFillsIntoTrades } from "../import/thinkorswimCsv.js";
import { stableTradeId } from "../storage/tradeLookup";
import { getTradeTags, getTradeSetups, normalizeTagList } from "./tradeTags";
import { tradeNetPnl } from "./tradeExecutionMetrics";

/**
 * Parser-style fill row for {@link groupFillsIntoTrades} from a stored trade fill.
 * @param {object} f
 * @param {string} date
 * @param {string} symbol
 */
function fillToGroupingFill(f, date, symbol) {
  const qty = Math.abs(Number(f.quantity) || 0);
  const amount = Number.isFinite(Number(f.amount)) ? Number(f.amount) : 0;
  const misc = Number.isFinite(Number(f.misc ?? f.miscFees)) ? Number(f.misc ?? f.miscFees) : 0;
  const comm = Number.isFinite(Number(f.comm ?? f.commission)) ? Number(f.comm ?? f.commission) : 0;
  let netCash = Number(f.netCash);
  if (!Number.isFinite(netCash)) netCash = amount + misc + comm;
  return {
    id: String(f.id ?? ""),
    date,
    time: String(f.time ?? ""),
    ref: String(f.ref ?? ""),
    symbol,
    side: f.side === "SOLD" ? "SOLD" : "BOT",
    quantity: qty,
    price: Number(f.price) || 0,
    amount,
    misc,
    comm,
    netCash,
    description: String(f.description ?? ""),
  };
}

/**
 * Combine selected trades into one row (same calendar date and symbol).
 * @param {string[]} stableIds
 * @param {object[]} allTrades
 * @returns {{ ok: true, next: object[] } | { ok: false, message: string }}
 */
export function mergeTradesByStableIds(stableIds, allTrades) {
  if (stableIds.length < 2) return { ok: false, message: "Select at least two trades to merge." };
  const idSet = new Set(stableIds);
  const picked = stableIds.map((id) => allTrades.find((t) => stableTradeId(t) === id)).filter(Boolean);
  if (picked.length !== stableIds.length) {
    return { ok: false, message: "Some selected trades were not found." };
  }

  const date = String(picked[0].date ?? "");
  const sym = String(picked[0].symbol ?? "");
  for (const t of picked) {
    if (String(t.date ?? "") !== date) {
      return { ok: false, message: "Merged trades must all use the same date." };
    }
    if (String(t.symbol ?? "").toUpperCase() !== sym.toUpperCase()) {
      return { ok: false, message: "Merged trades must all use the same symbol." };
    }
  }

  const mergedFills = picked
    .flatMap((t) => (Array.isArray(t.fills) ? t.fills : []))
    .sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? "")));

  if (mergedFills.length === 0) {
    return { ok: false, message: "Selected trades have no fills to combine." };
  }

  let volume = 0;
  let pnlSum = 0;
  for (const t of picked) {
    volume += Number(t.volume) || 0;
    pnlSum += tradeNetPnl(t);
  }

  const tags = normalizeTagList(picked.flatMap((t) => getTradeTags(t)));
  const setups = normalizeTagList(picked.flatMap((t) => getTradeSetups(t)));
  const primary = picked[0];
  const merged = {
    ...primary,
    id: primary.id ?? stableTradeId(primary),
    volume,
    executions: mergedFills.length,
    pnl: Math.round(pnlSum * 100) / 100,
    fills: mergedFills,
    ...(tags.length > 0 ? { tags } : {}),
    ...(setups.length > 0 ? { setups } : {}),
  };

  let first = -1;
  for (let i = 0; i < allTrades.length; i++) {
    if (idSet.has(stableTradeId(allTrades[i]))) {
      first = i;
      break;
    }
  }
  const without = allTrades.filter((t) => !idSet.has(stableTradeId(t)));
  const removedBeforeFirst = allTrades.slice(0, first).filter((t) => idSet.has(stableTradeId(t))).length;
  const pos = Math.max(0, first - removedBeforeFirst);
  const next = [...without.slice(0, pos), merged, ...without.slice(pos)];
  return { ok: true, next };
}

/**
 * Split one trade into one row per completed round trip (flat → 0 shares), not one row per fill.
 * Uses the same rules as Thinkorswim import "normal" grouping.
 * @param {string} stableId
 * @param {object[]} allTrades
 * @returns {{ ok: true, next: object[] } | { ok: false, message: string }}
 */
export function splitTradeIntoRoundTripsByStableId(stableId, allTrades) {
  const idx = allTrades.findIndex((t) => stableTradeId(t) === stableId);
  if (idx < 0) return { ok: false, message: "Trade not found." };
  const trade = allTrades[idx];
  const fills = Array.isArray(trade.fills) ? trade.fills : [];
  if (fills.length < 2) {
    return {
      ok: false,
      message: "This trade only has one execution. Split needs at least two fills to form round trips.",
    };
  }

  const date = String(trade.date ?? "");
  const symbol = String(trade.symbol ?? "");
  const groupingFills = fills.map((f) => fillToGroupingFill(f, date, symbol));
  const split = groupFillsIntoTrades(groupingFills, "normal");

  if (split.length <= 1) {
    return {
      ok: false,
      message:
        "This trade is already a single completed round trip or one open position. There is nothing to split into separate exits.",
    };
  }

  const base = stableTradeId(trade);
  const tagList = normalizeTagList(getTradeTags(trade));
  const setupList = normalizeTagList(getTradeSetups(trade));
  const notes = typeof trade.notes === "string" && trade.notes.trim() ? trade.notes : undefined;
  const idSuffix =
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : String(Date.now());

  const stamped = split.map((t, i) => {
    const id = `${base}~rt~${i}~${idSuffix}`;
    return {
      ...t,
      id,
      source: trade.source ?? t.source,
      ...(tagList.length > 0 ? { tags: [...tagList] } : {}),
      ...(setupList.length > 0 ? { setups: [...setupList] } : {}),
      ...(notes && i === 0 ? { notes } : {}),
    };
  });

  const next = [...allTrades.slice(0, idx), ...stamped, ...allTrades.slice(idx + 1)];
  return { ok: true, next };
}
