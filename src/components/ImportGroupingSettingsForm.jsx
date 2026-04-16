import { useState } from "react";
import {
  IMPORT_GROUPING_OPTIONS,
  loadImportGroupingMode,
  saveImportGroupingMode,
} from "../storage/importTradeGroupingPrefs";

/**
 * Radio list for Thinkorswim CSV import grouping (normal / merge / split).
 */
export default function ImportGroupingSettingsForm() {
  const [mode, setMode] = useState(loadImportGroupingMode);

  return (
    <div className="import-settings-form-body">
      {IMPORT_GROUPING_OPTIONS.map((opt) => (
        <label
          key={opt.id}
          className={`import-settings-option ${mode === opt.id ? "is-selected" : ""}`}
        >
          <input
            type="radio"
            name="import-grouping"
            value={opt.id}
            checked={mode === opt.id}
            onChange={() => {
              setMode(opt.id);
              saveImportGroupingMode(opt.id);
            }}
          />
          <div className="import-settings-option-text">
            <span className="import-settings-option-title">{opt.title}</span>
            <span className="import-settings-option-desc">{opt.description}</span>
          </div>
        </label>
      ))}
    </div>
  );
}
