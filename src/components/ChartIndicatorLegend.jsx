import { useEffect, useRef, useState } from "react";
import CompactColorInput from "./CompactColorInput";

/**
 * @typedef {{ id: string, label: string, period: number | null, color: string, value: number | null, study: 'ma'|'vwap', enabled?: boolean }} LegendRow
 */

/** @param {{ value: number, onChange: (w: number) => void, disabled?: boolean }} props */
function LineWidthPick({ value, onChange, disabled = false }) {
  return (
    <div className="chart-legend-seg-row chart-legend-seg-row--width" role="group" aria-label="Line width">
      {[1, 2, 3, 4].map((w) => (
        <button
          key={w}
          type="button"
          className={`chart-legend-seg chart-legend-seg--width ${value === w ? "is-active" : ""}`}
          disabled={disabled}
          aria-pressed={value === w}
          title={`${w}px`}
          onClick={() => onChange(w)}
        >
          <span className="chart-legend-width-bar" style={{ height: w }} />
        </button>
      ))}
    </div>
  );
}

/** @param {{ visible: boolean, onToggle: () => void, name: string }} props */
function LegendVisibilityToggle({ visible, onToggle, name }) {
  return (
    <button
      type="button"
      className={`chart-indicator-legend-visibility${visible ? "" : " is-off"}`}
      title={visible ? "Hide on chart" : "Show on chart"}
      aria-label={visible ? `Hide ${name} on chart` : `Show ${name} on chart`}
      aria-pressed={visible}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
    >
      {visible ? (
        <svg className="chart-indicator-legend-visibility-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
            <circle cx="12" cy="12" r="3" />
          </g>
        </svg>
      ) : (
        <svg className="chart-indicator-legend-visibility-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </g>
        </svg>
      )}
    </button>
  );
}

/** @param {{ shape: string, buy: string, sell: string }} props */
function ExecutionMarkersPreview({ shape, buy, sell }) {
  const sh = String(shape || "triangle").toLowerCase();
  if (sh === "circle") {
    return (
      <svg className="chart-indicator-legend-exec-svg" viewBox="0 0 26 14" width="26" height="14" aria-hidden>
        <circle cx={6} cy={7} r={4.5} fill={buy} />
        <circle cx={20} cy={7} r={4.5} fill={sell} />
      </svg>
    );
  }
  if (sh === "square") {
    return (
      <svg className="chart-indicator-legend-exec-svg" viewBox="0 0 26 14" width="26" height="14" aria-hidden>
        <rect x={1.5} y={3.5} width={9} height={9} rx={1} fill={buy} />
        <rect x={15.5} y={3.5} width={9} height={9} rx={1} fill={sell} />
      </svg>
    );
  }
  if (sh === "diamond") {
    return (
      <svg className="chart-indicator-legend-exec-svg" viewBox="0 0 26 14" width="26" height="14" aria-hidden>
        <path fill={buy} d="M 6 1.5 L 11 7 L 6 12.5 L 1 7 Z" />
        <path fill={sell} d="M 20 12.5 L 25 7 L 20 1.5 L 15 7 Z" />
      </svg>
    );
  }
  return (
    <svg className="chart-indicator-legend-exec-svg" viewBox="0 0 26 14" width="26" height="14" aria-hidden>
      <path fill={buy} d="M 6 1.5 L 1 13 L 11 13 Z" />
      <path fill={sell} d="M 20 13 L 15 1.5 L 25 1.5 Z" />
    </svg>
  );
}

/** @param {{ value: 0 | 1 | 2, onChange: (s: 0 | 1 | 2) => void, disabled?: boolean }} props */
function LineStylePick({ value, onChange, disabled = false }) {
  const v = value ?? 0;
  return (
    <div className="chart-legend-seg-row chart-legend-seg-row--style" role="group" aria-label="Line style">
      <button
        type="button"
        className={`chart-legend-seg chart-legend-seg--style ${v === 0 ? "is-active" : ""}`}
        disabled={disabled}
        aria-pressed={v === 0}
        title="Solid"
        onClick={() => onChange(0)}
      >
        <svg className="chart-legend-style-svg" viewBox="0 0 32 14" width="32" height="14" aria-hidden>
          <line x1="2" y1="7" x2="30" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className={`chart-legend-seg chart-legend-seg--style ${v === 2 ? "is-active" : ""}`}
        disabled={disabled}
        aria-pressed={v === 2}
        title="Dashed"
        onClick={() => onChange(2)}
      >
        <svg className="chart-legend-style-svg" viewBox="0 0 32 14" width="32" height="14" aria-hidden>
          <line
            x1="2"
            y1="7"
            x2="30"
            y2="7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="5 5"
          />
        </svg>
      </button>
      <button
        type="button"
        className={`chart-legend-seg chart-legend-seg--style ${v === 1 ? "is-active" : ""}`}
        disabled={disabled}
        aria-pressed={v === 1}
        title="Dotted"
        onClick={() => onChange(1)}
      >
        <svg className="chart-legend-style-svg" viewBox="0 0 32 14" width="32" height="14" aria-hidden>
          <line
            x1="2"
            y1="7"
            x2="30"
            y2="7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="2 6"
          />
        </svg>
      </button>
    </div>
  );
}

