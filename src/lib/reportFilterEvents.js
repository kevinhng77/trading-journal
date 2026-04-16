/** Same-tab sync: sidebar date picker → Reports / Journal filter draft */
export const REPORT_FILTERS_DATES_EVENT = "report-filters-dates";

/**
 * @param {{ dateFrom: string, dateTo: string }} range
 */
export function dispatchReportFilterDates(range) {
  window.dispatchEvent(new CustomEvent(REPORT_FILTERS_DATES_EVENT, { detail: range }));
}
