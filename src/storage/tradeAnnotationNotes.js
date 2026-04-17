const PREFIX = "tradingJournalTradeAnnotationNotes:";

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
    const raw = localStorage.getItem(PREFIX + tradeId);
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
    if (!rows.length) {
      localStorage.removeItem(PREFIX + tradeId);
      return;
    }
    localStorage.setItem(PREFIX + tradeId, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}
