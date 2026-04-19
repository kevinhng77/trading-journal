import { DEFAULT_REPORT_FILTERS, normalizeReportFilters } from "../lib/reportFilters";

export const REPORT_FILTERS_STORAGE_KEY = "tradingJournalAppliedReportFilters";

/** Fired after {@link savePersistedReportFilters} or {@link clearPersistedReportFilters} (same tab). */
export const REPORT_FILTERS_PERSIST_EVENT = "tj-report-filters-persisted";

function notifyReportFiltersPersisted() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(REPORT_FILTERS_PERSIST_EVENT));
}

/** @returns {import("../lib/reportFilters").ReportFilters} */
export function loadPersistedReportFilters() {
  try {
    const raw = localStorage.getItem(REPORT_FILTERS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_REPORT_FILTERS };
    return normalizeReportFilters(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_REPORT_FILTERS };
  }
}

/** @param {import("../lib/reportFilters").ReportFilters} filters */
export function savePersistedReportFilters(filters) {
  try {
    localStorage.setItem(REPORT_FILTERS_STORAGE_KEY, JSON.stringify(normalizeReportFilters(filters)));
  } catch {
    /* ignore */
  }
  notifyReportFiltersPersisted();
}

export function clearPersistedReportFilters() {
  try {
    localStorage.removeItem(REPORT_FILTERS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  notifyReportFiltersPersisted();
}
