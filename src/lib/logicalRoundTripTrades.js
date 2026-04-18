import { attachAvgBuySellPricesFromFills, groupFillsIntoTrades } from "../import/thinkorswimCsv.js";
import { fillToGroupingFill } from "./tradeMerge.js";
import { stableTradeId } from "../storage/tradeLookup.js";
import { getTradeTags, getTradeSetups, normalizeTagList } from "./tradeTags.js";

function compareFillsChrono(a, b) {
  const c = String(a.date ?? "").localeCompare(String(b.date ?? ""));
  if (c !== 0) return c;
  return String(a.time ?? "").localeCompare(String(b.time ?? ""));
}

/**
 * Flatten stored trades into parser-style fills (deduped by fill id) for FIFO regrouping.
 * @param {object[]} trades
 */
export function collectGroupingFillsFromTrades(trades) {
  const byId = new Map();
  for (const t of trades) {
    if (!t) continue;
    const sym = String(t.symbol ?? "").trim().toUpperCase();
    if (!sym) continue;
    const session = String(t.date ?? "").trim();
    const fills = Array.isArray(t.fills) ? t.fills : [];
    for (const f of fills) {
      const sessionDate = String(f.date ?? session).trim() || session;
      const gf = fillToGroupingFill(f, sessionDate, sym);
      const id = String(gf.id ?? "").trim();
      if (id) {
        if (!byId.has(id)) byId.set(id, gf);
      } else {
        const k = `${sessionDate}|${sym}|${gf.time}|${gf.side}|${gf.quantity}`;
        if (!byId.has(k)) byId.set(k, { ...gf, id: `synth-${byId.size}` });
      }
    }
  }
  return [...byId.values()].sort(compareFillsChrono);
}

/**
 * Stored trades whose fills are a superset of this logical leg (same fills all came from those rows).
 * @param {object} logical
 * @param {object[]} storedList
 */
function contributorTradesForLogical(logical, storedList) {
  const lFillIds = new Set((logical.fills ?? []).map((f) => String(f.id ?? "")).filter(Boolean));
  if (lFillIds.size === 0) return [];
  return storedList.filter((t) => {
    const tIds = (t.fills ?? []).map((f) => String(f.id ?? "")).filter(Boolean);
    if (tIds.length === 0) return false;
    const tSet = new Set(tIds);
    return [...lFillIds].every((id) => tSet.has(id));
  });
}

function assignReportRowId(L, parts) {
  if (!parts.length) return L.id;
  if (parts.length > 1) {
    const closeIso = String(L.date ?? "");
    const canonical =
      parts.find((p) => String(p.date ?? "") === closeIso) ?? parts[parts.length - 1];
    return stableTradeId(canonical);
  }
  const p = parts[0];
  const pSet = new Set((p.fills ?? []).map((f) => String(f.id ?? "")).filter(Boolean));
  const lSet = new Set((L.fills ?? []).map((f) => String(f.id ?? "")).filter(Boolean));
  if (pSet.size === lSet.size && [...lSet].every((id) => pSet.has(id))) {
    return stableTradeId(p);
  }
  return L.id;
}

function pickEditorStableId(L, parts) {
  if (!parts.length) return null;
  if (parts.length > 1) {
    const closeIso = String(L.date ?? "");
    const canonical =
      parts.find((p) => String(p.date ?? "") === closeIso) ?? parts[parts.length - 1];
    return stableTradeId(canonical);
  }
  return stableTradeId(parts[0]);
}

/**
 * FIFO round trips only (no non-fill rows). Used internally and for resolving a stored trade
 * into its spanning round trip.
 * @param {object[]} trades
 */
export function fifoLogicalTradesFromStored(trades) {
  if (!Array.isArray(trades) || trades.length === 0) return [];
  const fills = collectGroupingFillsFromTrades(trades);
  if (!fills.length) return [];
  let logical = groupFillsIntoTrades(fills, "normal");
  for (const t of logical) {
    attachAvgBuySellPricesFromFills(t);
  }
  return logical.map((L) => {
    const parts = contributorTradesForLogical(L, trades);
    const tags = normalizeTagList(parts.flatMap((t0) => getTradeTags(t0)));
    const setups = normalizeTagList(parts.flatMap((t0) => getTradeSetups(t0)));
    const closeIso = String(L.date ?? "");
    const notesFromClose = parts.find(
      (p) => String(p.date ?? "") === closeIso && typeof p.notes === "string" && p.notes.trim(),
    );
    const notesFromAny = parts.find((p) => typeof p.notes === "string" && p.notes.trim());
    const notes = notesFromClose?.notes ?? notesFromAny?.notes;
    const rowId = assignReportRowId(L, parts);
    const editorId = pickEditorStableId(L, parts);
    return {
      ...L,
      id: rowId,
      _storageStableIds: parts.map((p) => stableTradeId(p)),
      _editorStableId: editorId,
      ...(tags.length ? { tags: [...tags] } : {}),
      ...(setups.length ? { setups: [...setups] } : {}),
      ...(notes ? { notes } : {}),
    };
  });
}

/** @deprecated Use {@link fifoLogicalTradesFromStored} or {@link prepareTradesForReportView}. */
export const logicalRoundTripTrades = fifoLogicalTradesFromStored;

/**
 * Trades as they should appear in calendar, journal, reports, and trade detail (FIFO across days).
 * Rows fully replaced by FIFO regrouping are omitted; other stored rows (e.g. no fills) are kept.
 * @param {object[]} rawTrades
 */
export function prepareTradesForReportView(rawTrades) {
  if (!Array.isArray(rawTrades) || rawTrades.length === 0) return rawTrades;
  const fills = collectGroupingFillsFromTrades(rawTrades);
  if (!fills.length) return rawTrades;
  const logical = fifoLogicalTradesFromStored(rawTrades);
  const consumed = new Set();
  for (const L of logical) {
    for (const id of L._storageStableIds ?? []) consumed.add(id);
  }
  const extras = rawTrades.filter((t) => !consumed.has(stableTradeId(t)));
  return [...logical, ...extras];
}

/**
 * If `storedTrade` is part of a larger FIFO round trip across stored rows, return the merged
 * logical trade for display (fills, P&amp;L, round trips). Otherwise null.
 * @param {object[]} allTrades stored rows from {@link loadTrades}
 * @param {object | null} storedTrade
 */
export function logicalTradeForStoredTrade(allTrades, storedTrade) {
  if (!storedTrade || !Array.isArray(allTrades)) return null;
  const logical = fifoLogicalTradesFromStored(allTrades);
  const sids = new Set((storedTrade.fills ?? []).map((f) => String(f.id ?? "")).filter(Boolean));
  if (sids.size === 0) return null;
  for (const L of logical) {
    const lids = new Set((L.fills ?? []).map((f) => String(f.id ?? "")).filter(Boolean));
    const covers = [...sids].every((id) => lids.has(id));
    if (covers && lids.size > sids.size) return L;
  }
  return null;
}
