import { useLiveTrades } from "./useLiveTrades";

/**
 * Calendar, journal, reports, and trade detail use each stored trade row as imported (TRD session
 * `date` + `pnl`). The Trades table uses {@link useLiveTrades} only so row ids match storage.
 */
export function useRawAndReportTrades() {
  const rawTrades = useLiveTrades();
  return { rawTrades, reportTrades: rawTrades };
}
