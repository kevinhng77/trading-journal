const STORAGE_KEY = "tradingJournalMonthlyBalanceTable";

/**
 * @typedef {{ start?: number | null, end?: number | null, wireOut?: number | null }} MonthlyBalanceRow
 */

/** @returns {Record<string, MonthlyBalanceRow>} */
export function loadMonthlyBalanceTable() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return {};
    return /** @type {Record<string, MonthlyBalanceRow>} */ (o);
  } catch {
    return {};
  }
}

/** @param {Record<string, MonthlyBalanceRow>} data */
export function saveMonthlyBalanceTable(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/** @param {string} monthKey `${year}-${monthIndex0to11}` */
export function getMonthlyBalanceRow(data, monthKey) {
  const r = data[monthKey];
  if (!r || typeof r !== "object") return {};
  return {
    start: typeof r.start === "number" && Number.isFinite(r.start) ? r.start : null,
    end: typeof r.end === "number" && Number.isFinite(r.end) ? r.end : null,
    wireOut: typeof r.wireOut === "number" && Number.isFinite(r.wireOut) ? r.wireOut : null,
  };
}
