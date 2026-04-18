import { useCallback, useEffect, useState } from "react";
import {
  loadStarredDays,
  loadStarredTradeIds,
  STARS_CHANGED_EVENT,
  toggleStarredDay,
  toggleStarredTrade,
} from "../storage/starredItems";
import { ACCOUNT_CHANGED_EVENT } from "../storage/tradingAccounts";

/** Live starred days + trade ids from localStorage; updates on {@link STARS_CHANGED_EVENT}. */
export function useStarred() {
  const [daySet, setDaySet] = useState(loadStarredDays);
  const [tradeSet, setTradeSet] = useState(loadStarredTradeIds);

  const refresh = useCallback(() => {
    setDaySet(loadStarredDays());
    setTradeSet(loadStarredTradeIds());
  }, []);

  useEffect(() => {
    window.addEventListener(STARS_CHANGED_EVENT, refresh);
    window.addEventListener(ACCOUNT_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(STARS_CHANGED_EVENT, refresh);
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  const flipDay = useCallback((date) => {
    toggleStarredDay(date);
  }, []);

  const flipTrade = useCallback((id) => {
    toggleStarredTrade(id);
  }, []);

  return {
    starredDays: daySet,
    starredTrades: tradeSet,
    isDayStarred: (d) => daySet.has(d),
    isTradeStarred: (id) => tradeSet.has(id),
    toggleDay: flipDay,
    toggleTrade: flipTrade,
    refresh,
  };
}
