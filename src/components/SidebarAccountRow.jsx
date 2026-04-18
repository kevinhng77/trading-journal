import { useEffect, useRef, useState } from "react";
import {
  getAccountProfile,
  getResolvedAccountDisplayName,
  listTradingAccounts,
  setActiveAccountId,
} from "../storage/tradingAccounts";
import { useTradingAccountDisplay } from "../hooks/useTradingAccountDisplay";
import SidebarMoreMenu from "./SidebarMoreMenu";

function AccountAvatar({ dataUrl }) {
  return (
    <span className="sidebar-account-avatar">
      {dataUrl ? (
        <img src={dataUrl} alt="" className="sidebar-account-avatar-img" decoding="async" />
      ) : (
        <svg className="sidebar-account-avatar-placeholder" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
          />
        </svg>
      )}
    </span>
  );
}

export default function SidebarAccountRow() {
  const { active, primaryName, brokerLabel, avatarDataUrl } = useTradingAccountDisplay();
  const [pickerOpen, setPickerOpen] = useState(false);
  const rowRef = useRef(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function onDocMouseDown(/** @type {MouseEvent} */ e) {
      const el = rowRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [pickerOpen]);

  const accounts = listTradingAccounts();

  return (
    <div className="sidebar-footer-account-row" ref={rowRef}>
      <button
        type="button"
        className="sidebar-account-block"
        aria-expanded={pickerOpen}
        aria-haspopup="listbox"
        aria-label={`Trading account: ${primaryName}. Choose account.`}
        onClick={() => setPickerOpen((v) => !v)}
      >
        <AccountAvatar dataUrl={avatarDataUrl} />
        <span className="sidebar-account-text">
          <span className="sidebar-account-name">{primaryName}</span>
          <span className="sidebar-account-sub">{brokerLabel}</span>
        </span>
      </button>
      <SidebarMoreMenu />
      {pickerOpen ? (
        <div className="sidebar-account-picker" role="listbox" aria-label="Choose trading account">
          {accounts.map((a) => {
            const p = getAccountProfile(a.id);
            const name = getResolvedAccountDisplayName(a.id);
            const selected = a.id === active;
            return (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`sidebar-account-picker-item ${selected ? "is-active" : ""}`}
                onClick={() => {
                  setActiveAccountId(a.id);
                  setPickerOpen(false);
                }}
              >
                <AccountAvatar dataUrl={p.avatarDataUrl} />
                <span className="sidebar-account-picker-text">
                  <span className="sidebar-account-picker-name">{name}</span>
                  <span className="sidebar-account-picker-sub">{a.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
