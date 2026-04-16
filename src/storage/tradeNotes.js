const KEY = "tradingJournalTradeNotes";

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
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
}
