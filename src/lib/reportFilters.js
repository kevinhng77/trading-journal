import { getTradeTags, getTradeSetups } from "./tradeTags";
import { inferOpeningSide } from "./tradeSide";
import { tradeMatchesDurationBucket } from "./tradeDuration";

export const DEFAULT_REPORT_FILTERS = {
  symbol: "",
  selectedTags: [],
  tagsMatchAll: false,
  selectedSetups: [],
  setupsMatchAll: false,
  side: "all",
  duration: "all",
  dateFrom: "",
  dateTo: "",
};

/** @typedef {typeof DEFAULT_REPORT_FILTERS} ReportFilters */

const DURATION_VALUES = new Set([
  "all",
  "lt1m",
  "1to5m",
  "5to30m",
  "30to120m",
  "gte120m",
  "intraday",
  "multiday",
]);

/**
 * @param {unknown} raw
 * @returns {ReportFilters}
 */
export function normalizeReportFilters(raw) {
  const base = { ...DEFAULT_REPORT_FILTERS };
  if (!raw || typeof raw !== "object") return base;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (typeof o.symbol === "string") base.symbol = o.symbol;
  if (Array.isArray(o.selectedTags)) {
    base.selectedTags = o.selectedTags.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof o.tagsMatchAll === "boolean") base.tagsMatchAll = o.tagsMatchAll;
  if (Array.isArray(o.selectedSetups)) {
    base.selectedSetups = o.selectedSetups.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof o.setupsMatchAll === "boolean") base.setupsMatchAll = o.setupsMatchAll;
  if (o.side === "long" || o.side === "short" || o.side === "all") base.side = o.side;
  const dur = String(o.duration ?? "all");
  base.duration = DURATION_VALUES.has(dur) ? dur : "all";
  if (typeof o.dateFrom === "string") base.dateFrom = o.dateFrom;
  if (typeof o.dateTo === "string") base.dateTo = o.dateTo;
  return base;
}

/**
 * @param {object[]} trades
 * @param {ReportFilters} filters
 */
export function filterTradesForReport(trades, filters) {
  const f = filters ?? DEFAULT_REPORT_FILTERS;
  let out = [...trades];

  const sym = String(f.symbol ?? "").trim().toUpperCase();
  if (sym) {
    out = out.filter((t) => String(t.symbol ?? "").toUpperCase().includes(sym));
  }

  const selected = Array.isArray(f.selectedTags) ? f.selectedTags.map((x) => String(x).trim()).filter(Boolean) : [];
  if (selected.length > 0) {
    const selectedLower = selected.map((s) => s.toLowerCase());
    out = out.filter((t) => {
      const tagSet = new Set(getTradeTags(t).map((x) => x.toLowerCase()));
      if (f.tagsMatchAll) {
        return selectedLower.every((s) => tagSet.has(s));
      }
      return selectedLower.some((s) => tagSet.has(s));
    });
  }

  const selectedSetups = Array.isArray(f.selectedSetups)
    ? f.selectedSetups.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (selectedSetups.length > 0) {
    const selectedLower = selectedSetups.map((s) => s.toLowerCase());
    out = out.filter((t) => {
      const setupSet = new Set(getTradeSetups(t).map((x) => x.toLowerCase()));
      if (f.setupsMatchAll) {
        return selectedLower.every((s) => setupSet.has(s));
      }
      return selectedLower.some((s) => setupSet.has(s));
    });
  }

  if (f.side === "long" || f.side === "short") {
    out = out.filter((t) => inferOpeningSide(t) === f.side);
  }

  const dur = String(f.duration ?? "all");
  if (dur && dur !== "all") {
    out = out.filter((t) => tradeMatchesDurationBucket(t, dur));
  }

  const from = String(f.dateFrom ?? "").trim();
  const to = String(f.dateTo ?? "").trim();
  if (from) out = out.filter((t) => String(t.date ?? "") >= from);
  if (to) out = out.filter((t) => String(t.date ?? "") <= to);

  return out;
}

export function reportFiltersActive(f) {
  if (!f) return false;
  if (String(f.symbol ?? "").trim()) return true;
  if (Array.isArray(f.selectedTags) && f.selectedTags.length > 0) return true;
  if (Array.isArray(f.selectedSetups) && f.selectedSetups.length > 0) return true;
  if (f.side === "long" || f.side === "short") return true;
  if (String(f.duration ?? "all") !== "all") return true;
  if (String(f.dateFrom ?? "").trim() || String(f.dateTo ?? "").trim()) return true;
  return false;
}
