import { getTradeTags, getTradeSetups } from "./tradeTags";
import { inferOpeningSide } from "./tradeSide";
import { tradeMatchesDurationBucket } from "./tradeDuration";
import { tradeGrossPnl, tradeNetPnl } from "./tradeExecutionMetrics";

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
  /** Advanced (popover next to date). Empty string = no bound. */
  advDayOfWeek: "all",
  advMonth: "all",
  advTimeFrom: "",
  advTimeTo: "",
  advHoldMin: "",
  advHoldMax: "",
  advNetPnlMin: "",
  advNetPnlMax: "",
  advGrossPnlMin: "",
  advGrossPnlMax: "",
  advVolumeMin: "",
  advVolumeMax: "",
  advExecutionsMin: "",
  advExecutionsMax: "",
  /** all | win | loss | be */
  advTradeResult: "all",
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

const ADV_DAY = new Set(["all", "0", "1", "2", "3", "4", "5", "6"]);
const ADV_MONTH = new Set(["all", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
const ADV_RESULT = new Set(["all", "win", "loss", "be"]);

function advStr(v) {
  return typeof v === "string" ? v : "";
}

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

  const dow = String(o.advDayOfWeek ?? "all");
  base.advDayOfWeek = ADV_DAY.has(dow) ? dow : "all";
  const mo = String(o.advMonth ?? "all");
  base.advMonth = ADV_MONTH.has(mo) ? mo : "all";
  base.advTimeFrom = advStr(o.advTimeFrom);
  base.advTimeTo = advStr(o.advTimeTo);
  base.advHoldMin = advStr(o.advHoldMin);
  base.advHoldMax = advStr(o.advHoldMax);
  base.advNetPnlMin = advStr(o.advNetPnlMin);
  base.advNetPnlMax = advStr(o.advNetPnlMax);
  base.advGrossPnlMin = advStr(o.advGrossPnlMin);
  base.advGrossPnlMax = advStr(o.advGrossPnlMax);
  base.advVolumeMin = advStr(o.advVolumeMin);
  base.advVolumeMax = advStr(o.advVolumeMax);
  base.advExecutionsMin = advStr(o.advExecutionsMin);
  base.advExecutionsMax = advStr(o.advExecutionsMax);
  const tr = String(o.advTradeResult ?? "all");
  base.advTradeResult = ADV_RESULT.has(tr) ? tr : "all";

  return base;
}

/** @param {string} s */
function parseHmToMinutes(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = m[3] != null ? Number(m[3]) : 0;
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm + (Number.isFinite(ss) ? ss / 60 : 0);
}

/** @param {object} trade */
function tradeEntryClockMinutes(trade) {
  const raw = String(trade?.time ?? "12:00:00").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = m[3] != null ? Number(m[3]) : 0;
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm + (Number.isFinite(ss) ? ss / 60 : 0);
}

/** @param {string} s */
function parseOptionalNumber(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
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

  const dow = String(f.advDayOfWeek ?? "all");
  if (dow !== "all") {
    const want = Number(dow);
    out = out.filter((t) => {
      const ds = String(t.date ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return false;
      const d = new Date(`${ds}T12:00:00`);
      return d.getDay() === want;
    });
  }

  const mo = String(f.advMonth ?? "all");
  if (mo !== "all") {
    const want = Number(mo);
    out = out.filter((t) => {
      const ds = String(t.date ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return false;
      const d = new Date(`${ds}T12:00:00`);
      return d.getMonth() + 1 === want;
    });
  }

  const tf = parseHmToMinutes(f.advTimeFrom);
  const tt = parseHmToMinutes(f.advTimeTo);
  if (tf != null) {
    out = out.filter((t) => {
      const m = tradeEntryClockMinutes(t);
      return m != null && m + 1e-6 >= tf;
    });
  }
  if (tt != null) {
    out = out.filter((t) => {
      const m = tradeEntryClockMinutes(t);
      return m != null && m - 1e-6 <= tt;
    });
  }

  const hMin = parseOptionalNumber(f.advHoldMin);
  const hMax = parseOptionalNumber(f.advHoldMax);
  if (hMin != null || hMax != null) {
    out = out.filter((t) => {
      const h = Number(t.holdMinutes);
      if (!Number.isFinite(h)) return false;
      if (hMin != null && h + 1e-9 < hMin) return false;
      if (hMax != null && h - 1e-9 > hMax) return false;
      return true;
    });
  }

  const nMin = parseOptionalNumber(f.advNetPnlMin);
  const nMax = parseOptionalNumber(f.advNetPnlMax);
  if (nMin != null || nMax != null) {
    out = out.filter((t) => {
      const n = tradeNetPnl(t);
      if (nMin != null && n + 1e-9 < nMin) return false;
      if (nMax != null && n - 1e-9 > nMax) return false;
      return true;
    });
  }

  const gMin = parseOptionalNumber(f.advGrossPnlMin);
  const gMax = parseOptionalNumber(f.advGrossPnlMax);
  if (gMin != null || gMax != null) {
    out = out.filter((t) => {
      const n = tradeGrossPnl(t);
      if (gMin != null && n + 1e-9 < gMin) return false;
      if (gMax != null && n - 1e-9 > gMax) return false;
      return true;
    });
  }

  const vMin = parseOptionalNumber(f.advVolumeMin);
  const vMax = parseOptionalNumber(f.advVolumeMax);
  if (vMin != null || vMax != null) {
    out = out.filter((t) => {
      const n = Number(t.volume);
      if (!Number.isFinite(n)) return false;
      if (vMin != null && n + 1e-9 < vMin) return false;
      if (vMax != null && n - 1e-9 > vMax) return false;
      return true;
    });
  }

  const eMin = parseOptionalNumber(f.advExecutionsMin);
  const eMax = parseOptionalNumber(f.advExecutionsMax);
  if (eMin != null || eMax != null) {
    out = out.filter((t) => {
      const n = Number(t.executions);
      if (!Number.isFinite(n)) return false;
      if (eMin != null && n + 1e-9 < eMin) return false;
      if (eMax != null && n - 1e-9 > eMax) return false;
      return true;
    });
  }

  const tr = String(f.advTradeResult ?? "all");
  if (tr === "win") {
    out = out.filter((t) => tradeNetPnl(t) > 0);
  } else if (tr === "loss") {
    out = out.filter((t) => tradeNetPnl(t) < 0);
  } else if (tr === "be") {
    out = out.filter((t) => tradeNetPnl(t) === 0);
  }

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
  if (String(f.advDayOfWeek ?? "all") !== "all") return true;
  if (String(f.advMonth ?? "all") !== "all") return true;
  if (String(f.advTimeFrom ?? "").trim() || String(f.advTimeTo ?? "").trim()) return true;
  if (String(f.advHoldMin ?? "").trim() || String(f.advHoldMax ?? "").trim()) return true;
  if (String(f.advNetPnlMin ?? "").trim() || String(f.advNetPnlMax ?? "").trim()) return true;
  if (String(f.advGrossPnlMin ?? "").trim() || String(f.advGrossPnlMax ?? "").trim()) return true;
  if (String(f.advVolumeMin ?? "").trim() || String(f.advVolumeMax ?? "").trim()) return true;
  if (String(f.advExecutionsMin ?? "").trim() || String(f.advExecutionsMax ?? "").trim()) return true;
  if (String(f.advTradeResult ?? "all") !== "all") return true;
  return false;
}
