import { useEffect, useState } from "react";
import { loadTrades, TRADES_UPDATED_EVENT } from "../storage/storage";

export function useLiveTrades() {
  const [trades, setTrades] = useState(() => loadTrades());
  useEffect(() => {
    const fn = () => setTrades(loadTrades());
    window.addEventListener(TRADES_UPDATED_EVENT, fn);
    return () => window.removeEventListener(TRADES_UPDATED_EVENT, fn);
  }, []);
  return trades;
}
