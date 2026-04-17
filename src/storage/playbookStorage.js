export const PLAYBOOK_STORAGE_KEY = "tradingJournalPlaybook";

/** Missed setups (same shape as plays, separate list). */
export const PLAYBOOK_MISSED_STORAGE_KEY = "tradingJournalPlaybookMissed";

export const PLAYBOOK_CHANGED_EVENT = "tradingJournalPlaybookChanged";

/** Max screenshots stored on a single play (chart sends + manual uploads share this cap). */
export const PLAYBOOK_MAX_SCREENSHOTS_PER_PLAY = 14;

const STORAGE_KEY = PLAYBOOK_STORAGE_KEY;
const MISSED_STORAGE_KEY = PLAYBOOK_MISSED_STORAGE_KEY;

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

/** @returns {PlaybookPlay} */
export function createEmptyMissedPlay() {
  return {
    id: newId(),
    name: "Untitled missed",
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

/** @returns {PlaybookPlay[]} */
export function loadMissedPlays() {
  try {
    const raw = localStorage.getItem(MISSED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizePlay).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Append one screenshot (data URL) to a play by id. Respects {@link PLAYBOOK_MAX_SCREENSHOTS_PER_PLAY}.
 * @param {string} playId
 * @param {string} dataUrl
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function appendScreenshotToPlay(playId, dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return { ok: false, message: "Invalid image data." };
  }
  const plays = loadPlaybook();
  const play = plays.find((p) => p.id === playId);
  if (!play) return { ok: false, message: "That playbook play was not found." };
  if (play.screenshots.length >= PLAYBOOK_MAX_SCREENSHOTS_PER_PLAY) {
    return {
      ok: false,
      message: `That play already has the maximum of ${PLAYBOOK_MAX_SCREENSHOTS_PER_PLAY} screenshots. Remove one on the Playbook page first.`,
    };
  }
  const shotId =
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `shot-${Date.now()}`;
  const nextPlays = plays.map((p) =>
    p.id === playId ? { ...p, screenshots: [...p.screenshots, { id: shotId, dataUrl }] } : p,
  );
  return savePlaybook(nextPlays);
}

/**
 * @param {PlaybookPlay[]} missed
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function saveMissedPlays(missed) {
  try {
    const payload = JSON.stringify(missed);
    localStorage.setItem(MISSED_STORAGE_KEY, payload);
    window.dispatchEvent(new CustomEvent(PLAYBOOK_CHANGED_EVENT));
    return { ok: true };
  } catch (e) {
    const name = e && typeof e === "object" && "name" in e ? String(/** @type {Error} */ (e).name) : "";
    if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
      return {
        ok: false,
        message: "Browser storage is full. Remove some screenshots or export data elsewhere.",
      };
    }
    return { ok: false, message: "Could not save missed plays." };
  }
}

/**
 * Append a screenshot to a missed play by id.
 * @param {string} playId
 * @param {string} dataUrl
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function appendScreenshotToMissedPlay(playId, dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return { ok: false, message: "Invalid image data." };
  }
  const missed = loadMissedPlays();
  const play = missed.find((p) => p.id === playId);
  if (!play) return { ok: false, message: "That missed play was not found." };
  if (play.screenshots.length >= PLAYBOOK_MAX_SCREENSHOTS_PER_PLAY) {
    return {
      ok: false,
      message: `That missed play already has the maximum of ${PLAYBOOK_MAX_SCREENSHOTS_PER_PLAY} screenshots. Remove one on the Playbook page first.`,
    };
  }
  const shotId =
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `shot-${Date.now()}`;
  const nextMissed = missed.map((p) =>
    p.id === playId ? { ...p, screenshots: [...p.screenshots, { id: shotId, dataUrl }] } : p,
  );
  return saveMissedPlays(nextMissed);
}

export function savePlaybook(plays) {
  try {
    const payload = JSON.stringify(plays);
    localStorage.setItem(STORAGE_KEY, payload);
    window.dispatchEvent(new CustomEvent(PLAYBOOK_CHANGED_EVENT));
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
