import { useMemo, useSyncExternalStore } from "react";
import {
  ACCOUNT_CHANGED_EVENT,
  ACCOUNT_PROFILE_UPDATED_EVENT,
  ACCOUNTS_LIST_CHANGED_EVENT,
  getActiveAccountId,
  getAllAccountProfilesToken,
  getAccountProfile,
  listTradingAccounts,
} from "../storage/tradingAccounts";

function subscribe(/** @type {() => void} */ cb) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(ACCOUNT_CHANGED_EVENT, cb);
  window.addEventListener(ACCOUNT_PROFILE_UPDATED_EVENT, cb);
  window.addEventListener(ACCOUNTS_LIST_CHANGED_EVENT, cb);
  return () => {
    window.removeEventListener(ACCOUNT_CHANGED_EVENT, cb);
    window.removeEventListener(ACCOUNT_PROFILE_UPDATED_EVENT, cb);
    window.removeEventListener(ACCOUNTS_LIST_CHANGED_EVENT, cb);
  };
}

export function useAllAccountProfilesSync() {
  const token = useSyncExternalStore(subscribe, getAllAccountProfilesToken, () =>
    getAllAccountProfilesToken(),
  );
  return useMemo(() => {
    const active = getActiveAccountId();
    return {
      active,
      accounts: listTradingAccounts().map((a) => ({
        ...a,
        profile: getAccountProfile(a.id),
      })),
    };
  }, [token]);
}
