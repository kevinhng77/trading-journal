import { isChartSkinId } from "../lib/chartSkins";

const STORAGE_KEY = "tradingJournalChartSkinId";
const GRID_KEY = "tradingJournalChartGridVisible";

/** @typedef {import("../lib/chartSkins").ChartSkinId} ChartSkinId */

/** @returns {ChartSkinId} */
export function loadChartSkinId() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && isChartSkinId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "tos";
}

/** @param {ChartSkinId} id */
export function saveChartSkinId(id) {
  if (!isChartSkinId(id)) return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

/** @returns {boolean} */
export function loadChartGridVisible() {
  try {
    const raw = localStorage.getItem(GRID_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

/** @param {boolean} visible */
export function saveChartGridVisible(visible) {
  try {
    localStorage.setItem(GRID_KEY, visible ? "1" : "0");
  } catch {
    /* ignore */
  }
}
