import { stableTradeId } from "./tradeLookup";

const STORAGE_KEY = "tradingJournalTrades";
export const TRADES_UPDATED_EVENT = "tj-trades-updated";

export function loadTrades() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTrades(trades) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
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

/** Replace any existing rows with the same `id`, then append (handy for re-import). Preserves `tags` when re-importing the same id. */
export function mergeTradesImported(newTrades) {
  const newIds = new Set(newTrades.map((t) => t.id));
  const existing = loadTrades();
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
  saveTrades(merged);
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

    map[date].pnl += Number(trade.pnl || 0);
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