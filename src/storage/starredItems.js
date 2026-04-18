import { getActiveAccountId } from "./tradingAccounts";

const LEGACY_DAYS_KEY = "tradingJournalStarredDates";
const LEGACY_TRADES_KEY = "tradingJournalStarredTradeIds";

function daysKey() {
  return `${LEGACY_DAYS_KEY}:${getActiveAccountId()}`;
}

function tradesKey() {
  return `${LEGACY_TRADES_KEY}:${getActiveAccountId()}`;
}

export const STARS_CHANGED_EVENT = "tradingJournalStarsChanged";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @param {unknown} v */
function asStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string" && x.length > 0);
}

function migrateLegacyStarredDaysOnce() {
  if (typeof localStorage === "undefined") return;
  const legacy = localStorage.getItem(LEGACY_DAYS_KEY);
  if (!legacy) return;
  const schwabK = `${LEGACY_DAYS_KEY}:schwab`;
  if (localStorage.getItem(schwabK) == null) {
    localStorage.setItem(schwabK, legacy);
  }
  localStorage.removeItem(LEGACY_DAYS_KEY);
}

function migrateLegacyStarredTradesOnce() {
  if (typeof localStorage === "undefined") return;
  const legacy = localStorage.getItem(LEGACY_TRADES_KEY);
  if (!legacy) return;
  const schwabK = `${LEGACY_TRADES_KEY}:schwab`;
  if (localStorage.getItem(schwabK) == null) {
    localStorage.setItem(schwabK, legacy);
  }
  localStorage.removeItem(LEGACY_TRADES_KEY);
}

/** @returns {Set<string>} */
export function loadStarredDays() {
  migrateLegacyStarredDaysOnce();
  try {
    const raw = localStorage.getItem(daysKey());
    const a = asStringArray(raw ? JSON.parse(raw) : []);
    return new Set(a.filter((d) => DATE_RE.test(d)));
  } catch {
    return new Set();
  }
}

/** @returns {Set<string>} */
export function loadStarredTradeIds() {
  migrateLegacyStarredTradesOnce();
  try {
    const raw = localStorage.getItem(tradesKey());
    return new Set(asStringArray(raw ? JSON.parse(raw) : []));
  } catch {
    return new Set();
  }
}

/** @param {Set<string>} set */
function saveDaysSet(set) {
  const arr = [...set].filter((d) => DATE_RE.test(d)).sort();
  if (!arr.length) localStorage.removeItem(daysKey());
  else localStorage.setItem(daysKey(), JSON.stringify(arr));
}

/** @param {Set<string>} set */
function saveTradesSet(set) {
  const arr = [...set].sort();
  if (!arr.length) localStorage.removeItem(tradesKey());
  else localStorage.setItem(tradesKey(), JSON.stringify(arr));
}

function bump() {
  window.dispatchEvent(new CustomEvent(STARS_CHANGED_EVENT));
}

/**
 * @param {string} date - YYYY-MM-DD
 * @returns {boolean} true if now starred
 */
export function toggleStarredDay(date) {
  if (!DATE_RE.test(date)) return false;
  const s = loadStarredDays();
  if (s.has(date)) s.delete(date);
  else s.add(date);
  saveDaysSet(s);
  bump();
  return s.has(date);
}

/** @param {string} tradeId */
export function toggleStarredTrade(tradeId) {
  if (!tradeId) return false;
  const s = loadStarredTradeIds();
  if (s.has(tradeId)) s.delete(tradeId);
  else s.add(tradeId);
  saveTradesSet(s);
  bump();
  return s.has(tradeId);
}

/** @param {string} date */
export function isDayStarred(date) {
  return loadStarredDays().has(date);
}

/** @param {string} tradeId */
export function isTradeStarred(tradeId) {
  return loadStarredTradeIds().has(tradeId);
}
