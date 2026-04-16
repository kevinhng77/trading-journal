import { normalizeChartIndicatorPrefs } from "./chartIndicatorPrefs";

const STORAGE_KEY = "tradingJournalChartIndicatorNamedSets";
const MAX_SETS = 40;

/**
 * @typedef {import("./chartIndicatorPrefs").ChartIndicatorPrefs} ChartIndicatorPrefs
 * @typedef {{ id: string, name: string, prefs: ChartIndicatorPrefs }} NamedIndicatorSet
 */

function safeParse(raw) {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** @returns {NamedIndicatorSet[]} */
export function loadNamedIndicatorSets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    /** @type {NamedIndicatorSet[]} */
    const out = [];
    const rows = safeParse(raw);
    rows.forEach((row, i) => {
      if (!row || typeof row !== "object") return;
      const r = /** @type {Record<string, unknown>} */ (row);
      const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : `set-${i}`;
      const name = typeof r.name === "string" ? r.name.trim().slice(0, 80) : "Untitled";
      const prefs = normalizeChartIndicatorPrefs(r.prefs);
      out.push({ id, name, prefs });
    });
    return out;
  } catch {
    return [];
  }
}

/** @param {NamedIndicatorSet[]} sets */
function persist(sets) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sets.slice(0, MAX_SETS)));
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} name
 * @param {ChartIndicatorPrefs} prefs
 * @returns {NamedIndicatorSet[]}
 */
export function addNamedIndicatorSet(name, prefs) {
  const trimmed = String(name ?? "").trim().slice(0, 80) || "Untitled";
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `set-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const next = [...loadNamedIndicatorSets(), { id, name: trimmed, prefs: structuredClone(prefs) }];
  persist(next);
  return next;
}

/** @param {string} id */
export function removeNamedIndicatorSet(id) {
  persist(loadNamedIndicatorSets().filter((s) => s.id !== id));
}
