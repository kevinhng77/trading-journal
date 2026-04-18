import { stableTradeId } from "./tradeLookup";
import { tradeSignedAmountForAggregation } from "../lib/tradeExecutionMetrics";
import { sumSchwabLineConsiderationFromFills } from "../lib/schwabConsiderationPnl.js";
import {
  ensureTradesMigratedForAccounts,
  getActiveAccountId,
  tradesStorageKey,
} from "./tradingAccounts";

export const TRADES_UPDATED_EVENT = "tj-trades-updated";

/** BOT/SOLD cash-grid fills: recompute stored `pnl` so bad merges / string amounts cannot drift (e.g. −$859). */
function isSchwabStyleCashFills(trade) {
  if (trade?.source === "thinkorswim" || trade?.source === "das") return true;
  const fills = trade?.fills;
  if (!Array.isArray(fills) || fills.length === 0) return false;
  return fills.some((f) => /^(BOT|SOLD)\s/i.test(String(f?.description ?? "")));
}

function normalizeTradePnlFromFills(trade) {
  if (!trade || !Array.isArray(trade.fills) || trade.fills.length === 0) return trade;
  if (!isSchwabStyleCashFills(trade)) return trade;
  const next = sumSchwabLineConsiderationFromFills(trade.fills);
  const prev = Number(trade.pnl);
  if (!Number.isFinite(prev) || Math.abs(prev - next) > 0.0005) {
    return { ...trade, pnl: next };
  }
  return trade;
}

/** @param {string} accountId */
export function loadTradesForAccount(accountId) {
  try {
    ensureTradesMigratedForAccounts();
    const key = tradesStorageKey(accountId);
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizeTradePnlFromFills);
  } catch {
    return [];
  }
}

export function loadTrades() {
  return loadTradesForAccount(getActiveAccountId());
}

/** @param {string} accountId @param {unknown[]} trades */
export function saveTradesForAccount(accountId, trades) {
  try {
    const key = tradesStorageKey(accountId);
    localStorage.setItem(key, JSON.stringify(trades));
  } catch (e) {
    if (e && e.name === "QuotaExceededError") {
      throw new Error(
        "Browser storage is full. Clear old trades or export a smaller CSV (e.g. one week), then try again.",
      );
    }
    throw e;
  }
  window.dispatchEvent(new Event(TRADES_UPDATED_EVENT));
}

export function saveTrades(trades) {
  saveTradesForAccount(getActiveAccountId(), trades);
}

/**
 * Replace any existing rows with the same `id`, then append (handy for re-import). Preserves `tags` when re-importing the same id.
 * @param {unknown[]} newTrades
 * @param {{ accountId?: string }} [opts] When set, merges into that account bucket instead of the active journal account.
 */
export function mergeTradesImported(newTrades, opts) {
  const accountId = opts?.accountId ?? getActiveAccountId();
  const newIds = new Set(newTrades.map((t) => t.id));
  const existing = loadTradesForAccount(accountId);
  const existingById = new Map(existing.map((t) => [t.id, t]));
  const kept = existing.filter((t) => !newIds.has(t.id));
  const withTags = newTrades.map((t) => {
    const prev = existingById.get(t.id);
    if (prev && Array.isArray(prev.tags) && prev.tags.length > 0) {
      return { ...t, tags: prev.tags };
    }
    return t;
  });
  const merged = [...kept, ...withTags];
  saveTradesForAccount(accountId, merged);
  return {
    imported: newTrades.length,
    removedDuplicates: existing.length - kept.length,
  };
}

/**
 * Merge fields into the trade matching `stableId` (same id as URLs / stableTradeId).
 * @param {string} stableId
 * @param {Record<string, unknown>} patch
 * @returns {boolean}
 */
export function patchTradeByStableId(stableId, patch) {
  const trades = loadTrades();
  const idx = trades.findIndex((t) => stableTradeId(t) === stableId);
  if (idx < 0) return false;
  trades[idx] = { ...trades[idx], ...patch };
  saveTrades(trades);
  return true;
}

/**
 * Remove trades whose stable id is in `ids`. Returns how many rows were removed.
 * @param {Iterable<string>} ids
 */
export function deleteTradesByStableIds(ids) {
  const idSet = new Set(ids);
  if (idSet.size === 0) return 0;
  const trades = loadTrades();
  const next = trades.filter((t) => !idSet.has(stableTradeId(t)));
  const removed = trades.length - next.length;
  if (removed > 0) saveTrades(next);
  return removed;
}

export function groupTradesByDate(trades) {
  const map = {};

  trades.forEach((trade) => {
    const date = trade.date;
    if (!map[date]) {
      map[date] = {
        date,
        pnl: 0,
        trades: 0,
        volume: 0,
        rows: [],
      };
    }

    map[date].pnl += tradeSignedAmountForAggregation(trade);
    map[date].trades += 1;
    map[date].volume += Number(trade.volume || 0);
    map[date].rows.push(trade);
  });

  Object.values(map).forEach((day) => {
    day.rows.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  });

  return map;
}

export function formatMoney(value) {
  const num = Number(value || 0);
  const sign = num > 0 ? "+" : num < 0 ? "-" : "";
  return `${sign}$${Math.abs(num).toFixed(2)}`;
}

export function pnlClass(value) {
  const num = Number(value || 0);
  if (num > 0) return "green";
  if (num < 0) return "red";
  return "grey";
}

export function formatDisplayDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** e.g. 08 Apr 2026 (tables) */
export function formatTradeTableDate(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}