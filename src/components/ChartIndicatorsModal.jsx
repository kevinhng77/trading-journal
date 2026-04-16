import { useEffect, useMemo, useState } from "react";
import { CATALOG_STUDIES, INDICATOR_CATEGORIES } from "../lib/chartStudyCatalog";
import { addOrEnableMaLine, setVwapEnabled } from "../storage/chartIndicatorPrefs";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {import("../storage/chartIndicatorPrefs").ChartIndicatorPrefs} props.prefs
 * @param {(p: import("../storage/chartIndicatorPrefs").ChartIndicatorPrefs) => void} props.onChange
 */

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"
      />
    </svg>
  );
}

function IconIndicators() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className="chart-indicators-modal-brand-icon">
      <path
        fill="currentColor"
        d="M4 19h16v2H4v-2zm2-4h2v-4H6v4zm4 0h2V7h-2v8zm4 0h2v-6h-2v6zm4 0h2v-9h-2v9z"
        opacity="0.9"
      />
    </svg>
  );
}

export default function ChartIndicatorsModal({ open, onClose, prefs, onChange }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(/** @type {import('../lib/chartStudyCatalog').StudyCategoryId} */ ("trend"));

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG_STUDIES.filter((s) => {
      if (q) {
        return (
          s.name.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q))
        );
      }
      return s.category === category;
    });
  }, [query, category]);

  function applyStudy(study) {
    if (study.status !== "ready" || !study.study) return;
    if (study.study === "vwap") {
      onChange(setVwapEnabled(prefs, true));
      return;
    }
    if ((study.study === "ema" || study.study === "sma") && study.period != null) {
      onChange(addOrEnableMaLine(prefs, study.study, study.period));
    }
  }

  if (!open) return null;

  return (
    <div className="chart-indicators-modal-root" role="dialog" aria-modal="true" aria-labelledby="chart-indicators-modal-title">
      <button type="button" className="chart-indicators-modal-backdrop" aria-label="Close" onClick={onClose} />
      <div className="chart-indicators-modal-panel">
        <header className="chart-indicators-modal-header">
          <div className="chart-indicators-modal-title-row">
            <IconIndicators />
            <h2 id="chart-indicators-modal-title" className="chart-indicators-modal-title">
              Indicators, metrics, and strategies
            </h2>
          </div>
          <button type="button" className="chart-indicators-modal-close" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </header>

        <div className="chart-indicators-modal-search-wrap">
          <span className="chart-indicators-modal-search-icon" aria-hidden>
            ⌕
          </span>
          <input
            type="search"
            className="chart-indicators-modal-search"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="chart-indicators-modal-body">
          <nav className="chart-indicators-modal-cats" aria-label="Categories">
            <div className="chart-indicators-modal-cat-label">Built-ins</div>
            {INDICATOR_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chart-indicators-modal-cat ${category === c.id ? "is-active" : ""}`}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </nav>
          <div className="chart-indicators-modal-list-wrap">
            <div className="chart-indicators-modal-list-head">Script name</div>
            <ul className="chart-indicators-modal-list">
              {filtered.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`chart-indicators-modal-row ${s.status === "soon" ? "is-soon" : ""}`}
                    disabled={s.status === "soon"}
                    onClick={() => applyStudy(s)}
                    title={s.status === "soon" ? "Coming soon" : `Add ${s.name} to chart`}
                  >
                    <span className="chart-indicators-modal-row-name">{s.name}</span>
                    {s.status === "soon" ? <span className="chart-indicators-modal-badge">Soon</span> : null}
                  </button>
                </li>
              ))}
              {filtered.length === 0 ? <li className="chart-indicators-modal-empty">No matches</li> : null}
            </ul>
          </div>
        </div>

        <p className="chart-indicators-modal-footnote">
          More studies (RSI, MACD, Bollinger, …) can be added in a future update. VWAP uses bar volume; intraday only.
        </p>
      </div>
    </div>
  );
}
