import { useEffect, useState } from "react";
import { loadTradesForAccount, TRADES_UPDATED_EVENT } from "../storage/storage";

/** Live trades for a specific account bucket (not necessarily the active sidebar account). */
export function useTradesForAccount(accountId) {
  const [trades, setTrades] = useState(() => loadTradesForAccount(accountId));

  useEffect(() => {
    setTrades(loadTradesForAccount(accountId));
  }, [accountId]);

  useEffect(() => {
    const fn = () => setTrades(loadTradesForAccount(accountId));
    window.addEventListener(TRADES_UPDATED_EVENT, fn);
    return () => window.removeEventListener(TRADES_UPDATED_EVENT, fn);
  }, [accountId]);

  return trades;
}
