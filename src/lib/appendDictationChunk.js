/**
 * Append a speech phrase to existing note text with a space when needed.
 * @param {string} base
 * @param {string} chunk
 */
export function appendSpacedChunk(base, chunk) {
  const t = String(chunk ?? "").trim();
  if (!t) return String(base ?? "");
  const cur = String(base ?? "");
  const sep = cur.length && !/\s$/.test(cur) ? " " : "";
  return `${cur}${sep}${t}`;
}
