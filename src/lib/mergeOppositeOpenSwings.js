import { compareFillsBySessionThenTime } from "./fillRoundTrips.js";
import { tradeNetSharePosition } from "./tradeRowUi.js";
import { inferOpeningSide } from "./tradeSide.js";
import { sumSchwabLineConsiderationFromFills } from "./schwabConsiderationPnl.js";
import { sortedTradesForNav, stableTradeId } from "../storage/tradeLookup.js";
import { getTradeTags, getTradeSetups, normalizeTagList } from "./tradeTags.js";

/** Same gate as storage normalization: BOT/SOLD cash rows we can merge safely. */
function isSchwabStyleCashFills(trade) {
  if (trade?.source === "thinkorswim" || trade?.source === "das") return true;
  const fills = trade?.fills;
  if (!Array.isArray(fills) || fills.length === 0) return false;
  return fills.some((f) => /^(BOT|SOLD)\s/i.test(String(f?.description ?? "")));
}

function tradeEarliestSessionKey(t) {
  const fills = t?.fills;
  if (!Array.isArray(fills) || fills.length === 0) {
    return `${String(t?.date ?? "")}T${String(t?.time ?? "")}`;
  }
  const sorted = [...fills].sort(compareFillsBySessionThenTime);
  const f = sorted[0];
  return `${String(f?.date ?? t?.date ?? "")}T${String(f?.time ?? "")}`;
}

function openingSideFromTrade(t) {
  const inferred = inferOpeningSide(t);
  if (inferred) return inferred;
  const n = tradeNetSharePosition(t);
  if (n > 1e-6) return "long";
  if (n < -1e-6) return "short";
  return null;
}

function shouldMergeOppositeAdjacentOpens(a, b) {
  if (!isSchwabStyleCashFills(a) || !isSchwabStyleCashFills(b)) return false;
  const na = tradeNetSharePosition(a);
  const nb = tradeNetSharePosition(b);
  if (Math.abs(na) < 1e-6 || Math.abs(nb) < 1e-6) return false;
  if (Math.abs(na + nb) >= 1e-3) return false;
  const sa = openingSideFromTrade(a);
  const sb = openingSideFromTrade(b);
  if (!sa || !sb || sa === sb) return false;
  return true;
}

/**
 * @param {object} earlier
 * @param {object} later  Row whose calendar date becomes the stored trade date.
 */
function mergeOppositeOpenPair(earlier, later) {
  const fills = [...(earlier.fills || []), ...(later.fills || [])].sort(compareFillsBySessionThenTime);
  const volume = (Number(earlier.volume) || 0) + (Number(later.volume) || 0);
  const pnl = sumSchwabLineConsiderationFromFills(fills);
  const tags = normalizeTagList([...getTradeTags(earlier), ...getTradeTags(later)]);
  const setups = normalizeTagList([...getTradeSetups(earlier), ...getTradeSetups(later)]);
  return {
    ...later,
    id: later.id ?? stableTradeId(later),
    date: later.date,
    time: later.time,
    fills,
    volume,
    executions: fills.length,
    pnl,
    ...(tags.length ? { tags } : {}),
    ...(setups.length ? { setups } : {}),
  };
}

/**
 * When two **stored** rows are both non-flat for the same symbol and the later row is the
 * opposite side with net shares summing to ~0, treat that as one closed multiday swing:
 * drop the earlier row and keep one combined row dated on the closing import/session.
 *
 * Adjacency is computed on **open-position rows only** (flat rows sit between without blocking).
 *
 * @param {unknown[]} trades
 * @returns {{ next: unknown[], changed: boolean }}
 */
export function collapseOppositeOpenSwingPairs(trades) {
  if (!Array.isArray(trades) || trades.length < 2) return { next: trades, changed: false };

  let cur = [...trades];
  let anyChanged = false;

  for (;;) {
    const bySym = new Map();
    for (let idx = 0; idx < cur.length; idx++) {
      const t = cur[idx];
      const sym = String(t?.symbol ?? "")
        .toUpperCase()
        .trim();
      if (!sym) continue;
      if (!bySym.has(sym)) bySym.set(sym, []);
      bySym.get(sym).push({ t, idx });
    }

    let mergedThisPass = false;

    for (const [, items] of bySym) {
      const opens = items.filter(({ t }) => Math.abs(tradeNetSharePosition(t)) > 1e-6);
      if (opens.length < 2) continue;

      opens.sort((a, b) => tradeEarliestSessionKey(a.t).localeCompare(tradeEarliestSessionKey(b.t)));

      for (let i = 0; i < opens.length - 1; i++) {
        const a = opens[i].t;
        const b = opens[i + 1].t;
        if (!shouldMergeOppositeAdjacentOpens(a, b)) continue;

        const idA = stableTradeId(a);
        const idB = stableTradeId(b);
        const keyA = tradeEarliestSessionKey(a);
        const keyB = tradeEarliestSessionKey(b);
        const earlier = keyA.localeCompare(keyB) <= 0 ? a : b;
        const later = keyA.localeCompare(keyB) <= 0 ? b : a;

        const merged = mergeOppositeOpenPair(earlier, later);
        const without = cur.filter((row) => stableTradeId(row) !== idA && stableTradeId(row) !== idB);
        cur = sortedTradesForNav([...without, merged]);
        anyChanged = true;
        mergedThisPass = true;
        break;
      }
      if (mergedThisPass) break;
    }

    if (!mergedThisPass) break;
  }

  return { next: cur, changed: anyChanged };
}
