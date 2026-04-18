import { useMemo } from "react";
import { prepareTradesForReportView } from "../lib/logicalRoundTripTrades.js";
import { useLiveTrades } from "./useLiveTrades";

/**
 * Raw stored trades plus FIFO regrouping across session days for calendar, journal, reports, and
 * merged trade detail. The Trades table should use {@link useLiveTrades} only so row ids match storage.
 */
export function useRawAndReportTrades() {
  const rawTrades = useLiveTrades();
  const reportTrades = useMemo(() => prepareTradesForReportView(rawTrades), [rawTrades]);
  return { rawTrades, reportTrades };
}
