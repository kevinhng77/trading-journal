const KEY = "tradingJournalTradeNotes";

/** Same-tab listeners (e.g. Trades list) can refresh note previews when a note is saved. */
export const TRADE_NOTES_CHANGED_EVENT = "tradingJournalTradeNotesChanged";

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
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
  localStorage.setItem(KEY, JSON.stringify(all));
  try {
    window.dispatchEvent(new CustomEvent(TRADE_NOTES_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}
