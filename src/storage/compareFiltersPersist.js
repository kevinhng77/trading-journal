import { DEFAULT_REPORT_FILTERS, normalizeReportFilters } from "../lib/reportFilters";

const STORAGE_KEY = "tradingJournalCompareGroupFilters";

/** @returns {{ a: import("../lib/reportFilters").ReportFilters, b: import("../lib/reportFilters").ReportFilters }} */
export function loadCompareGroupFilters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { a: { ...DEFAULT_REPORT_FILTERS }, b: { ...DEFAULT_REPORT_FILTERS } };
    }
    const o = JSON.parse(raw);
    return {
      a: normalizeReportFilters(o?.a),
      b: normalizeReportFilters(o?.b),
    };
  } catch {
    return { a: { ...DEFAULT_REPORT_FILTERS }, b: { ...DEFAULT_REPORT_FILTERS } };
  }
}

/**
 * @param {import("../lib/reportFilters").ReportFilters} a
 * @param {import("../lib/reportFilters").ReportFilters} b
 */
export function saveCompareGroupFilters(a, b) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        a: normalizeReportFilters(a),
        b: normalizeReportFilters(b),
      }),
    );
  } catch {
    /* ignore */
  }
}
