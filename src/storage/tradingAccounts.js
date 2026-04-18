/**
 * Broker / account profiles: separate trade lists and related notes so SCHWB vs DAS imports do not mix.
 */

export const ACCOUNT_CHANGED_EVENT = "tj-account-changed";

/** @type {{ id: string, label: string }[]} */
export const TRADING_ACCOUNTS = [
  { id: "schwab", label: "SCHWB" },
  { id: "das", label: "DAS" },
];

const ACTIVE_KEY = "tjActiveAccountId";
const TRADES_PREFIX = "tjTrades:";

const LEGACY_TRADES_KEY = "tradingJournalTrades";

/** @param {string} accountId */
export function tradesStorageKey(accountId) {
  return `${TRADES_PREFIX}${accountId}`;
}

export function getActiveAccountId() {
  if (typeof localStorage === "undefined") return "schwab";
  try {
    const id = localStorage.getItem(ACTIVE_KEY);
    if (id && TRADING_ACCOUNTS.some((a) => a.id === id)) return id;
  } catch {
    /* ignore */
  }
  return "schwab";
}

/** @param {string} accountId */
export function setActiveAccountId(accountId) {
  if (typeof localStorage === "undefined") return;
  if (!TRADING_ACCOUNTS.some((a) => a.id === accountId)) return;
  try {
    localStorage.setItem(ACTIVE_KEY, accountId);
    window.dispatchEvent(new CustomEvent(ACCOUNT_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export function listTradingAccounts() {
  return TRADING_ACCOUNTS;
}

/** One-time: legacy flat trades blob → SCHWB account bucket. */
export function ensureTradesMigratedForAccounts() {
  if (typeof localStorage === "undefined") return;
  try {
    const legacy = localStorage.getItem(LEGACY_TRADES_KEY);
    if (!legacy) return;
    const schwabKey = tradesStorageKey("schwab");
    const cur = localStorage.getItem(schwabKey);
    if (!cur || cur === "[]") {
      localStorage.setItem(schwabKey, legacy);
    }
    localStorage.removeItem(LEGACY_TRADES_KEY);
  } catch {
    /* ignore */
  }
}

const JOURNAL_DAY_LEGACY = "tradingJournalDayNotes";

/** @param {string} accountId */
export function journalDayNotesStorageKey(accountId) {
  return `${JOURNAL_DAY_LEGACY}:${accountId}`;
}

/** One-time: flat per-day notes → SCHWB account bucket. */
export function migrateJournalDayNotesFromLegacy() {
  if (typeof localStorage === "undefined") return;
  try {
    const legacy = localStorage.getItem(JOURNAL_DAY_LEGACY);
    if (!legacy) return;
    const schwabKey = journalDayNotesStorageKey("schwab");
    if (localStorage.getItem(schwabKey) == null) {
      localStorage.setItem(schwabKey, legacy);
    }
    localStorage.removeItem(JOURNAL_DAY_LEGACY);
  } catch {
    /* ignore */
  }
}
