import { stableTradeId } from "../storage/tradeLookup";
import { getTradeTags, normalizeTagList } from "./tradeTags";
import { tradeNetPnl } from "./tradeExecutionMetrics";

/**
 * @param {object} fill
 * @param {string} date
 * @param {string} symbol
 * @param {string} tradeId
 */
function tradeFromSingleFill(fill, date, symbol, tradeId, source) {
  const q = Math.abs(Number(fill.quantity) || 0);
  const net = Number(fill.netCash);
  const pnl = Number.isFinite(net) ? Math.round(net * 100) / 100 : 0;
  return {
    id: tradeId,
    date,
    time: fill.time ?? "",
    symbol,
    volume: q,
    executions: 1,
    pnl,
    source: source ?? "thinkorswim",
    fills: [
      {
        id: fill.id,
        time: fill.time,
        side: fill.side,
        quantity: fill.quantity,
        price: fill.price,
        amount: fill.amount,
        commission: fill.commission,
        miscFees: fill.miscFees,
        netCash: fill.netCash,
        description: fill.description,
      },
    ],
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
  const primary = picked[0];
  const merged = {
    ...primary,
    id: primary.id ?? stableTradeId(primary),
    volume,
    executions: mergedFills.length,
    pnl: Math.round(pnlSum * 100) / 100,
    fills: mergedFills,
    ...(tags.length > 0 ? { tags } : {}),
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
 * Split one trade into one row per fill (inverse of merge when fills exist).
 * @param {string} stableId
 * @param {object[]} allTrades
 * @returns {{ ok: true, next: object[] } | { ok: false, message: string }}
 */
export function unmergeTradeByStableId(stableId, allTrades) {
  const idx = allTrades.findIndex((t) => stableTradeId(t) === stableId);
  if (idx < 0) return { ok: false, message: "Trade not found." };
  const trade = allTrades[idx];
  const fills = Array.isArray(trade.fills) ? trade.fills : [];
  if (fills.length < 2) {
    return { ok: false, message: "This trade only has one fill. Unmerge needs at least two executions." };
  }

  const date = String(trade.date ?? "");
  const symbol = String(trade.symbol ?? "");
  const base = stableTradeId(trade);
  const split = fills.map((f, i) =>
    tradeFromSingleFill(f, date, symbol, `${base}~unm~${i}~${String(f.id ?? i)}`, trade.source),
  );

  const next = [...allTrades.slice(0, idx), ...split, ...allTrades.slice(idx + 1)];
  return { ok: true, next };
}
