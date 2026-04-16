import { useId, useState } from "react";
import { FILL_TIME_ZONES, loadFillTimeZone, saveFillTimeZone } from "../storage/fillTimePrefs";

/** Time zone for interpreting imported fill timestamps on charts. */
export default function FillTimeZoneSettingsForm() {
  const [tz, setTz] = useState(loadFillTimeZone);
  const selectId = useId();

  return (
    <div className="trade-import-fill-tz-form">
      <label className="chart-modal-settings-label" htmlFor={selectId}>
        Fill times
      </label>
      <p className="chart-modal-settings-desc">
        Time zone used to interpret fill timestamps from your import when placing markers on the chart.
      </p>
      <select
        id={selectId}
        className="trades-filter-input chart-modal-settings-select"
        value={tz}
        onChange={(e) => {
          const v = e.target.value;
          setTz(v);
          saveFillTimeZone(v);
        }}
      >
        {FILL_TIME_ZONES.map((z) => (
          <option key={z.id} value={z.id}>
            {z.label}
          </option>
        ))}
      </select>
    </div>
  );
}
