/**
 * Broker / account profiles: separate trade lists and related notes so SCHWB vs DAS imports do not mix.
 */

export const ACCOUNT_CHANGED_EVENT = "tj-account-changed";
export const ACCOUNT_PROFILE_UPDATED_EVENT = "tj-account-profile-updated";

/** @type {{ id: string, label: string }[]} */
export const TRADING_ACCOUNTS = [
  { id: "schwab", label: "SCHWB" },
  { id: "das", label: "DAS" },
];

const ACTIVE_KEY = "tjActiveAccountId";
const PROFILES_KEY = "tjAccountProfiles";
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

/** @typedef {{ displayName?: string, avatarDataUrl?: string }} AccountProfile */

function dispatchProfileUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACCOUNT_PROFILE_UPDATED_EVENT));
}

function readProfilesRaw() {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return typeof o === "object" && o !== null && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/** @param {string} accountId */
export function getAccountProfile(accountId) {
  const all = readProfilesRaw();
  const p = all[accountId];
  if (!p || typeof p !== "object") return { displayName: "", avatarDataUrl: "" };
  const displayName = typeof p.displayName === "string" ? p.displayName.trim() : "";
  const avatarDataUrl = typeof p.avatarDataUrl === "string" ? p.avatarDataUrl.trim() : "";
  return { displayName, avatarDataUrl };
}

/** @param {string} accountId */
export function getResolvedAccountDisplayName(accountId) {
  const { displayName } = getAccountProfile(accountId);
  if (displayName) return displayName;
  const def = TRADING_ACCOUNTS.find((a) => a.id === accountId);
  return def ? def.label : accountId;
}

/** @param {string} accountId @param {Partial<AccountProfile>} patch */
export function mergeAccountProfile(accountId, patch) {
  if (typeof localStorage === "undefined") return;
  if (!TRADING_ACCOUNTS.some((a) => a.id === accountId)) return;
  try {
    const all = { ...readProfilesRaw() };
    const cur = getAccountProfile(accountId);
    const next = { ...cur, ...patch };
    if (!next.displayName && !next.avatarDataUrl) {
      delete all[accountId];
    } else {
      all[accountId] = {
        ...(next.displayName ? { displayName: next.displayName } : {}),
        ...(next.avatarDataUrl ? { avatarDataUrl: next.avatarDataUrl } : {}),
      };
      if (!all[accountId].displayName) delete all[accountId].displayName;
      if (!all[accountId].avatarDataUrl) delete all[accountId].avatarDataUrl;
      if (Object.keys(all[accountId]).length === 0) delete all[accountId];
    }
    if (Object.keys(all).length === 0) localStorage.removeItem(PROFILES_KEY);
    else localStorage.setItem(PROFILES_KEY, JSON.stringify(all));
    dispatchProfileUpdated();
  } catch {
    /* ignore */
  }
}

/** @param {string} accountId @param {string} displayName */
export function setAccountDisplayName(accountId, displayName) {
  const trimmed = String(displayName || "").trim();
  const cur = getAccountProfile(accountId);
  mergeAccountProfile(accountId, { displayName: trimmed, avatarDataUrl: cur.avatarDataUrl });
}

/** @param {string} accountId @param {string} avatarDataUrl */
export function setAccountAvatarDataUrl(accountId, avatarDataUrl) {
  const url = String(avatarDataUrl || "").trim();
  const cur = getAccountProfile(accountId);
  mergeAccountProfile(accountId, { displayName: cur.displayName, avatarDataUrl: url });
}

/** @param {string} accountId */
export function clearAccountAvatar(accountId) {
  const cur = getAccountProfile(accountId);
  mergeAccountProfile(accountId, { displayName: cur.displayName, avatarDataUrl: "" });
}

/** Token for settings UI when any profile or active account may matter. */
export function getAllAccountProfilesToken() {
  const active = getActiveAccountId();
  let raw = "";
  if (typeof localStorage !== "undefined") {
    try {
      raw = localStorage.getItem(PROFILES_KEY) || "";
    } catch {
      /* ignore */
    }
  }
  return `${active}\u0003${raw}`;
}

/** Token for useSyncExternalStore (identity when display-relevant fields change). */
export function getTradingAccountDisplayToken() {
  const active = getActiveAccountId();
  const prof = getAccountProfile(active);
  const def = TRADING_ACCOUNTS.find((a) => a.id === active);
  return [active, prof.displayName, prof.avatarDataUrl, def?.label || ""].join("\u001e");
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
