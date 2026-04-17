const STORAGE_KEY = "tradingJournalUiTheme";

/** @typedef {"default" | "light" | "ocean" | "ember" | "violet"} UiThemeId */

/** @type {{ id: UiThemeId; label: string }[]} */
export const UI_THEME_OPTIONS = [
  { id: "default", label: "Default (dark)" },
  { id: "light", label: "Light" },
  { id: "ocean", label: "Ocean" },
  { id: "ember", label: "Ember" },
  { id: "violet", label: "Violet" },
];

const VALID = new Set(UI_THEME_OPTIONS.map((o) => o.id));

/** @param {unknown} v */
export function normalizeUiThemeId(v) {
  if (v == null || v === "") return "default";
  const s = String(v).trim().toLowerCase();
  return VALID.has(s) ? /** @type {UiThemeId} */ (s) : "default";
}

/** @returns {UiThemeId} */
export function loadUiTheme() {
  try {
    return normalizeUiThemeId(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "default";
  }
}

/** @param {UiThemeId | string} themeId */
export function saveUiTheme(themeId) {
  const id = normalizeUiThemeId(themeId);
  try {
    if (id === "default") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

/** @param {UiThemeId | string} themeId */
export function applyUiThemeToDocument(themeId) {
  const id = normalizeUiThemeId(themeId);
  const root = document.documentElement;
  if (id === "default") root.removeAttribute("data-ui-theme");
  else root.setAttribute("data-ui-theme", id);
}

export function applyStoredUiTheme() {
  applyUiThemeToDocument(loadUiTheme());
}
