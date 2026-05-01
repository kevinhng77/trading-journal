/**
 * IndexedDB backing for trade arrays — far larger quota than localStorage (~5MB typical cap).
 */

const DB_NAME = "goatedvue-trades-v1";
const STORE = "byAccount";

/** @type {Promise<IDBDatabase> | null} */
let dbOpenPromise = null;

export function openTradesDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexedDB unavailable"));
  }
  if (!dbOpenPromise) {
    dbOpenPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onerror = () => {
        dbOpenPromise = null;
        reject(req.error ?? new Error("indexedDB open failed"));
      };
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
    });
  }
  return dbOpenPromise;
}

/**
 * @param {string} accountId
 * @returns {Promise<unknown[] | undefined>} undefined if never stored
 */
export async function idbGetTrades(accountId) {
  const db = await openTradesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(accountId);
    req.onerror = () => reject(req.error ?? new Error("idb read failed"));
    req.onsuccess = () => {
      const val = req.result;
      resolve(val === undefined ? undefined : Array.isArray(val) ? val : []);
    };
  });
}

/**
 * @param {string} accountId
 * @param {unknown[]} trades
 */
export async function idbPutTrades(accountId, trades) {
  const db = await openTradesDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error ?? new Error("idb write failed"));
    tx.objectStore(STORE).put(trades, accountId);
  });
}

/** @param {string} accountId */
export async function idbDeleteTrades(accountId) {
  try {
    const db = await openTradesDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error ?? new Error("idb delete failed"));
      tx.objectStore(STORE).delete(accountId);
    });
  } catch {
    /* DB never opened — ignore */
  }
}
