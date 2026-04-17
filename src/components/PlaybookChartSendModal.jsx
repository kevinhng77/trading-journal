import { useEffect, useState } from "react";
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
  }, [open]);

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
          <label className="trade-chart-send-modal-field">
            <span className="trade-chart-send-modal-label">Play or missed play</span>
            <select
              className="trade-chart-send-modal-select"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              disabled={busy}
            >
              {targets.some((t) => t.kind === "plays") ? (
                <optgroup label="Plays">
                  {targets
                    .filter((t) => t.kind === "plays")
                    .map((t) => (
                      <option key={`plays:${t.id}`} value={`plays:${t.id}`}>
                        {t.name}
                      </option>
                    ))}
                </optgroup>
              ) : null}
              {targets.some((t) => t.kind === "missed") ? (
                <optgroup label="Missed plays">
                  {targets
                    .filter((t) => t.kind === "missed")
                    .map((t) => (
                      <option key={`missed:${t.id}`} value={`missed:${t.id}`}>
                        {t.name}
                      </option>
                    ))}
                </optgroup>
              ) : null}
            </select>
          </label>
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
