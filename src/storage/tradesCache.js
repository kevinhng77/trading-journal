/** In-memory mirror of persisted trades per account — populated before React mounts (see hydrateTradesStorageCache). */

/** @type {Map<string, unknown[]>} */
const tradesCacheByAccount = new Map();

/** @param {string} accountId */
export function getTradesCache(accountId) {
  return tradesCacheByAccount.get(accountId);
}

/** @param {string} accountId @param {unknown[]} trades */
export function setTradesCache(accountId, trades) {
  tradesCacheByAccount.set(accountId, trades);
}

/** @param {string} accountId */
export function invalidateTradesCacheForAccount(accountId) {
  tradesCacheByAccount.delete(accountId);
}

/** @param {string} accountId */
export function tradesCacheHas(accountId) {
  return tradesCacheByAccount.has(accountId);
}
