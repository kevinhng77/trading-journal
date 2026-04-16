import { DEFAULT_REPORT_FILTERS, normalizeReportFilters } from "../lib/reportFilters";

const STORAGE_KEY = "tradingJournalAppliedReportFilters";

/** @returns {import("../lib/reportFilters").ReportFilters} */
export function loadPersistedReportFilters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_REPORT_FILTERS };
    return normalizeReportFilters(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_REPORT_FILTERS };
  }
}

/** @param {import("../lib/reportFilters").ReportFilters} filters */
export function savePersistedReportFilters(filters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeReportFilters(filters)));
  } catch {
    /* ignore */
  }
}

export function clearPersistedReportFilters() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