/**
 * @param {object} props
 * @param {LegendRow[]} props.rows
 * @param {import("../storage/chartIndicatorPrefs").ChartIndicatorPrefs} props.prefs
 * @param {(id: string, partial: object) => void} [props.onPatchEma]
 * @param {(partial: object) => void} [props.onPatchVwap]
 * @param {(partial: object) => void} [props.onPatchMarkers]
 * @param {(partial: object) => void} [props.onPatchRoundTripShading]
 * @param {(id: string) => void} [props.onRemoveEma]
 * @param {number} [props.fillsCount]
 */
export default function ChartIndicatorLegend({
  rows,
  prefs,
  onPatchEma,
  onPatchVwap,
  onPatchMarkers,
  onPatchRoundTripShading,
  onRemoveEma,
  fillsCount = 0,
}) {
  const [settingsId, setSettingsId] = useState(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!settingsId) return;
    function onDoc(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setSettingsId(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [settingsId]);

  const showMarkersRow = fillsCount > 0 && typeof onPatchMarkers === "function";
  if (!rows.length && !showMarkersRow) return null;

  const openMa = settingsId ? prefs.emaLines.find((e) => e.id === settingsId) : null;
  const vwapOpen = settingsId === "__vwap__";
  const markersOpen = settingsId === "__markers__";

  return (
    <div className="chart-indicator-legend chart-indicator-legend--rich" ref={popoverRef}>
      {showMarkersRow ? (
        <div className="chart-indicator-legend-row chart-indicator-legend-row--markers">
          <span className="chart-indicator-legend-exec-icon" aria-hidden>
            <ExecutionMarkersPreview
              shape={prefs.markers.shape ?? "triangle"}
              buy={prefs.markers.buy}
              sell={prefs.markers.sell}
            />
          </span>
          <span className="chart-indicator-legend-text">Executions</span>
          <div className="chart-indicator-legend-actions">
            <button
              type="button"
              className="chart-indicator-legend-gear"
              title="Execution marker colors & size"
              aria-label="Execution marker settings"
              onClick={() => setSettingsId((id) => (id === "__markers__" ? null : "__markers__"))}
            >
              ⚙
            </button>
          </div>
          {markersOpen && onPatchMarkers ? (
            <div className="chart-indicator-legend-popover" role="dialog" aria-label="Execution markers">
              {typeof onPatchRoundTripShading === "function" ? (
                <>
                  <p className="chart-legend-pop-section">Round-trip shading</p>
                  <label className="chart-legend-pop-check chart-legend-pop-check--block">
                    <input
                      type="checkbox"
                      checked={prefs.roundTripShading?.enabled !== false}
                      onChange={(e) => onPatchRoundTripShading({ enabled: e.target.checked })}
                    />
                    Show win / loss bands
                  </label>
                  <label className="chart-legend-pop-field">
                    Win (green tint)
                    <CompactColorInput
                      value={prefs.roundTripShading?.winColor ?? "#4abe78"}
                      onChange={(hex) => onPatchRoundTripShading({ winColor: hex })}
                      disabled={prefs.roundTripShading?.enabled === false}
                      aria-label="Win round-trip shade color"
                    />
                  </label>
                  <label className="chart-legend-pop-field">
                    Loss (red tint)
                    <CompactColorInput
                      value={prefs.roundTripShading?.lossColor ?? "#e66c6c"}
                      onChange={(hex) => onPatchRoundTripShading({ lossColor: hex })}
                      disabled={prefs.roundTripShading?.enabled === false}
                      aria-label="Loss round-trip shade color"
                    />
                  </label>
                  <label className="chart-legend-pop-field">
                    Flat / breakeven
                    <CompactColorInput
                      value={prefs.roundTripShading?.flatColor ?? "#82a5d2"}
                      onChange={(hex) => onPatchRoundTripShading({ flatColor: hex })}
                      disabled={prefs.roundTripShading?.enabled === false}
                      aria-label="Flat round-trip shade color"
                    />
                  </label>
                  <label className="chart-legend-pop-field chart-legend-pop-field--grow">
                    Band opacity
                    <input
                      type="range"
                      min={0.04}
                      max={0.22}
                      step={0.01}
                      value={prefs.roundTripShading?.alpha ?? 0.1}
                      onChange={(e) => onPatchRoundTripShading({ alpha: Number(e.target.value) || 0.1 })}
                      disabled={prefs.roundTripShading?.enabled === false}
                      aria-valuemin={0.04}
                      aria-valuemax={0.22}
                      aria-valuenow={prefs.roundTripShading?.alpha ?? 0.1}
                      aria-label="Round-trip band opacity"
                    />
                    <span className="chart-legend-pop-range-val">
                      {((prefs.roundTripShading?.alpha ?? 0.1) * 100).toFixed(0)}%
                    </span>
                  </label>
                </>
              ) : null}

              <p className="chart-legend-pop-section">Execution markers</p>
              <label className="chart-legend-pop-field">
                Shape
                <select
                  value={prefs.markers.shape ?? "triangle"}
                  onChange={(e) =>
                    onPatchMarkers({
                      shape: /** @type {'triangle'|'circle'|'square'|'diamond'} */ (e.target.value),
                    })
                  }
                  aria-label="Execution marker shape"
                >
                  <option value="triangle">Triangle</option>
                  <option value="circle">Circle</option>
                  <option value="square">Square</option>
                  <option value="diamond">Diamond</option>
                </select>
              </label>
              <p className="chart-legend-pop-section" style={{ fontSize: 9, marginTop: 4 }}>
                Sizing by quantity
              </p>
              <div className="chart-legend-pop-radio-row" role="group" aria-label="How to show fill size">
                {[
                  { id: "color", label: "Color" },
                  { id: "size", label: "Size" },
                  { id: "both", label: "Both" },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    className={`chart-legend-pop-seg ${(prefs.markers.sizingMode ?? "color") === id ? "is-active" : ""}`}
                    aria-pressed={(prefs.markers.sizingMode ?? "color") === id}
                    onClick={() => onPatchMarkers({ sizingMode: id })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="chart-legend-pop-field">
                Buy (BOT)
                <CompactColorInput
                  value={prefs.markers.buy}
                  onChange={(hex) => onPatchMarkers({ buy: hex })}
                  aria-label="Buy marker color"
                />
              </label>
              <label className="chart-legend-pop-field">
                Sell (SOLD)
                <CompactColorInput
                  value={prefs.markers.sell}
                  onChange={(hex) => onPatchMarkers({ sell: hex })}
                  aria-label="Sell marker color"
                />
              </label>
              <label className="chart-legend-pop-field chart-legend-pop-field--grow">
                Size
                <input
                  type="range"
                  min={5}
                  max={28}
                  value={prefs.markers.size}
                  onChange={(e) => onPatchMarkers({ size: Number(e.target.value) || 12 })}
                  aria-valuemin={5}
                  aria-valuemax={28}
                  aria-valuenow={prefs.markers.size}
                  aria-label="Marker size"
                />
                <span className="chart-legend-pop-range-val">{prefs.markers.size}px</span>
              </label>
              <button type="button" className="chart-legend-pop-close" onClick={() => setSettingsId(null)}>
                Done
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {rows.map((row) => {
        if (row.study === "ma") {
          const ma = prefs.emaLines.find((e) => e.id === row.id);
          if (!ma) return null;
        }

        const rowMuted =
          (row.study === "ma" && row.enabled === false) || (row.study === "vwap" && row.enabled === false);

        const visible = row.enabled !== false;

        return (
          <div
            key={row.id}
            className={`chart-indicator-legend-row ${rowMuted ? "chart-indicator-legend-row--muted" : ""}`}
          >
            {row.study === "ma" && onPatchEma ? (
              <LegendVisibilityToggle
                visible={visible}
                name={row.label}
                onToggle={() => {
                  const next = !visible;
                  onPatchEma(row.id, { enabled: next });
                  if (!next && settingsId === row.id) setSettingsId(null);
                }}
              />
            ) : null}
            {row.study === "vwap" && onPatchVwap ? (
              <LegendVisibilityToggle
                visible={visible}
                name="VWAP"
                onToggle={() => {
                  const next = !prefs.vwap.enabled;
                  onPatchVwap({ enabled: next });
                  if (!next && settingsId === "__vwap__") setSettingsId(null);
                }}
              />
            ) : null}
            <span className="chart-indicator-legend-line" style={{ background: row.color }} aria-hidden />
            <span className="chart-indicator-legend-text" style={{ color: row.color }}>
              {row.label}
            </span>
            {row.study === "ma" && onPatchEma ? (
              <div className="chart-indicator-legend-actions">
                <button
                  type="button"
                  className="chart-indicator-legend-gear"
                  title="Line settings"
                  aria-label={`${row.label} settings`}
                  onClick={() => setSettingsId((id) => (id === row.id ? null : row.id))}
                >
                  ⚙
                </button>
              </div>
            ) : null}
            {row.study === "vwap" && onPatchVwap ? (
              <div className="chart-indicator-legend-actions">
                <button
                  type="button"
                  className="chart-indicator-legend-gear"
                  title="VWAP settings"
                  aria-label="VWAP settings"
                  onClick={() => setSettingsId((id) => (id === "__vwap__" ? null : "__vwap__"))}
                >
                  ⚙
                </button>
              </div>
            ) : null}

            {row.study === "ma" && onPatchEma && settingsId === row.id && openMa && (
              <div className="chart-indicator-legend-popover" role="dialog" aria-label="Line settings">
                <label className="chart-legend-pop-field">
                  Period
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={openMa.period}
                    onChange={(e) => onPatchEma(row.id, { period: Number(e.target.value) || 1 })}
                  />
                </label>
                <label className="chart-legend-pop-field">
                  Type
                  <select
                    value={openMa.kind ?? "ema"}
                    onChange={(e) => onPatchEma(row.id, { kind: /** @type {'ema'|'sma'} */ (e.target.value) })}
                  >
                    <option value="ema">EMA</option>
                    <option value="sma">SMA</option>
                  </select>
                </label>
                <label className="chart-legend-pop-field">
                  Color
                  <CompactColorInput
                    value={openMa.color}
                    onChange={(hex) => onPatchEma(row.id, { color: hex })}
                    aria-label={`${row.label} color`}
                  />
                </label>
                <div className="chart-legend-pop-field chart-legend-pop-field--inline-label">
                  <span className="chart-legend-pop-field-label">Width</span>
                  <LineWidthPick
                    value={openMa.width}
                    onChange={(w) => onPatchEma(row.id, { width: w })}
                  />
                </div>
                <div className="chart-legend-pop-field chart-legend-pop-field--inline-label">
                  <span className="chart-legend-pop-field-label">Style</span>
                  <LineStylePick
                    value={openMa.lineStyle ?? 0}
                    onChange={(lineStyle) => onPatchEma(row.id, { lineStyle })}
                  />
                </div>
                <label className="chart-legend-pop-check">
                  <input
                    type="checkbox"
                    checked={openMa.enabled}
                    onChange={(e) => {
                      const on = e.target.checked;
                      onPatchEma(row.id, { enabled: on });
                      if (!on) setSettingsId(null);
                    }}
                  />
                  Visible
                </label>
                {onRemoveEma && prefs.emaLines.length > 0 ? (
                  <button
                    type="button"
                    className="chart-legend-pop-remove"
                    onClick={() => {
                      onRemoveEma(row.id);
                      setSettingsId(null);
                    }}
                  >
                    Remove line
                  </button>
                ) : null}
                <button type="button" className="chart-legend-pop-close" onClick={() => setSettingsId(null)}>
                  Done
                </button>
              </div>
            )}

            {row.study === "vwap" && onPatchVwap && vwapOpen && (
              <div className="chart-indicator-legend-popover" role="dialog" aria-label="VWAP settings">
                <label className="chart-legend-pop-check chart-legend-pop-check--block">
                  <input
                    type="checkbox"
                    checked={prefs.vwap.enabled}
                    onChange={(e) => {
                      onPatchVwap({ enabled: e.target.checked });
                      if (!e.target.checked) setSettingsId(null);
                    }}
                  />
                  VWAP (session)
                </label>
                <label className="chart-legend-pop-field">
                  Color
                  <CompactColorInput
                    value={prefs.vwap.color}
                    onChange={(hex) => onPatchVwap({ color: hex })}
                    disabled={!prefs.vwap.enabled}
                    aria-label="VWAP color"
                  />
                </label>
                <div className="chart-legend-pop-field chart-legend-pop-field--inline-label">
                  <span className="chart-legend-pop-field-label">Width</span>
                  <LineWidthPick
                    value={prefs.vwap.width}
                    disabled={!prefs.vwap.enabled}
                    onChange={(w) => onPatchVwap({ width: w })}
                  />
                </div>
                <div className="chart-legend-pop-field chart-legend-pop-field--inline-label">
                  <span className="chart-legend-pop-field-label">Style</span>
                  <LineStylePick
                    value={prefs.vwap.lineStyle ?? 0}
                    disabled={!prefs.vwap.enabled}
                    onChange={(lineStyle) => onPatchVwap({ lineStyle })}
                  />
                </div>
                <button type="button" className="chart-legend-pop-close" onClick={() => setSettingsId(null)}>
                  Done
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
