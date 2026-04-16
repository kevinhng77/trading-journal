/** @param {number} h 0–360 @param {number} s 0–100 @param {number} l 0–100 */
export function hslToHex(h, s, l) {
  const L = l / 100;
  const a = (s / 100) * Math.min(L, 1 - L);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const v = L - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * v);
  };
  const x = (n) => n.toString(16).padStart(2, "0");
  return `#${x(f(0))}${x(f(8))}${x(f(4))}`;
}

/**
 * Thinkorswim-like grid: one grayscale row + saturated rows (10×6).
 * @returns {string[]}
 */
export function buildChartSwatchPalette() {
  const out = [];
  for (let i = 0; i < 10; i += 1) {
    const L = Math.round(100 - (i * 100) / 9);
    out.push(hslToHex(0, 0, L));
  }
  const lightRows = [78, 68, 58, 48, 36, 24];
  for (const l of lightRows) {
    for (let c = 0; c < 10; c += 1) {
      const hue = Math.round((c * 360) / 10);
      out.push(hslToHex(hue, 82, l));
    }
  }
  return out;
}

export const RECENT_CHART_COLORS_KEY = "tradingJournalRecentChartColors";

/** @returns {string[]} */
export function loadRecentChartColors() {
  try {
    const raw = localStorage.getItem(RECENT_CHART_COLORS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => typeof x === "string" && /^#[0-9a-fA-F]{6}$/.test(x)).map((x) => x.toLowerCase());
  } catch {
    return [];
  }
}

/** @param {string} hex #rrggbb */
export function pushRecentChartColor(hex) {
  const h = String(hex || "").trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(h)) return;
  const prev = loadRecentChartColors().filter((x) => x !== h);
  const next = [h, ...prev].slice(0, 8);
  try {
    localStorage.setItem(RECENT_CHART_COLORS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
