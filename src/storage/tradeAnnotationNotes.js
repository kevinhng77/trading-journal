import { getActiveAccountId } from "./tradingAccounts";

const PREFIX_BASE = "tradingJournalTradeAnnotationNotes";
const LEGACY_PREFIX = "tradingJournalTradeAnnotationNotes:";

function keyFor(tradeId) {
  return `${PREFIX_BASE}:${getActiveAccountId()}:${tradeId}`;
}

/**
 * @param {unknown} v
 * @returns {v is string}
 */
function isNoteRow(v) {
  return typeof v === "string";
}

/**
 * @param {string} tradeId
 * @returns {string[]}
 */
export function loadTradeAnnotationNotes(tradeId) {
  if (!tradeId) return [];
  try {
    let raw = localStorage.getItem(keyFor(tradeId));
    if (!raw && getActiveAccountId() === "schwab") {
      raw = localStorage.getItem(LEGACY_PREFIX + tradeId);
      if (raw) localStorage.setItem(keyFor(tradeId), raw);
    }
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return p.filter(isNoteRow);
  } catch {
    return [];
  }
}

/**
 * @param {string} tradeId
 * @param {string[]} rows
 */
export function saveTradeAnnotationNotes(tradeId, rows) {
  if (!tradeId) return;
  try {
    const key = keyFor(tradeId);
    if (!rows.length) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}
