import { getActiveAccountId } from "./tradingAccounts";

const LEGACY_DAYS_KEY = "tradingJournalStarredDates";
const LEGACY_TRADES_KEY = "tradingJournalStarredTradeIds";

/** @param {string} [accountId] defaults to active account */
function daysKey(accountId = getActiveAccountId()) {
  return `${LEGACY_DAYS_KEY}:${accountId}`;
}

/** @param {string} [accountId] */
function tradesKey(accountId = getActiveAccountId()) {
  return `${LEGACY_TRADES_KEY}:${accountId}`;
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

/** @param {string} accountId */
export function loadStarredDaysForAccount(accountId) {
  migrateLegacyStarredDaysOnce();
  try {
    const raw = localStorage.getItem(daysKey(accountId));
    const a = asStringArray(raw ? JSON.parse(raw) : []);
    return new Set(a.filter((d) => DATE_RE.test(d)));
  } catch {
    return new Set();
  }
}

/** @param {string} accountId */
export function loadStarredTradeIdsForAccount(accountId) {
  migrateLegacyStarredTradesOnce();
  try {
    const raw = localStorage.getItem(tradesKey(accountId));
    return new Set(asStringArray(raw ? JSON.parse(raw) : []));
  } catch {
    return new Set();
  }
}

/** @returns {Set<string>} */
export function loadStarredDays() {
  return loadStarredDaysForAccount(getActiveAccountId());
}

/** @returns {Set<string>} */
export function loadStarredTradeIds() {
  return loadStarredTradeIdsForAccount(getActiveAccountId());
}

/** @param {string} accountId @param {Set<string>} set */
function saveDaysSetForAccount(accountId, set) {
  const arr = [...set].filter((d) => DATE_RE.test(d)).sort();
  if (!arr.length) localStorage.removeItem(daysKey(accountId));
  else localStorage.setItem(daysKey(accountId), JSON.stringify(arr));
}

/** @param {string} accountId @param {Set<string>} set */
function saveTradesSetForAccount(accountId, set) {
  const arr = [...set].sort();
  if (!arr.length) localStorage.removeItem(tradesKey(accountId));
  else localStorage.setItem(tradesKey(accountId), JSON.stringify(arr));
}

function bump() {
  window.dispatchEvent(new CustomEvent(STARS_CHANGED_EVENT));
}

/**
 * @param {string} date - YYYY-MM-DD
 * @param {string} [accountId] bucket to toggle (defaults active journal account)
 * @returns {boolean} true if now starred
 */
export function toggleStarredDay(date, accountId) {
  const aid = accountId ?? getActiveAccountId();
  if (!DATE_RE.test(date)) return false;
  const s = loadStarredDaysForAccount(aid);
  if (s.has(date)) s.delete(date);
  else s.add(date);
  saveDaysSetForAccount(aid, s);
  bump();
  return s.has(date);
}

/**
 * @param {string} tradeId
 * @param {string} [accountId] bucket to toggle (defaults active journal account)
 * @returns {boolean} true if now starred
 */
export function toggleStarredTrade(tradeId, accountId) {
  const aid = accountId ?? getActiveAccountId();
  if (!tradeId) return false;
  const s = loadStarredTradeIdsForAccount(aid);
  if (s.has(tradeId)) s.delete(tradeId);
  else s.add(tradeId);
  saveTradesSetForAccount(aid, s);
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

/** Remove all starred trade ids for an account (e.g. when the journal has no trades left). */
export function clearStarredTradeIdsForAccount(accountId) {
  const aid = accountId ?? getActiveAccountId();
  saveTradesSetForAccount(aid, new Set());
  bump();
}
