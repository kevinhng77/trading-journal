/**
 * Manual monthly account ledger per trading account (localStorage).
 * Not tied to Reports; optional "fill from trades" is a convenience only.
 */

/** @typedef {{ pnl?: number | null, startBalance?: number | null, endBalance?: number | null, wireOut?: number | null, recordOpening?: boolean }} AccountBalanceMonthRow */

/** @typedef {Record<string, AccountBalanceMonthRow>} AccountBalanceTable */

const STORAGE_PREFIX = "tjAccountBalance:v1:";

/** @param {string} accountId */
export function accountBalanceStorageKey(accountId) {
  return STORAGE_PREFIX + accountId;
}

/** @param {unknown} v */
function numOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown} row */
function normalizeRow(row) {
  if (!row || typeof row !== "object") return {};
  const r = /** @type {AccountBalanceMonthRow} */ (row);
  return {
    pnl: numOrNull(r.pnl),
    startBalance: numOrNull(r.startBalance),
    endBalance: numOrNull(r.endBalance),
    wireOut: numOrNull(r.wireOut),
    recordOpening: Boolean(r.recordOpening),
  };
}

/** @param {AccountBalanceMonthRow | undefined} row */
export function isBalanceRowEmpty(row) {
  if (!row) return true;
  const hasNum =
    row.pnl != null ||
    row.endBalance != null ||
    row.wireOut != null ||
    (row.recordOpening && row.startBalance != null);
  return !hasNum && !row.recordOpening;
}

/** @param {string} accountId @returns {AccountBalanceTable} */
export function loadBalanceTable(accountId) {
  try {
    const raw = localStorage.getItem(accountBalanceStorageKey(accountId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    /** @type {AccountBalanceTable} */
    const out = {};
    for (const k of Object.keys(parsed)) {
      if (!/^\d{4}-\d{2}$/.test(k)) continue;
      out[k] = normalizeRow(parsed[k]);
    }
    return out;
  } catch {
    return {};
  }
}

/** @param {string} accountId @param {AccountBalanceTable} table */
export function saveBalanceTable(accountId, table) {
  const pruned = { ...table };
  for (const k of Object.keys(pruned)) {
    if (isBalanceRowEmpty(pruned[k])) delete pruned[k];
  }
  try {
    localStorage.setItem(accountBalanceStorageKey(accountId), JSON.stringify(pruned));
  } catch (e) {
    if (e && e.name === "QuotaExceededError") {
      throw new Error("Browser storage is full. Clear space and try again.");
    }
    throw e;
  }
}
