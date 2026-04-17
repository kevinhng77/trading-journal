/**
 * Label for a chart screenshot saved from a trade (e.g. "NXTT 02.03.26").
 * @param {string | undefined | null} symbol
 * @param {string | undefined | null} dateStr Trade date, usually YYYY-MM-DD
 * @returns {string}
 */
export function formatPlaybookTradeTag(symbol, dateStr) {
  const sym = String(symbol ?? "")
    .trim()
    .toUpperCase();
  const base = sym || "—";
  if (!dateStr) return base;
  const s = String(dateStr).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const yy = m[1].slice(-2);
    return `${base} ${m[2]}.${m[3]}.${yy}`;
  }
  return `${base} ${s}`.trim();
}
