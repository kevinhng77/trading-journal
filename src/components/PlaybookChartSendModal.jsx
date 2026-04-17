import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  appendScreenshotToMissedPlay,
  appendScreenshotToPlay,
  loadMissedPlays,
  loadPlaybook,
} from "../storage/playbookStorage";
import { blobToJpegDataUrl, captureChartElementAsPngBlob } from "../lib/chartImageCapture";

/** @typedef {{ id: string, name: string, kind: "plays" | "missed" }} PlaybookSendTarget */

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => HTMLElement | null} props.getCaptureEl
 * @param {string} props.tradeSummary
 * @param {() => void} [props.onSaved]
 */
export default function PlaybookChartSendModal({ open, onClose, getCaptureEl, tradeSummary, onSaved }) {
  /** @type {[PlaybookSendTarget[], import("react").Dispatch<import("react").SetStateAction<PlaybookSendTarget[]>>]} */
  const [targets, setTargets] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const comboboxWrapRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const labelId = useId();
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;
    const regular = loadPlaybook();
    const missed = loadMissedPlays();
    /** @type {PlaybookSendTarget[]} */
    const list = [
      ...regular.map((p) => ({ id: p.id, name: p.name || "Untitled play", kind: /** @type {const} */ ("plays") })),
      ...missed.map((p) => ({ id: p.id, name: p.name || "Untitled missed", kind: /** @type {const} */ ("missed") })),
    ];
    setTargets(list);
    setSelectedKey(list[0] ? `${list[0].kind}:${list[0].id}` : "");
    setErr(null);
    setBusy(false);
    setMenuOpen(false);
  }, [open]);

  useEffect(() => {
    if (busy) setMenuOpen(false);
  }, [busy]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(/** @type {MouseEvent} */ e) {
      const el = /** @type {Node | null} */ (e.target);
      if (!el || !comboboxWrapRef.current?.contains(el)) setMenuOpen(false);
    }
    function onKey(/** @type {KeyboardEvent} */ e) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function confirm() {
    setErr(null);
    const el = getCaptureEl?.() ?? null;
    if (!el) {
      setErr("Chart is not ready to capture. Wait for bars to load, then try again.");
      return;
    }
    if (!selectedKey) {
      setErr("Choose a play or missed play.");
      return;
    }
    const sep = selectedKey.indexOf(":");
    if (sep < 1) {
      setErr("Invalid selection.");
      return;
    }
    const kind = selectedKey.slice(0, sep);
    const id = selectedKey.slice(sep + 1);
    if (!id) {
      setErr("Invalid selection.");
      return;
    }
    setBusy(true);
    try {
      const pngBlob = await captureChartElementAsPngBlob(el);
      const dataUrl = await blobToJpegDataUrl(pngBlob);
      const r =
        kind === "missed"
          ? appendScreenshotToMissedPlay(id, dataUrl)
          : appendScreenshotToPlay(id, dataUrl);
      if (!r.ok) {
        setErr(r.message || "Could not save to playbook.");
        return;
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setErr(e && typeof e === "object" && "message" in e ? String(/** @type {Error} */ (e).message) : "Capture failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const playTargets = targets.filter((t) => t.kind === "plays");
  const missedTargets = targets.filter((t) => t.kind === "missed");
  const selectedTarget = targets.find((t) => `${t.kind}:${t.id}` === selectedKey) ?? targets[0];
  const triggerLabel = selectedTarget?.name ?? "Choose…";

  return (
    <div className="trade-chart-send-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="trade-chart-send-modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-chart-send-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="trade-chart-send-modal-title" className="trade-chart-send-modal-title">
          Add chart to playbook
        </h3>
        <p className="trade-chart-send-modal-sub">{tradeSummary}</p>
        {targets.length === 0 ? (
          <p className="trade-chart-send-modal-empty">
            No plays or missed plays yet.{" "}
            <Link to="/playbook" onClick={onClose}>
              Open Playbook
            </Link>{" "}
            and create one first.
          </p>
        ) : (
          <div className="trade-chart-send-modal-field">
            <span id={labelId} className="trade-chart-send-modal-label">
              Play or missed play
            </span>
            <div ref={comboboxWrapRef} className="trade-chart-send-combobox">
              <button
                type="button"
                className="trade-chart-send-combobox-trigger"
                aria-haspopup="listbox"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? listboxId : undefined}
                aria-label={`Play or missed play, ${triggerLabel}`}
                disabled={busy}
                onClick={() => setMenuOpen((o) => !o)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setMenuOpen(false);
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setMenuOpen(true);
                  }
                }}
              >
                <span className="trade-chart-send-combobox-trigger-text">{triggerLabel}</span>
              </button>
              {menuOpen ? (
                <ul
                  className="trade-chart-send-combobox-menu"
                  id={listboxId}
                  role="listbox"
                  aria-labelledby={labelId}
                >
                  {playTargets.length > 0 ? (
                    <>
                      <li className="trade-chart-send-combobox-group" role="presentation">
                        <span className="trade-chart-send-combobox-group-label">Plays</span>
                      </li>
                      {playTargets.map((t) => {
                        const key = `plays:${t.id}`;
                        return (
                          <li key={key} className="trade-chart-send-combobox-li" role="none">
                            <button
                              type="button"
                              role="option"
                              aria-selected={key === selectedKey}
                              className={`trade-chart-send-combobox-option ${key === selectedKey ? "is-selected" : ""}`}
                              onClick={() => {
                                setSelectedKey(key);
                                setMenuOpen(false);
                              }}
                            >
                              {t.name}
                            </button>
                          </li>
                        );
                      })}
                    </>
                  ) : null}
                  {missedTargets.length > 0 ? (
                    <>
                      <li className="trade-chart-send-combobox-group" role="presentation">
                        <span className="trade-chart-send-combobox-group-label">Missed plays</span>
                      </li>
                      {missedTargets.map((t) => {
                        const key = `missed:${t.id}`;
                        return (
                          <li key={key} className="trade-chart-send-combobox-li" role="none">
                            <button
                              type="button"
                              role="option"
                              aria-selected={key === selectedKey}
                              className={`trade-chart-send-combobox-option ${key === selectedKey ? "is-selected" : ""}`}
                              onClick={() => {
                                setSelectedKey(key);
                                setMenuOpen(false);
                              }}
                            >
                              {t.name}
                            </button>
                          </li>
                        );
                      })}
                    </>
                  ) : null}
                </ul>
              ) : null}
            </div>
          </div>
        )}
        {err ? (
          <p className="trade-chart-send-modal-error" role="alert">
            {err}
          </p>
        ) : null}
        <div className="trade-chart-send-modal-actions">
          <button type="button" className="range-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="import-btn trade-chart-send-modal-save"
            onClick={() => void confirm()}
            disabled={busy || targets.length === 0}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
