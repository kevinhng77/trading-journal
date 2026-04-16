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
 * @param {(p: import("../storage/chartIndicatorPrefs").ChartIndicatorPrefs) => void} props.onChange
 */
export default function ChartPresetsDropdown({ prefs, onChange }) {
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
    const name = window.prompt("Name this indicator setup:", "");
    if (name === null) return;
    const trimmed = String(name).trim();
    if (!trimmed) {
      window.alert("Enter a name to save this setup.");
      return;
    }
    addNamedIndicatorSet(trimmed, prefs);
    setSavedSets(loadNamedIndicatorSets());
  }

  /**
   * @param {{ id: string, name: string, prefs: import("../storage/chartIndicatorPrefs").ChartIndicatorPrefs }} set
   */
  function onApplySet(set) {
    onChange(normalizeChartIndicatorPrefs(set.prefs));
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
        aria-label="Saved indicator setups and reset"
        title="Saved setups — save, load, or reset chart indicators"
        onClick={toggleOpen}
      >
        <span className="chart-presets-grid-icon" aria-hidden>
          <span />
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
              <p className="chart-presets-menu-empty">No saved setups yet. Save the current chart indicators above.</p>
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
