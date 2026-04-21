import { normalizeChartIndicatorPrefs } from "./chartIndicatorPrefs";
import { isChartSkinId } from "../lib/chartSkins";

const STORAGE_KEY = "tradingJournalChartIndicatorNamedSets";
const MAX_SETS = 40;

/**
 * @typedef {import("./chartIndicatorPrefs").ChartIndicatorPrefs} ChartIndicatorPrefs
 * @typedef {import("../lib/chartSkins").ChartSkinId} ChartSkinId
 * @typedef {{ id: string, name: string, prefs: ChartIndicatorPrefs, skin?: ChartSkinId, gridVisible?: boolean }} NamedIndicatorSet
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
      const skinRaw = r.skin;
      const skin = isChartSkinId(skinRaw) ? skinRaw : undefined;
      /** @type {NamedIndicatorSet} */
      const named = { id, name, prefs, skin };
      if (typeof r.gridVisible === "boolean") named.gridVisible = r.gridVisible;
      out.push(named);
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
 * @param {ChartSkinId} [skin] chart colors (TOS vs DAS) stored with this setup
 * @param {boolean} [gridVisible] price/time grid on/off stored with this setup
 * @returns {NamedIndicatorSet[]}
 */
export function addNamedIndicatorSet(name, prefs, skin, gridVisible) {
  const trimmed = String(name ?? "").trim().slice(0, 80) || "Untitled";
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `set-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  /** @type {NamedIndicatorSet} */
  const row = { id, name: trimmed, prefs: structuredClone(prefs) };
  if (isChartSkinId(skin)) row.skin = skin;
  if (typeof gridVisible === "boolean") row.gridVisible = gridVisible;
  const next = [...loadNamedIndicatorSets(), row];
  persist(next);
  return next;
}

/** @param {string} id */
export function removeNamedIndicatorSet(id) {
  persist(loadNamedIndicatorSets().filter((s) => s.id !== id));
}
