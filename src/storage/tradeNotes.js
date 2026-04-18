import { getActiveAccountId } from "./tradingAccounts";

const LEGACY_KEY = "tradingJournalTradeNotes";

/** @param {string} accountId */
function notesStorageKey(accountId) {
  return `${LEGACY_KEY}:${accountId}`;
}

function migrateLegacyTradeNotesOnce() {
  if (typeof localStorage === "undefined") return;
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return;
  const schwabK = notesStorageKey("schwab");
  if (localStorage.getItem(schwabK) == null) {
    localStorage.setItem(schwabK, legacy);
  }
  localStorage.removeItem(LEGACY_KEY);
}

/** Same-tab listeners (e.g. Trades list) can refresh note previews when a note is saved. */
export const TRADE_NOTES_CHANGED_EVENT = "tradingJournalTradeNotesChanged";

function readAll() {
  migrateLegacyTradeNotesOnce();
  try {
    const raw = localStorage.getItem(notesStorageKey(getActiveAccountId()));
    const o = raw ? JSON.parse(raw) : {};
    return typeof o === "object" && o != null ? o : {};
  } catch {
    return {};
  }
}

/** @returns {Record<string, string>} */
export function readAllTradeNotes() {
  return readAll();
}

export function loadTradeNote(tradeId) {
  if (!tradeId) return "";
  return readAll()[tradeId] ?? "";
}

export function saveTradeNote(tradeId, text) {
  if (!tradeId) return;
  const all = readAll();
  if (text.trim()) all[tradeId] = text;
  else delete all[tradeId];
  try {
    localStorage.setItem(notesStorageKey(getActiveAccountId()), JSON.stringify(all));
    window.dispatchEvent(new CustomEvent(TRADE_NOTES_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}
