import { useRef, useState } from "react";
import { parseThinkorswimAccountCsv } from "../import/thinkorswimCsv";
import { mergeTradesImported } from "../storage/storage";
import { loadImportGroupingMode } from "../storage/importTradeGroupingPrefs";

export default function ImportTradesButton() {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const groupingMode = loadImportGroupingMode();
      const { trades, errors } = parseThinkorswimAccountCsv(text, {
        groupingMode,
        fillsSource: "cashTrdOnly",
      });
      if (trades.length === 0) {
        window.alert(
          errors.length
            ? `No trades found. First issues:\n${errors.slice(0, 5).join("\n")}`
            : "No Schwab / Thinkorswim stock fills found. Use an Account Statement CSV with Cash Balance TRD rows (or Account Trade History if there are no TRD lines).",
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
      </div>
    </>
  );
}
