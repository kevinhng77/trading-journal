import { stableTradeId } from "./tradeLookup";
import { tradeSignedAmountForAggregation } from "../lib/tradeExecutionMetrics";
import { sumSchwabLineConsiderationFromFills } from "../lib/schwabConsiderationPnl.js";
import {
  ensureTradesMigratedForAccounts,
  getActiveAccountId,
  listTradingAccounts,
  tradesStorageKey,
} from "./tradingAccounts";
import { clearStarredTradeIdsForAccount } from "./starredItems.js";
import { collapseOppositeOpenSwingPairs } from "../lib/mergeOppositeOpenSwings.js";
import { idbGetTrades, idbPutTrades, openTradesDb } from "./tradesIndexedDb.js";
import { getTradesCache, setTradesCache } from "./tradesCache.js";

export const TRADES_UPDATED_EVENT = "tj-trades-updated";

/** `"idb"` uses IndexedDB (much larger quota); `"localStorage"` is the legacy ~5MB sync fallback. */
let tradesPersistBackend = /** @type {"idb" | "localStorage"} */ ("idb");

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

function finalizeLoadedRows(rows) {
  const normalized = (Array.isArray(rows) ? rows : []).map(normalizeTradePnlFromFills);
  return collapseOppositeOpenSwingPairs(normalized);
}

/**
 * Load trade arrays into memory (and migrate localStorage → IndexedDB when possible).
 * Call once before rendering React (`main.jsx`).
 */
export async function hydrateTradesStorageCache() {
  ensureTradesMigratedForAccounts();
  tradesPersistBackend = "idb";
  try {
    await openTradesDb();
  } catch {
    tradesPersistBackend = "localStorage";
    console.warn(
      "tj: IndexedDB unavailable — trades stay in localStorage only (smaller browser quota). Try another browser or disable strict tracking.",
    );
  }

  const accounts = listTradingAccounts();
  for (const { id } of accounts) {
    /** @type {unknown[]} */
    let rows;

    if (tradesPersistBackend === "idb") {
      const fromIdb = await idbGetTrades(id);
      if (fromIdb !== undefined) {
        rows = fromIdb;
      } else {
        const raw = typeof localStorage !== "undefined" ? localStorage.getItem(tradesStorageKey(id)) : null;
        try {
          rows = raw ? JSON.parse(raw) : [];
          if (!Array.isArray(rows)) rows = [];
        } catch {
          rows = [];
        }
      }
    } else {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(tradesStorageKey(id)) : null;
      try {
        rows = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(rows)) rows = [];
      } catch {
        rows = [];
      }
    }

    const { next, changed } = finalizeLoadedRows(rows);
    setTradesCache(id, next);

    if (changed && Array.isArray(next) && next.length === 0) {
      clearStarredTradeIdsForAccount(id);
    }

    try {
      if (tradesPersistBackend === "idb") {
        await idbPutTrades(id, next);
        try {
          localStorage.removeItem(tradesStorageKey(id));
        } catch {
          /* ignore */
        }
      } else {
        localStorage.setItem(tradesStorageKey(id), JSON.stringify(next));
      }
    } catch (e) {
      if (e && e.name === "QuotaExceededError") {
        console.warn("tj: quota while hydrating trades", id, e);
      }
    }
  }
}

/** @param {string} accountId @param {unknown[]} trades */
function persistTradesFireAndForget(accountId, trades) {
  const key = tradesStorageKey(accountId);
  if (tradesPersistBackend === "localStorage") {
    try {
      localStorage.setItem(key, JSON.stringify(trades));
    } catch (e) {
      if (e && e.name === "QuotaExceededError") {
        throw new Error(
          "Browser storage is full. Clear old trades or export a smaller CSV (e.g. one week), then try again.",
        );
      }
      throw e;
    }
    return;
  }

  void idbPutTrades(accountId, trades)
    .then(() => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    })
    .catch((err) => {
      console.warn("tj: IndexedDB save failed; retrying localStorage", err);
      tradesPersistBackend = "localStorage";
      try {
        localStorage.setItem(key, JSON.stringify(trades));
      } catch (e) {
        if (e && e.name === "QuotaExceededError") {
          console.error("tj: localStorage quota after IDB failure", e);
        }
      }
    });
}

/** @param {string} accountId */
export function loadTradesForAccount(accountId) {
  try {
    ensureTradesMigratedForAccounts();
    const cached = getTradesCache(accountId);
    /** @type {unknown[]} */
    const rawList = cached !== undefined ? cached : [];
    const normalized = rawList.map(normalizeTradePnlFromFills);
    const { next, changed } = collapseOppositeOpenSwingPairs(normalized);
    if (changed) {
      setTradesCache(accountId, next);
      try {
        persistTradesFireAndForget(accountId, next);
        if (Array.isArray(next) && next.length === 0) {
          clearStarredTradeIdsForAccount(accountId);
        }
        window.dispatchEvent(new Event(TRADES_UPDATED_EVENT));
      } catch (e) {
        if (e && e.name === "QuotaExceededError") {
          console.warn("tj: could not persist opposite-open swing merge (quota)", e);
          return normalized;
        }
        throw e;
      }
      return next.map(normalizeTradePnlFromFills);
    }
    return normalized;
  } catch {
    return [];
  }
}

export function loadTrades() {
  return loadTradesForAccount(getActiveAccountId());
}

/** @param {string} accountId @param {unknown[]} trades */
export function saveTradesForAccount(accountId, trades) {
  const arr = Array.isArray(trades) ? [...trades] : [];
  const { next } = collapseOppositeOpenSwingPairs(arr);
  setTradesCache(accountId, next);
  try {
    persistTradesFireAndForget(accountId, next);
    if (Array.isArray(next) && next.length === 0) {
      clearStarredTradeIdsForAccount(accountId);
    }
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
