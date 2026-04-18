import { useSyncExternalStore } from "react";
import { ACCOUNT_CHANGED_EVENT, getActiveAccountId } from "../storage/tradingAccounts";

function subscribe(cb) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(ACCOUNT_CHANGED_EVENT, cb);
  return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, cb);
}

/** Current trading account (SCHWB / DAS); updates when user switches in the shell strip. */
export function useActiveAccountId() {
  return useSyncExternalStore(subscribe, getActiveAccountId, () => "schwab");
}
