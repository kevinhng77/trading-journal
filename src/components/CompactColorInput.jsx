import { useEffect, useId, useRef, useState } from "react";
import { TOS_EMA_FALLBACK_CYCLE } from "../lib/chartEmaColors";
import {
  buildChartSwatchPalette,
  loadRecentChartColors,
  pushRecentChartColor,
} from "../lib/chartColorPalette";

const EXTRA_PRESETS = [
  "#f8fafc",
  "#94a3b8",
  "#64748b",
  "#4ade80",
  "#22c55e",
  "#f87171",
  "#ef4444",
  "#fbbf24",
  "#fb923c",
  "#ffeb3b",
  "#a78bfa",
  "#818cf8",
  "#38bdf8",
  "#0ea5e9",
  "#f472b6",
  "#ec4899",
];

function normalizeHex(raw) {
  let t = String(raw ?? "").trim();
  if (!t) return null;
  if (!t.startsWith("#")) t = `#${t}`;
  let m = /^#([0-9a-fA-F]{6})$/.exec(t);
  if (m) return `#${m[1].toLowerCase()}`;
  m = /^#([0-9a-fA-F]{3})$/.exec(t);
  if (m) {
    const [a, b, c] = m[1].split("");
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  return null;
}

function uniqueHexList(list) {
  const seen = new Set();
  const out = [];
  for (const h of list) {
    const n = normalizeHex(h);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

const PALETTE_GRID = uniqueHexList([
  ...buildChartSwatchPalette(),
  ...TOS_EMA_FALLBACK_CYCLE,
  ...EXTRA_PRESETS,
]);

/**
 * Large swatch grid + recent colors + hex — avoids the slow native OS color wheel (esp. Edge on Windows).
 *
 * @param {{ value: string, onChange: (hex: string) => void, id?: string, "aria-label"?: string, disabled?: boolean }} props
 */
export default function CompactColorInput({ value, onChange, id, "aria-label": ariaLabel, disabled = false }) {
  const [open, setOpen] = useState(false);
  /** Bumps after localStorage recent list changes so we re-read without an effect. */
  const [recentVersion, setRecentVersion] = useState(0);
  const wrapRef = useRef(null);
  const hexId = useId();

  void recentVersion;
  const recent = open ? loadRecentChartColors() : [];

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      const el = /** @type {Node | null} */ (e.target);
      if (!wrapRef.current || !el || wrapRef.current.contains(el)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const safe = normalizeHex(value) || "#94a3b8";

  function pick(hex) {
    const n = normalizeHex(hex);
    if (!n) return;
    onChange(n);
    pushRecentChartColor(n);
    setRecentVersion((v) => v + 1);
  }

  function pinCurrentToRecent() {
    pushRecentChartColor(safe);
    setRecentVersion((v) => v + 1);
  }

  return (
    <div className="compact-color-wrap" ref={wrapRef}>
      <button
        type="button"
        id={id}
        className={`compact-color-trigger${disabled ? " is-disabled" : ""}`}
        style={{ backgroundColor: safe }}
        aria-label={ariaLabel}
        aria-expanded={open}
        title={disabled ? "Enable VWAP to edit color" : "Choose color"}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
      />
      {open && !disabled ? (
        <div className="compact-color-pop" role="dialog" aria-label={ariaLabel || "Color"}>
          <div className="compact-color-grid" role="list">
            {PALETTE_GRID.map((h) => (
              <button
                key={h}
                type="button"
                role="listitem"
                className={`compact-color-swatch ${h === safe ? "is-active" : ""}`}
                style={{ backgroundColor: h }}
                title={h}
                aria-label={h}
                onClick={() => pick(h)}
              />
            ))}
          </div>
          <div className="compact-color-recent" aria-label="Recent colors">
            <span className="compact-color-recent-label">Recent</span>
            <div className="compact-color-recent-row" role="list">
              {recent.length ? (
                recent.map((h) => (
                  <button
                    key={h}
                    type="button"
                    role="listitem"
                    className={`compact-color-swatch compact-color-swatch--sm ${h === safe ? "is-active" : ""}`}
                    style={{ backgroundColor: h }}
                    title={h}
                    aria-label={`Recent ${h}`}
                    onClick={() => pick(h)}
                  />
                ))
              ) : (
                <span className="compact-color-recent-empty">Pick a swatch to fill this row</span>
              )}
              <button
                type="button"
                className="compact-color-pin"
                title="Save current color to recent"
                aria-label="Add current color to recent"
                onClick={pinCurrentToRecent}
              >
                +
              </button>
            </div>
          </div>
          <label className="compact-color-hex" htmlFor={hexId}>
            Hex
            <input
              id={hexId}
              type="text"
              className="compact-color-hex-input"
              defaultValue={safe}
              key={safe}
              spellCheck={false}
              maxLength={7}
              autoComplete="off"
              onBlur={(e) => {
                const n = normalizeHex(e.target.value);
                if (n) {
                  onChange(n);
                  pushRecentChartColor(n);
                  setRecentVersion((v) => v + 1);
                }
                e.target.value = normalizeHex(value) || safe;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const n = normalizeHex(e.currentTarget.value);
                  if (n) {
                    pick(n);
                    setOpen(false);
                  }
                }
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
