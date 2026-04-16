import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { parseThinkorswimAccountCsv } from "../import/thinkorswimCsv";
import { mergeTradesImported } from "../storage/storage";
import { loadImportGroupingMode } from "../storage/importTradeGroupingPrefs";

export default function ImportTradesButton() {
  const inputRef = useRef(null);
  const menuWrapRef = useRef(null);
  const popRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /** @type {React.CSSProperties | null} */
  const [popStyle, setPopStyle] = useState(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!menuOpen) {
      setPopStyle(null);
      return;
    }
    function place() {
      const wrap = menuWrapRef.current;
      if (!wrap || typeof window === "undefined") return;
      const r = wrap.getBoundingClientRect();
      const vGap = 8;
      const pad = 12;
      const measuredH = popRef.current?.offsetHeight ?? 0;
      const menuH = measuredH > 0 ? measuredH : 56;

      const spaceAbove = r.top - pad;
      const openAbove = spaceAbove >= menuH + vGap;

      /** Match CSS min-width when pop not measured yet */
      const menuW = Math.max(popRef.current?.offsetWidth ?? 0, 220);
      const triggerMid = r.left + r.width / 2;
      let leftPx = triggerMid - menuW / 2;
      const maxLeft = Math.max(pad, window.innerWidth - menuW - pad);
      leftPx = Math.min(Math.max(pad, leftPx), maxLeft);

      /** @type {React.CSSProperties} */
      const style = {
        position: "fixed",
        left: `${Math.round(leftPx)}px`,
        right: "auto",
        zIndex: 400,
      };
      if (openAbove) {
        style.top = `${Math.round(r.top - vGap)}px`;
        style.bottom = "auto";
        style.transform = "translateY(-100%)";
      } else {
        style.top = `${Math.round(r.bottom + vGap)}px`;
        style.bottom = "auto";
        style.transform = "none";
      }
      setPopStyle(style);
    }
    place();
    const raf = requestAnimationFrame(() => place());
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocMouseDown(e) {
      const el = /** @type {Node | null} */ (e.target);
      if (!el) return;
      if (menuWrapRef.current?.contains(el) || popRef.current?.contains(el)) return;
      setMenuOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const groupingMode = loadImportGroupingMode();
      const { trades, errors } = parseThinkorswimAccountCsv(text, { groupingMode });
      if (trades.length === 0) {
        window.alert(
          errors.length
            ? `No trades found. First issues:\n${errors.slice(0, 5).join("\n")}`
            : "No Schwab / Thinkorswim stock fills found. Use an Account Statement CSV (Cash Balance TRD rows and/or Account Trade History).",
        );
        return;
      }
      const { imported, removedDuplicates } = mergeTradesImported(trades);
      let msg = `Imported ${imported} trade row(s) (${groupingMode} grouping).`;
      if (removedDuplicates) msg += ` Replaced ${removedDuplicates} existing row(s) with the same id.`;
      if (errors.length) msg += `\n\n${errors.length} line(s) skipped (see console).`;
      window.alert(msg);
      if (errors.length) console.warn("Thinkorswim import warnings", errors);
    } catch (err) {
      console.error(err);
      window.alert(`Import failed: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="visually-hidden"
        aria-hidden
        onChange={onFile}
        disabled={busy}
      />
      <div className="import-trades-actions">
        <button
          type="button"
          className="import-btn"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Importing…" : "Import Trades"}
        </button>
        <div className="import-settings-menu-wrap" ref={menuWrapRef}>
          <button
            type="button"
            className="import-settings-btn"
            disabled={busy}
            title="Import menu"
            aria-label="Import menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="import-settings-btn-icon" aria-hidden>
              ⋮
            </span>
          </button>
          {menuOpen && popStyle
            ? createPortal(
                <div
                  ref={popRef}
                  id={menuId}
                  className="import-trades-settings-pop"
                  role="menu"
                  style={popStyle}
                >
                  <Link
                    className="import-trades-settings-pop-item"
                    role="menuitem"
                    to="/settings/trade-import"
                    onClick={() => setMenuOpen(false)}
                  >
                    Settings
                  </Link>
                </div>,
                document.body,
              )
            : null}
        </div>
      </div>
    </>
  );
}
