import { loadTrades, saveTrades } from "../storage/storage";

/** @param {unknown} s */
export function normalizeTagString(s) {
  const t = String(s ?? "").trim();
  return t || null;
}

/** Dedupe case-insensitively; keep first spelling. Accepts array or comma/semicolon-separated string. */
export function normalizeTagList(tags) {
  if (tags == null) return [];
  const rawList = Array.isArray(tags)
    ? tags
    : typeof tags === "string"
      ? tags
          .split(/[,;]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  const seen = new Set();
  const out = [];
  for (const raw of rawList) {
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

/** @param {unknown} trade */
export function getTradeSetups(trade) {
  return normalizeTagList(trade?.setups);
}

/** @param {object[]} trades */
export function collectAllSetupsFromTrades(trades) {
  const seen = new Set();
  const out = [];
  for (const t of trades) {
    for (const s of getTradeSetups(t)) {
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
  }
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return out;
}

/**
 * Setup filter options: values used on trades plus extra labels (e.g. playbook play names), deduped case-insensitively.
 * @param {object[]} trades
 * @param {string[]} [extraLabels]
 */
export function buildSetupFilterSuggestions(trades, extraLabels = []) {
  const fromTrades = collectAllSetupsFromTrades(trades);
  const seen = new Set();
  const out = [];
  for (const raw of [...fromTrades, ...(Array.isArray(extraLabels) ? extraLabels : [])]) {
    const t = String(raw ?? "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return out;
}

/**
 * Remove one setup (case-insensitive) from every trade and persist.
 * @param {string} setup
 * @returns {{ tradeCount: number }}
 */
export function removeSetupFromAllTrades(setup) {
  const needle = normalizeTagString(setup);
  if (!needle) return { tradeCount: 0 };
  const nk = needle.toLowerCase();
  const trades = loadTrades();
  let tradeCount = 0;
  const next = trades.map((trade) => {
    const setups = getTradeSetups(trade);
    const filtered = setups.filter((x) => x.toLowerCase() !== nk);
    if (filtered.length === setups.length) return trade;
    tradeCount += 1;
    return { ...trade, setups: filtered };
  });
  if (tradeCount > 0) saveTrades(next);
  return { tradeCount };
}
