import { useCallback, useEffect, useState } from "react";
import {
  loadStarredDaysForAccount,
  loadStarredTradeIdsForAccount,
  STARS_CHANGED_EVENT,
} from "../storage/starredItems";

/** Starred days + trade ids for a specific account bucket; refreshes on star changes. */
export function useStarredForAccount(accountId) {
  const [daySet, setDaySet] = useState(() => loadStarredDaysForAccount(accountId));
  const [tradeSet, setTradeSet] = useState(() => loadStarredTradeIdsForAccount(accountId));

  const refresh = useCallback(() => {
    setDaySet(loadStarredDaysForAccount(accountId));
    setTradeSet(loadStarredTradeIdsForAccount(accountId));
  }, [accountId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    window.addEventListener(STARS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(STARS_CHANGED_EVENT, refresh);
  }, [refresh]);

  return {
    starredDays: daySet,
    starredTrades: tradeSet,
    refresh,
  };
}
