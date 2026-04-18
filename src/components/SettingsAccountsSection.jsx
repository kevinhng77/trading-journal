import { useCallback, useRef, useState } from "react";
import {
  addTradingAccount,
  clearAccountAvatar,
  removeTradingAccount,
  setAccountAvatarDataUrl,
  setAccountDisplayName,
  setActiveAccountId,
} from "../storage/tradingAccounts";
import { useAllAccountProfilesSync } from "../hooks/useAllAccountProfilesSync";
import { loadTradesForAccount } from "../storage/storage";

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
async function compressImageFileToDataUrl(file) {
  const maxDim = 128;
  const maxBytes = 220_000;
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (PNG or JPEG).");
  const bmp = await createImageBitmap(file);
  try {
    let w = bmp.width;
    let h = bmp.height;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read image.");
    ctx.drawImage(bmp, 0, 0, w, h);
    let q = 0.88;
    let dataUrl = canvas.toDataURL("image/jpeg", q);
    while (dataUrl.length > maxBytes && q > 0.42) {
      q -= 0.07;
      dataUrl = canvas.toDataURL("image/jpeg", q);
    }
    if (dataUrl.length > 480_000) {
      throw new Error("Image is still too large; try a smaller photo.");
    }
    return dataUrl;
  } finally {
    bmp.close();
  }
}

export default function SettingsAccountsSection() {
  const { active, accounts } = useAllAccountProfilesSync();
  const [busyId, setBusyId] = useState(/** @type {string | null} */ (null));
  const [err, setErr] = useState(/** @type {string | null} */ (null));
  const fileRefs = useRef(/** @type {Record<string, HTMLInputElement | null>} */ ({}));
  const [newLabel, setNewLabel] = useState("");
  const [newImportFormat, setNewImportFormat] = useState(/** @type {"schwab" | "das"} */ ("schwab"));

  const onAvatarPick = useCallback(async (accountId, e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    setBusyId(accountId);
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      setAccountAvatarDataUrl(accountId, dataUrl);
    } catch (er) {
      setErr(er?.message || String(er));
    } finally {
      setBusyId(null);
    }
  }, []);

  function onAddAccount() {
    setErr(null);
    const label = newLabel.trim();
    if (!label) {
      setErr("Enter a name for the new account.");
      return;
    }
    const id = addTradingAccount({ label, importFormat: newImportFormat });
    setActiveAccountId(id);
    setNewLabel("");
    setNewImportFormat("schwab");
  }

  function onRemoveAccount(accountId, label) {
    setErr(null);
    const n = loadTradesForAccount(accountId).length;
    const msg =
      n > 0
        ? `Remove account “${label}” and delete its ${n} trade row(s) from this browser? This cannot be undone.`
        : `Remove account “${label}”? Its empty bucket will be cleared.`;
    if (!window.confirm(msg)) return;
    const r = removeTradingAccount(accountId);
    if (!r.ok) setErr(r.message ?? "Could not remove account.");
  }

  return (
    <section className="settings-standalone-card" aria-labelledby="accounts-heading">
      <h2 id="accounts-heading" className="settings-standalone-card-title">
        Trading accounts
      </h2>
      <p className="settings-standalone-section-lead">
        Each account is a separate trade bucket in this browser. Default CSV parser is set per account; on{" "}
        <strong>Import trades</strong> you can pick any bucket and override the format there.
      </p>
      {err ? <p className="settings-account-error">{err}</p> : null}

      <div className="settings-account-active-bar" role="status" aria-label="Active trading account">
        <span className="settings-account-active-value">
          {accounts.find((a) => a.id === active)?.label || active}
        </span>
        <div className="settings-account-switch-row">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`settings-account-switch-btn ${a.id === active ? "is-active" : ""}`}
              onClick={() => setActiveAccountId(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-account-add-panel">
        <h3 className="settings-account-add-title">Add account</h3>
        <div className="settings-account-add-row">
          <label className="settings-account-add-field">
            <span className="settings-account-field-label">Display name</span>
            <input
              type="text"
              className="settings-account-input"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. IRA, Prop firm"
              maxLength={48}
            />
          </label>
          <label className="settings-account-add-field">
            <span className="settings-account-field-label">Default import format</span>
            <select
              className="settings-account-input settings-account-select"
              value={newImportFormat}
              onChange={(e) => setNewImportFormat(e.target.value === "das" ? "das" : "schwab")}
            >
              <option value="schwab">Thinkorswim / Schwab CSV</option>
              <option value="das">DAS executions CSV</option>
            </select>
          </label>
          <button type="button" className="settings-account-btn secondary settings-account-add-submit" onClick={onAddAccount}>
            Add account
          </button>
        </div>
      </div>

      <div className="settings-account-cards">
        {accounts.map((a) => {
          const pid = a.id;
          const p = a.profile;
          const loading = busyId === pid;
          const fmtLabel = a.importFormat === "das" ? "DAS CSV" : "Schwab / TOS CSV";
          return (
            <div key={pid} className="settings-account-card">
              <div className="settings-account-card-head">
                <span className="settings-account-card-broker">{a.label}</span>
                <span className="settings-account-card-hint">
                  bucket: {pid} · {fmtLabel}
                </span>
              </div>
              <label className="settings-account-field">
                <span className="settings-account-field-label">Display name</span>
                <input
                  key={`name-${pid}-${p.displayName}`}
                  type="text"
                  className="settings-account-input"
                  name={`account-name-${pid}`}
                  defaultValue={p.displayName}
                  placeholder={a.label}
                  disabled={loading}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v === (p.displayName || "")) return;
                    setAccountDisplayName(pid, v);
                  }}
                />
              </label>
              <div className="settings-account-avatar-row">
                <div className="settings-account-avatar-preview">
                  {p.avatarDataUrl ? (
                    <img src={p.avatarDataUrl} alt="" decoding="async" />
                  ) : (
                    <span className="settings-account-avatar-ph" aria-hidden>
                      No photo
                    </span>
                  )}
                </div>
                <div className="settings-account-avatar-actions">
                  <input
                    ref={(el) => {
                      fileRefs.current[pid] = el;
                    }}
                    type="file"
                    accept="image/*"
                    className="visually-hidden"
                    aria-label={`Choose picture for ${a.label}`}
                    onChange={(e) => onAvatarPick(pid, e)}
                  />
                  <button
                    type="button"
                    className="settings-account-btn secondary"
                    disabled={loading}
                    onClick={() => fileRefs.current[pid]?.click()}
                  >
                    {loading ? "Processing…" : "Choose picture…"}
                  </button>
                  {p.avatarDataUrl ? (
                    <button
                      type="button"
                      className="settings-account-btn ghost"
                      disabled={loading}
                      onClick={() => clearAccountAvatar(pid)}
                    >
                      Remove picture
                    </button>
                  ) : null}
                </div>
              </div>
              {accounts.length > 1 ? (
                <button
                  type="button"
                  className="settings-account-btn danger"
                  onClick={() => onRemoveAccount(pid, a.label)}
                >
                  Remove account…
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
