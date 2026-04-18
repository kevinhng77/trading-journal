const STORAGE_KEY = "tradingJournalImportGrouping";

/** @typedef {"merge" | "split" | "normal"} ImportGroupingMode */

/** @type {ImportGroupingMode} */
export const IMPORT_GROUPING_DEFAULT = "merge";

/** How Thinkorswim TRD fills are combined into journal trades on CSV import. */
export const IMPORT_GROUPING_OPTIONS = [
  {
    id: "normal",
    title: "Normal",
    description:
      "Round-trip by net position per symbol across session dates: opens and closes merge into one trade dated on the flat day (e.g. multi-day swings). Still-open size stays on the last day with activity. Use this for Schwab / TOS CSV swings.",
  },
  {
    id: "merge",
    title: "Merge when possible",
    description:
      "All executions for the same symbol on the same session day are merged into a single trade (fewest rows).",
  },
  {
    id: "split",
    title: "Split when possible",
    description: "Each execution line from the CSV becomes its own trade (one fill per trade).",
  },
];

/** @returns {ImportGroupingMode} */
export function loadImportGroupingMode() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "merge" || v === "split" || v === "normal") return v;
  } catch {
    /* ignore */
  }
  return IMPORT_GROUPING_DEFAULT;
}

/** @param {string} mode */
export function saveImportGroupingMode(mode) {
  if (mode !== "merge" && mode !== "split" && mode !== "normal") return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
