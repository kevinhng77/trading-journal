/**
 * Broker / account profiles: separate trade lists and related notes per account bucket.
 * Accounts are user-defined (add/remove); each has an import format (Schwab/TOS vs DAS parser).
 */

export const ACCOUNT_CHANGED_EVENT = "tj-account-changed";
export const ACCOUNT_PROFILE_UPDATED_EVENT = "tj-account-profile-updated";
export const ACCOUNTS_LIST_CHANGED_EVENT = "tj-accounts-list-changed";

const ACTIVE_KEY = "tjActiveAccountId";
const PROFILES_KEY = "tjAccountProfiles";
const ACCOUNTS_LIST_KEY = "tjTradingAccountsListV1";
const TRADES_PREFIX = "tjTrades:";

const LEGACY_TRADES_KEY = "tradingJournalTrades";

/** @typedef {"schwab" | "das"} ImportFormat */

/** @typedef {{ id: string, label: string, importFormat: ImportFormat }} TradingAccountDef */

function dispatchAccountsListChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACCOUNTS_LIST_CHANGED_EVENT));
}

/** Default buckets when no list is stored yet (matches original app). */
function defaultAccountsSeed() {
  return /** @type {TradingAccountDef[]} */ ([
    { id: "schwab", label: "SCHWB", importFormat: "schwab" },
    { id: "das", label: "DAS", importFormat: "das" },
  ]);
}

function normalizeAccountRow(/** @type {unknown} */ a) {
  if (!a || typeof a !== "object") return null;
  const o = /** @type {{ id?: unknown, label?: unknown, importFormat?: unknown }} */ (a);
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;
  const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : id.toUpperCase();
  const importFormat = o.importFormat === "das" ? "das" : "schwab";
  return /** @type {TradingAccountDef} */ ({ id, label, importFormat });
}

function readAccountsListFromStorage() {
  if (typeof localStorage === "undefined") return defaultAccountsSeed();
  try {
    const raw = localStorage.getItem(ACCOUNTS_LIST_KEY);
    if (!raw) return defaultAccountsSeed();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return defaultAccountsSeed();
    const cleaned = arr.map(normalizeAccountRow).filter(Boolean);
    return cleaned.length ? /** @type {TradingAccountDef[]} */ (cleaned) : defaultAccountsSeed();
  } catch {
    return defaultAccountsSeed();
  }
}

function writeAccountsList(/** @type {TradingAccountDef[]} */ list) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ACCOUNTS_LIST_KEY, JSON.stringify(list));
    dispatchAccountsListChanged();
  } catch {
    /* ignore */
  }
}

/** @param {string} accountId */
export function getTradingAccount(accountId) {
  return listTradingAccounts().find((a) => a.id === accountId) ?? null;
}

export function listTradingAccounts() {
  return readAccountsListFromStorage();
}

/**
 * @param {{ label: string, importFormat: ImportFormat }} params
 * @returns {string} new account id
 */
export function addTradingAccount({ label, importFormat }) {
  const fmt = importFormat === "das" ? "das" : "schwab";
  const trimmed = String(label || "").trim() || "New account";
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `acct_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`
      : `acct_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const next = [...listTradingAccounts(), { id, label: trimmed, importFormat: fmt }];
  writeAccountsList(next);
  return id;
}

/**
 * @param {string} accountId
 * @returns {{ ok: boolean, message?: string }}
 */
export function removeTradingAccount(accountId) {
  const list = listTradingAccounts();
  if (list.length <= 1) {
    return { ok: false, message: "Keep at least one account." };
  }
  if (!list.some((a) => a.id === accountId)) {
    return { ok: false, message: "Account not found." };
  }
  clearAccountStorage(accountId);
  removeAccountProfileRow(accountId);
  const next = list.filter((a) => a.id !== accountId);
  writeAccountsList(next);
  const active = getActiveAccountId();
  if (active === accountId) {
    setActiveAccountId(next[0].id);
  }
  return { ok: true };
}

/** @param {string} accountId */
function removeAccountProfileRow(accountId) {
  if (typeof localStorage === "undefined") return;
  try {
    const all = { ...readProfilesRaw() };
    delete all[accountId];
    if (Object.keys(all).length === 0) localStorage.removeItem(PROFILES_KEY);
    else localStorage.setItem(PROFILES_KEY, JSON.stringify(all));
    dispatchProfileUpdated();
  } catch {
    /* ignore */
  }
}

/**
 * Remove per-account data from localStorage (trades, notes, stars, chart keys for that bucket).
 * @param {string} accountId
 */
export function clearAccountStorage(accountId) {
  if (typeof localStorage === "undefined" || !accountId) return;
  const keysToRemove = new Set([
    tradesStorageKey(accountId),
    journalDayNotesStorageKey(accountId),
    `tradingJournalStarredDates:${accountId}`,
    `tradingJournalStarredTradeIds:${accountId}`,
    `tradingJournalTradeNotes:${accountId}`,
  ]);
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (keysToRemove.has(k)) {
        localStorage.removeItem(k);
        continue;
      }
      if (
        k.startsWith(`tradingJournalTradeChartTrendlines:${accountId}:`) ||
        k.startsWith(`tradingJournalTradeChartRiskLines:${accountId}:`) ||
        k.startsWith(`tradingJournalTradeAnnotationNotes:${accountId}:`)
      ) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("tj-trades-updated"));
}

/** @param {string} accountId */
export function tradesStorageKey(accountId) {
  return `${TRADES_PREFIX}${accountId}`;
}

function accountIdIsValid(accountId) {
  return listTradingAccounts().some((a) => a.id === accountId);
}

export function getActiveAccountId() {
  if (typeof localStorage === "undefined") return "schwab";
  try {
    const id = localStorage.getItem(ACTIVE_KEY);
    if (id && accountIdIsValid(id)) return id;
  } catch {
    /* ignore */
  }
  const first = listTradingAccounts()[0];
  return first ? first.id : "schwab";
}

/** @param {string} accountId */
export function setActiveAccountId(accountId) {
  if (typeof localStorage === "undefined") return;
  if (!accountIdIsValid(accountId)) return;
  try {
    localStorage.setItem(ACTIVE_KEY, accountId);
    window.dispatchEvent(new CustomEvent(ACCOUNT_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
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
  const def = getTradingAccount(accountId);
  return def ? def.label : accountId;
}

/** @param {string} accountId @param {Partial<AccountProfile>} patch */
export function mergeAccountProfile(accountId, patch) {
  if (typeof localStorage === "undefined") return;
  if (!accountIdIsValid(accountId)) return;
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
  let listRaw = "";
  if (typeof localStorage !== "undefined") {
    try {
      raw = localStorage.getItem(PROFILES_KEY) || "";
      listRaw = localStorage.getItem(ACCOUNTS_LIST_KEY) || "";
    } catch {
      /* ignore */
    }
  }
  return `${active}\u0003${raw}\u0004${listRaw}`;
}

/** Token for useSyncExternalStore (identity when display-relevant fields change). */
export function getTradingAccountDisplayToken() {
  const active = getActiveAccountId();
  const prof = getAccountProfile(active);
  const def = getTradingAccount(active);
  const listSig = listTradingAccounts()
    .map((a) => `${a.id}:${a.label}:${a.importFormat}`)
    .join("|");
  return [active, prof.displayName, prof.avatarDataUrl, def?.label || "", listSig].join("\u001e");
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
