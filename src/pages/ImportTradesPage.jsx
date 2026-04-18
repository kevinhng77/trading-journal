import { useEffect, useRef, useState } from "react";
import { parseThinkorswimAccountCsv } from "../import/thinkorswimCsv";
import { parseDasTradesCsv } from "../import/dasCsv";
import { mergeTradesImported } from "../storage/storage";
import { loadImportGroupingMode } from "../storage/importTradeGroupingPrefs";
import {
  getActiveAccountId,
  getTradingAccount,
  listTradingAccounts,
} from "../storage/tradingAccounts";

export default function ImportTradesPage() {
  const accounts = listTradingAccounts();
  const [targetAccountId, setTargetAccountId] = useState(() => getActiveAccountId());
  const [importKind, setImportKind] = useState(() => {
    const a = getTradingAccount(getActiveAccountId());
    return a?.importFormat === "das" ? "das" : "tos";
  });
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const a = getTradingAccount(targetAccountId);
    if (a) setImportKind(a.importFormat === "das" ? "das" : "tos");
  }, [targetAccountId]);

  const selectedAccount = getTradingAccount(targetAccountId);
  const formatMismatch =
    selectedAccount &&
    importKind !== (selectedAccount.importFormat === "das" ? "das" : "tos");

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const groupingMode = loadImportGroupingMode();
      const kind = importKind;
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
      const { imported, removedDuplicates } = mergeTradesImported(trades, { accountId: targetAccountId });
      const label = kind === "das" ? "DAS" : "Thinkorswim / Schwab";
      const bucket = getTradingAccount(targetAccountId)?.label ?? targetAccountId;
      let msg = `Imported ${imported} trade row(s) into “${bucket}” (${label}, ${groupingMode} grouping).`;
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
  };

  return (
    <div className="page-wrap import-trades-page">
      <div className="page-header">
        <h1>Trade Settings</h1>
      </div>

      <div className="card import-trades-page-card">
        <h2 className="import-trades-page-card-title">Import destination</h2>
        <div className="import-trades-page-grid">
          <label className="import-trades-page-field">
            <span className="import-trades-page-label">Broker / file format</span>
            <select
              className="import-trades-page-select"
              value={importKind}
              onChange={(e) => setImportKind(e.target.value === "das" ? "das" : "tos")}
              disabled={busy}
            >
              <option value="tos">Thinkorswim / Schwab account CSV</option>
              <option value="das">DAS Trader executions CSV</option>
            </select>
          </label>
          <label className="import-trades-page-field">
            <span className="import-trades-page-label">Account (trade bucket)</span>
            <select
              className="import-trades-page-select"
              value={targetAccountId}
              onChange={(e) => setTargetAccountId(e.target.value)}
              disabled={busy}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} ({a.importFormat === "das" ? "DAS CSV" : "Schwab / TOS CSV"})
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="import-trades-page-hint">
          Changing the account updates the format to that bucket&apos;s default; you can still override the format
          above.
        </p>
        {formatMismatch ? (
          <p className="import-trades-page-warn">
            Format differs from this account&apos;s default — make sure the CSV matches the parser you selected.
          </p>
        ) : null}
      </div>

      <div className="card import-trades-page-card">
        <h2 className="import-trades-page-card-title">Upload</h2>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="visually-hidden"
          aria-hidden
          disabled={busy}
          onChange={onFile}
        />
        <button
          type="button"
          className="import-trades-page-upload-btn"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Importing…" : "Choose CSV file…"}
        </button>
      </div>
    </div>
  );
}
