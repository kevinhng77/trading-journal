import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { appendScreenshotToPlay, loadPlaybook } from "../storage/playbookStorage";
import { blobToJpegDataUrl, captureChartElementAsPngBlob } from "../lib/chartImageCapture";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => HTMLElement | null} props.getCaptureEl
 * @param {string} props.tradeSummary
 * @param {() => void} [props.onSaved]
 */
export default function PlaybookChartSendModal({ open, onClose, getCaptureEl, tradeSummary, onSaved }) {
  const [plays, setPlays] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open) return;
    const list = loadPlaybook();
    setPlays(list);
    setSelectedId(list[0]?.id ?? "");
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
    if (!selectedId) {
      setErr("Choose a play.");
      return;
    }
    setBusy(true);
    try {
      const pngBlob = await captureChartElementAsPngBlob(el);
      const dataUrl = await blobToJpegDataUrl(pngBlob);
      const r = appendScreenshotToPlay(selectedId, dataUrl);
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
        {plays.length === 0 ? (
          <p className="trade-chart-send-modal-empty">
            No plays yet.{" "}
            <Link to="/playbook" onClick={onClose}>
              Open Playbook
            </Link>{" "}
            and create a play first.
          </p>
        ) : (
          <label className="trade-chart-send-modal-field">
            <span className="trade-chart-send-modal-label">Play</span>
            <select
              className="trade-chart-send-modal-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={busy}
            >
              {plays.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "Untitled play"}
                </option>
              ))}
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
            disabled={busy || plays.length === 0}
          >
            {busy ? "Saving…" : "Save to play"}
          </button>
        </div>
      </div>
    </div>
  );
}
