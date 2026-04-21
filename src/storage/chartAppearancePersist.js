import { isChartSkinId } from "../lib/chartSkins";

const STORAGE_KEY = "tradingJournalChartSkinId";

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
