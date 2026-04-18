import { useEffect, useState } from "react";
import { loadTrades, TRADES_UPDATED_EVENT } from "../storage/storage";
import { ACCOUNT_CHANGED_EVENT } from "../storage/tradingAccounts";

export function useLiveTrades() {
  const [trades, setTrades] = useState(() => loadTrades());
  useEffect(() => {
    const fn = () => setTrades(loadTrades());
    window.addEventListener(TRADES_UPDATED_EVENT, fn);
    window.addEventListener(ACCOUNT_CHANGED_EVENT, fn);
    return () => {
      window.removeEventListener(TRADES_UPDATED_EVENT, fn);
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, fn);
    };
  }, []);
  return trades;
}
