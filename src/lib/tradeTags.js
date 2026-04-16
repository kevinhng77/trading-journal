import { loadTrades, saveTrades } from "../storage/storage";

/** @param {unknown} s */
export function normalizeTagString(s) {
  const t = String(s ?? "").trim();
  return t || null;
}

/** Dedupe case-insensitively; keep first spelling. @param {string[]} tags */
export function normalizeTagList(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of tags) {
    const t = normalizeTagString(raw);
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** @param {unknown} trade */
export function getTradeTags(trade) {
  return normalizeTagList(trade?.tags);
}

/** @param {object[]} trades */
export function collectAllTagsFromTrades(trades) {
  const seen = new Set();
  const out = [];
  for (const t of trades) {
    for (const tag of getTradeTags(t)) {
      const k = tag.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(tag);
    }
  }
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return out;
}

/**
 * Remove one tag (case-insensitive) from every trade and persist.
 * @param {string} tag
 * @returns {{ tradeCount: number }} number of trades that had the tag removed
 */
export function removeTagFromAllTrades(tag) {
  const needle = normalizeTagString(tag);
  if (!needle) return { tradeCount: 0 };
  const nk = needle.toLowerCase();
  const trades = loadTrades();
  let tradeCount = 0;
  const next = trades.map((trade) => {
    const tags = getTradeTags(trade);
    const filtered = tags.filter((x) => x.toLowerCase() !== nk);
    if (filtered.length === tags.length) return trade;
    tradeCount += 1;
    return { ...trade, tags: filtered };
  });
  if (tradeCount > 0) saveTrades(next);
  return { tradeCount };
}
