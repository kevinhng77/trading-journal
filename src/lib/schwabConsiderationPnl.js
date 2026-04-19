/**
 * Schwab cash-grid **consideration** (TRD **BOT** / **SOLD** rows) for P/L.
 *
 * **Flat round-trip (net shares = 0):** For fills already filtered to one symbol with session
 * `date` on each TRD line, P/L is **Σ SOLD(q·p) − Σ BOT(q·p)** (same as VWAP algebra) **plus**
 * **Σ (misc + comm)** on those lines — i.e. cash from prices then fees.
 *
 * **Otherwise** (open tail, one-sided, or missing prices): sum per-line **AMOUNT** / consideration
 * via {@link schwabFillConsiderationDollars} (legacy path).
 *
 * Kept separate from `thinkorswimCsv.js` so metrics and storage can import it without circular deps.
 */

/** @param {unknown} s */
function stripCell(s) {
  let t = String(s ?? "").trim();
  if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1);
  return t.replace(/^="?/, "").replace(/"$/, "");
}

/** ($1,234.56) or -$1.2 or "1,234.56" or number */
export function parseSchwabMoneyCell(raw) {
  const s = stripCell(String(raw ?? "")).replace(/,/g, "").trim();
  if (!s) return 0;
  const negParen = /^\((.+)\)$/.exec(s);
  const body = negParen ? negParen[1] : s.replace(/^\$/, "");
  const n = Number.parseFloat(body.replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(n)) return 0;
  return negParen ? -Math.abs(n) : n;
}

/**
 * One fill row: market **AMOUNT** when that cell has a value, else
 * `netCash - misc - comm` (all from the same line). Handles stored keys `misc`/`miscFees`, `comm`/`commission`.
 * @param {object} f
 */
export function schwabFillConsiderationDollars(f) {
  if (f == null) return 0;
  const rawAmt = f.amount;
  const amtStr = rawAmt == null ? "" : String(rawAmt).trim();
  if (amtStr !== "") {
    const n = typeof rawAmt === "number" && Number.isFinite(rawAmt) ? rawAmt : parseSchwabMoneyCell(rawAmt);
    if (Number.isFinite(n)) return n;
  }
  const nc = parseSchwabMoneyCell(f.netCash);
  const misc = parseSchwabMoneyCell(f.misc ?? f.miscFees ?? 0);
  const comm = parseSchwabMoneyCell(f.comm ?? f.commission ?? 0);
  return nc - misc - comm;
}

/** Net share position: BOT adds quantity, SOLD subtracts. */
function netSharePositionFromTrdFills(fills) {
  let pos = 0;
  for (const f of fills ?? []) {
    if (f == null) continue;
    const q = Math.abs(Number(f.quantity));
    if (!Number.isFinite(q) || q <= 0) continue;
    const side = String(f.side ?? "").toUpperCase();
    if (side === "BOT") pos += q;
    else if (side === "SOLD") pos -= q;
  }
  return pos;
}

function sumSchwabFillConsiderationOnly(fills) {
  let s = 0;
  for (const f of fills ?? []) {
    s += schwabFillConsiderationDollars(f);
  }
  return Math.round(s * 100) / 100;
}

/**
 * @param {object[]} fills
 * @returns {number}
 */
export function sumSchwabLineConsiderationFromFills(fills) {
  if (!Array.isArray(fills) || fills.length === 0) return 0;

  const pos = netSharePositionFromTrdFills(fills);
  let botNotional = 0;
  let soldNotional = 0;
  let fees = 0;
  let hasBotPx = false;
  let hasSoldPx = false;

  for (const f of fills) {
    if (f == null) continue;
    const q = Math.abs(Number(f.quantity));
    const p = Number(f.price);
    const side = String(f.side ?? "").toUpperCase();
    if (Number.isFinite(q) && q > 0 && Number.isFinite(p)) {
      if (side === "BOT") {
        botNotional += q * p;
        hasBotPx = true;
      } else if (side === "SOLD") {
        soldNotional += q * p;
        hasSoldPx = true;
      }
    }
    fees += parseSchwabMoneyCell(f.misc ?? f.miscFees ?? 0) + parseSchwabMoneyCell(f.comm ?? f.commission ?? 0);
  }

  if (Math.abs(pos) <= 1e-6 && hasBotPx && hasSoldPx) {
    return Math.round((soldNotional - botNotional + fees) * 100) / 100;
  }

  return sumSchwabFillConsiderationOnly(fills);
}

/**
 * @param {object[]} fills
 * @returns {number}
 */
export function sumSchwabNetCashFromFills(fills) {
  let s = 0;
  for (const f of fills ?? []) {
    if (f == null) continue;
    const raw = f.netCash;
    const n = typeof raw === "number" && Number.isFinite(raw) ? raw : parseSchwabMoneyCell(raw);
    if (Number.isFinite(n)) s += n;
  }
  return Math.round(s * 100) / 100;
}
