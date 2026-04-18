import { useMemo, useSyncExternalStore } from "react";
import {
  ACCOUNT_CHANGED_EVENT,
  ACCOUNT_PROFILE_UPDATED_EVENT,
  getTradingAccountDisplayToken,
  TRADING_ACCOUNTS,
} from "../storage/tradingAccounts";

function subscribe(/** @type {() => void} */ cb) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(ACCOUNT_CHANGED_EVENT, cb);
  window.addEventListener(ACCOUNT_PROFILE_UPDATED_EVENT, cb);
  return () => {
    window.removeEventListener(ACCOUNT_CHANGED_EVENT, cb);
    window.removeEventListener(ACCOUNT_PROFILE_UPDATED_EVENT, cb);
  };
}

const SSR_SNAPSHOT = "schwab\u001e\u001e\u001eSCHWB";

export function useTradingAccountDisplay() {
  const token = useSyncExternalStore(subscribe, getTradingAccountDisplayToken, () => SSR_SNAPSHOT);
  return useMemo(() => {
    const parts = token.split("\u001e");
    const active = parts[0] || "schwab";
    const customName = parts[1] || "";
    const avatarDataUrl = parts[2] || "";
    const def = TRADING_ACCOUNTS.find((a) => a.id === active);
    const brokerLabel = def?.label || active;
    const primaryName = customName || brokerLabel;
    return {
      active,
      primaryName,
      brokerLabel,
      avatarDataUrl,
    };
  }, [token]);
}
