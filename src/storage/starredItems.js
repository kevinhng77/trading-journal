const DAYS_KEY = "tradingJournalStarredDates";
const TRADES_KEY = "tradingJournalStarredTradeIds";

export const STARS_CHANGED_EVENT = "tradingJournalStarsChanged";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @param {unknown} v */
function asStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string" && x.length > 0);
}

/** @returns {Set<string>} */
export function loadStarredDays() {
  try {
    const raw = localStorage.getItem(DAYS_KEY);
    const a = asStringArray(raw ? JSON.parse(raw) : []);
    return new Set(a.filter((d) => DATE_RE.test(d)));
  } catch {
    return new Set();
  }
}

/** @returns {Set<string>} */
export function loadStarredTradeIds() {
  try {
    const raw = localStorage.getItem(TRADES_KEY);
    return new Set(asStringArray(raw ? JSON.parse(raw) : []));
  } catch {
    return new Set();
  }
}

/** @param {Set<string>} set */
function saveDaysSet(set) {
  const arr = [...set].filter((d) => DATE_RE.test(d)).sort();
  if (!arr.length) localStorage.removeItem(DAYS_KEY);
  else localStorage.setItem(DAYS_KEY, JSON.stringify(arr));
}

/** @param {Set<string>} set */
function saveTradesSet(set) {
  const arr = [...set].sort();
  if (!arr.length) localStorage.removeItem(TRADES_KEY);
  else localStorage.setItem(TRADES_KEY, JSON.stringify(arr));
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
