const STORAGE_KEY = "tradingJournalPlaybook";

/** @typedef {{ id: string, dataUrl: string }} PlaybookScreenshot */

/**
 * @typedef {object} PlaybookPlay
 * @property {string} id
 * @property {string} name
 * @property {string} rules
 * @property {string} criteria
 * @property {string} entry
 * @property {string} exit
 * @property {string} rPlan
 * @property {PlaybookScreenshot[]} screenshots
 */

function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `play-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** @returns {PlaybookPlay} */
export function createEmptyPlay() {
  return {
    id: newId(),
    name: "Untitled play",
    rules: "",
    criteria: "",
    entry: "",
    exit: "",
    rPlan: "",
    screenshots: [],
  };
}

/** @param {unknown} row */
function normalizeScreenshot(row) {
  if (!row || typeof row !== "object") return null;
  const dataUrl = /** @type {{ dataUrl?: unknown }} */ (row).dataUrl;
  const id = /** @type {{ id?: unknown }} */ (row).id;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return null;
  return {
    id: typeof id === "string" && id ? id : newId(),
    dataUrl,
  };
}

/** @param {unknown} row @returns {PlaybookPlay | null} */
function normalizePlay(row) {
  if (!row || typeof row !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (row);
  const id = typeof o.id === "string" && o.id ? o.id : newId();
  const str = (k, fallback = "") => (typeof o[k] === "string" ? o[k] : fallback);
  const shots = Array.isArray(o.screenshots)
    ? o.screenshots.map(normalizeScreenshot).filter(Boolean)
    : [];
  return {
    id,
    name: str("name", "Untitled play") || "Untitled play",
    rules: str("rules"),
    criteria: str("criteria"),
    entry: str("entry"),
    exit: str("exit"),
    rPlan: str("rPlan"),
    screenshots: /** @type {PlaybookScreenshot[]} */ (shots),
  };
}

/** @returns {PlaybookPlay[]} */
export function loadPlaybook() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizePlay).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * @param {PlaybookPlay[]} plays
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function savePlaybook(plays) {
  try {
    const payload = JSON.stringify(plays);
    localStorage.setItem(STORAGE_KEY, payload);
    return { ok: true };
  } catch (e) {
    const name = e && typeof e === "object" && "name" in e ? String(/** @type {Error} */ (e).name) : "";
    if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
      return {
        ok: false,
        message: "Browser storage is full. Remove some screenshots or export data elsewhere.",
      };
    }
    return { ok: false, message: "Could not save playbook." };
  }
}
