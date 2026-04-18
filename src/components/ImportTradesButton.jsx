import { useEffect, useRef, useState } from "react";
import { parseThinkorswimAccountCsv } from "../import/thinkorswimCsv";
import { parseDasTradesCsv } from "../import/dasCsv";
import { mergeTradesImported } from "../storage/storage";
import { loadImportGroupingMode } from "../storage/importTradeGroupingPrefs";

export default function ImportTradesButton() {
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const kindRef = useRef(/** @type {"tos" | "das"} */ ("tos"));
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocMouseDown(/** @type {MouseEvent} */ e) {
      const el = wrapRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [menuOpen]);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const kind = kindRef.current;
    setBusy(true);
    setMenuOpen(false);
    try {
      const text = await file.text();
      const groupingMode = loadImportGroupingMode();
      const { trades, errors } =
        kind === "das"
          ? parseDasTradesCsv(text, { groupingMode })
          : parseThinkorswimAccountCsv(text, {
              groupingMode,
              fillsSource: "cashTrdOnly",
            });
      if (trades.length === 0) {
        window.alert(
          errors.length
            ? `No trades found. First issues:\n${errors.slice(0, 5).join("\n")}`
            : kind === "das"
              ? "No DAS execution rows parsed. Use a Trades.csv-style export with Symbol, Side, Qty, Price, and date/time columns."
              : "No Schwab / Thinkorswim stock fills found. Use an Account Statement CSV with Cash Balance TRD rows (or Account Trade History if there are no TRD lines).",
        );
        return;
      }
      const { imported, removedDuplicates } = mergeTradesImported(trades);
      const label = kind === "das" ? "DAS" : "Thinkorswim / Schwab";
      let msg = `Imported ${imported} trade row(s) (${label}, ${groupingMode} grouping).`;
      if (removedDuplicates) msg += ` Replaced ${removedDuplicates} existing row(s) with the same id.`;
      if (errors.length) msg += `\n\n${errors.length} line(s) skipped (see console).`;
      window.alert(msg);
      if (errors.length) console.warn(`${label} import warnings`, errors);
    } catch (err) {
      console.error(err);
      window.alert(`Import failed: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  function openPicker(kind) {
    kindRef.current = kind;
    setMenuOpen(false);
    inputRef.current?.click();
  }

  return (
    <div className="import-trades-wrap" ref={wrapRef}>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="visually-hidden"
        aria-hidden
        onChange={onFile}
        disabled={busy}
      />
      <div className="import-trades-actions import-trades-actions--with-menu">
        {menuOpen && !busy ? (
          <div className="import-trades-settings-pop import-source-menu" role="menu" aria-label="Import source">
            <button
              type="button"
              className="import-trades-settings-pop-item"
              role="menuitem"
              onClick={() => openPicker("tos")}
            >
              Thinkorswim / Schwab account CSV
            </button>
            <button
              type="button"
              className="import-trades-settings-pop-item"
              role="menuitem"
              onClick={() => openPicker("das")}
            >
              DAS Trader executions CSV
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="import-btn"
          disabled={busy}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => !busy && setMenuOpen((v) => !v)}
        >
          {busy ? "Importing…" : "Import Trades"}
        </button>
      </div>
    </div>
  );
}
