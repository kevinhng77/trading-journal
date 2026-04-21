import { useState } from "react";
import {
  normalizeChartIndicatorPrefs,
  resetChartIndicatorPrefs,
} from "../storage/chartIndicatorPrefs";
import {
  addNamedIndicatorSet,
  loadNamedIndicatorSets,
  removeNamedIndicatorSet,
} from "../storage/chartIndicatorNamedSets";

/**
 * @param {object} props
 * @param {import("../storage/chartIndicatorPrefs").ChartIndicatorPrefs} props.prefs
 * @param {import("../lib/chartSkins").ChartSkinId} props.currentSkin
 * @param {(p: import("../storage/chartIndicatorPrefs").ChartIndicatorPrefs) => void} props.onChange indicator-only (e.g. reset)
 * @param {(o: { prefs: import("../storage/chartIndicatorPrefs").ChartIndicatorPrefs, skin?: import("../lib/chartSkins").ChartSkinId }) => void} [props.onApplyFullSetup] load saved setup (prefs + optional chart skin)
 */
export default function ChartPresetsDropdown({ prefs, currentSkin, onChange, onApplyFullSetup }) {
  const [open, setOpen] = useState(false);
  const [savedSets, setSavedSets] = useState(() => loadNamedIndicatorSets());

  function toggleOpen() {
    setOpen((was) => {
      const next = !was;
      if (next) setSavedSets(loadNamedIndicatorSets());
      return next;
    });
  }

  function onSaveCurrent() {
    const name = window.prompt("Name this chart setup (indicators + TOS/DAS look):", "");
    if (name === null) return;
    const trimmed = String(name).trim();
    if (!trimmed) {
      window.alert("Enter a name to save this setup.");
      return;
    }
    addNamedIndicatorSet(trimmed, prefs, currentSkin);
    setSavedSets(loadNamedIndicatorSets());
  }

  /**
   * @param {{ id: string, name: string, prefs: import("../storage/chartIndicatorPrefs").ChartIndicatorPrefs, skin?: import("../lib/chartSkins").ChartSkinId }} set
   */
  function onApplySet(set) {
    const normalized = normalizeChartIndicatorPrefs(set.prefs);
    if (typeof onApplyFullSetup === "function") {
      onApplyFullSetup({ prefs: normalized, skin: set.skin });
    } else {
      onChange(normalized);
    }
    setOpen(false);
  }

  /** @param {import("react").MouseEvent} e @param {string} id */
  function onRemoveSet(e, id) {
    e.preventDefault();
    e.stopPropagation();
    removeNamedIndicatorSet(id);
    setSavedSets(loadNamedIndicatorSets());
  }

  return (
    <div className={`chart-presets-dropdown ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="chart-tv-toolbar-btn chart-tv-toolbar-btn--presets chart-tv-toolbar-btn--icon-only"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Saved chart setups and reset"
        title="Saved setups — save or load indicators and chart look (TOS/DAS)"
        onClick={toggleOpen}
      >
        <span className="chart-presets-grid-icon" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>
      {open && (
        <>
          <button type="button" className="chart-presets-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="chart-presets-menu" role="menu">
            <div className="chart-presets-menu-actions">
              <button type="button" className="chart-presets-save-btn" role="menuitem" onClick={onSaveCurrent}>
                Save current setup…
              </button>
            </div>

            <div className="chart-presets-saved-head">Saved setups</div>
            {savedSets.length === 0 ? (
              <p className="chart-presets-menu-empty">No saved setups yet. Use Save setup on the toolbar or save here.</p>
            ) : (
              <ul className="chart-presets-set-list">
                {savedSets.map((set) => (
                  <li key={set.id} className="chart-presets-set-row">
                    <button
                      type="button"
                      className="chart-presets-set-load"
                      role="menuitem"
                      title={`Apply “${set.name}”`}
                      onClick={() => onApplySet(set)}
                    >
                      <span className="chart-presets-set-name">{set.name}</span>
                      {set.skin ? (
                        <span className="chart-presets-set-skin" title="Saved chart look">
                          {set.skin.toUpperCase()}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="chart-presets-set-remove"
                      aria-label={`Remove saved setup “${set.name}”`}
                      title="Remove"
                      onClick={(e) => onRemoveSet(e, set.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="chart-presets-menu-divider" role="separator" />

            <button
              type="button"
              className="chart-presets-menu-item"
              role="menuitem"
              onClick={() => {
                onChange(resetChartIndicatorPrefs());
                setOpen(false);
              }}
            >
              Reset to defaults
            </button>
          </div>
        </>
      )}
    </div>
  );
}
