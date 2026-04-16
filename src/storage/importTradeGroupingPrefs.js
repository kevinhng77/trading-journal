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
      "Group fills into trades by net position: a new trade starts when you are flat, and closes when shares return to flat. Open size at end of day stays in one trade.",
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
