import { useEffect, useId, useState } from "react";
import {
  UI_THEME_OPTIONS,
  applyUiThemeToDocument,
  loadUiTheme,
  normalizeUiThemeId,
  saveUiTheme,
} from "../storage/uiTheme";

/**
 * @param {{ className?: string; showLabel?: boolean }} [props]
 */
export default function ThemeSchemeControl({ className = "", showLabel = true }) {
  const labelId = useId();
  const [value, setValue] = useState(() => loadUiTheme());

  useEffect(() => {
    setValue(loadUiTheme());
  }, []);

  return (
    <div className={`theme-scheme-control ${className}`.trim()}>
      {showLabel ? (
        <label className="theme-scheme-label" htmlFor={labelId}>
          Color scheme
        </label>
      ) : null}
      <select
        id={showLabel ? labelId : undefined}
        className="theme-scheme-select"
        value={value}
        aria-label={showLabel ? undefined : "Color scheme"}
        onChange={(e) => {
          const next = normalizeUiThemeId(e.target.value);
          setValue(next);
          saveUiTheme(next);
          applyUiThemeToDocument(next);
        }}
      >
        {UI_THEME_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
