import { useCallback, useEffect, useMemo, useState } from "react";
import { useActiveAccountId } from "../hooks/useActiveAccountId";
import { useLiveTrades } from "../hooks/useLiveTrades";
import { tradeSignedAmountForAggregation } from "../lib/tradeExecutionMetrics";
import { formatMoney, pnlClass } from "../storage/storage";
import {
  loadBalanceTable,
  saveBalanceTable,
  isBalanceRowEmpty,
} from "../storage/accountBalanceTable";

const MONTH_KEYS_COUNT = 36;

/** @returns {string[]} YYYY-MM newest first */
function rollingMonthKeys(count) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    out.push(`${y}-${m}`);
  }
  return out;
}

/** @param {string} monthKey */
function formatMonthHeading(monthKey) {
  const d = new Date(`${monthKey}-01T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/** @param {string} raw */
function parseMoneyInput(raw) {
  const t = String(raw).trim();
  if (t === "") return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** @param {number | null | undefined} n */
function inputValueForNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return String(n);
}

/**
 * @param {import("../storage/accountBalanceTable").AccountBalanceTable} table
 * @param {string} month
 * @param {import("../storage/accountBalanceTable").AccountBalanceMonthRow} patch
 */
function mergeMonth(table, month, patch) {
  const prev = table[month] || {};
  const nextRow = { ...prev, ...patch };
  if (!nextRow.recordOpening) {
    nextRow.startBalance = null;
  }
  const next = { ...table, [month]: nextRow };
  if (isBalanceRowEmpty(nextRow)) {
    delete next[month];
  }
  return next;
}

/** @param {unknown[]} trades @param {string} monthKey */
function sumTradePnlForMonth(trades, monthKey) {
  return trades.reduce((sum, t) => {
    const d = typeof t?.date === "string" ? t.date : "";
    if (d.slice(0, 7) !== monthKey) return sum;
    return sum + tradeSignedAmountForAggregation(t);
  }, 0);
}

export default function AccountBalancePage() {
  const activeAccountId = useActiveAccountId();
  const trades = useLiveTrades();
  const monthKeys = useMemo(() => rollingMonthKeys(MONTH_KEYS_COUNT), []);
  const [table, setTable] = useState(() => loadBalanceTable(activeAccountId));

  useEffect(() => {
    setTable(loadBalanceTable(activeAccountId));
  }, [activeAccountId]);

  const applyMonthPatch = useCallback(
    (month, patch) => {
      setTable((prev) => {
        const next = mergeMonth(prev, month, patch);
        saveBalanceTable(activeAccountId, next);
        return next;
      });
    },
    [activeAccountId],
  );

  const onNumberBlur = useCallback(
    (month, field, raw) => {
      const parsed = parseMoneyInput(raw);
      applyMonthPatch(month, { [field]: parsed });
    },
    [applyMonthPatch],
  );

  const onToggleOpening = useCallback(
    (month, checked) => {
      applyMonthPatch(month, {
        recordOpening: checked,
        ...(checked ? {} : { startBalance: null }),
      });
    },
    [applyMonthPatch],
  );

  const onFillPnlFromTrades = useCallback(
    (month) => {
      const pnl = sumTradePnlForMonth(trades, month);
      applyMonthPatch(month, { pnl });
    },
    [trades, applyMonthPatch],
  );

  return (
    <div className="page-wrap account-balance-page">
      <header className="page-header account-balance-page-header">
        <div>
          <h1>Account balance</h1>
          <p className="account-balance-lead">
            Monthly ledger for the active journal account: P&amp;L, optional opening balance when you start a new
            period, ending balance, and wire withdrawals. Stored only in this browser.
          </p>
        </div>
      </header>

      <div className="card table-card account-balance-card">
        <div className="account-balance-table-wrap">
          <table className="account-balance-table">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">P&amp;L</th>
                <th scope="col" className="account-balance-th-narrow" title="Use when you set a new opening balance">
                  New opening
                </th>
                <th scope="col">Starting balance</th>
                <th scope="col">Ending balance</th>
                <th scope="col">Wire out</th>
                <th scope="col" className="account-balance-th-actions">
                  Trades
                </th>
              </tr>
            </thead>
            <tbody>
              {monthKeys.map((month) => {
                const row = table[month] || {};
                const pnl = row.pnl;
                const tradeSum = sumTradePnlForMonth(trades, month);
                const recordOpening = Boolean(row.recordOpening);
                return (
                  <tr key={month}>
                    <td className="account-balance-month">{formatMonthHeading(month)}</td>
                    <td>
                      <input
                        className="account-balance-input"
                        type="text"
                        inputMode="decimal"
                        defaultValue={inputValueForNumber(pnl ?? null)}
                        key={`${month}-pnl-${pnl ?? "x"}`}
                        aria-label={`P and L ${formatMonthHeading(month)}`}
                        onBlur={(e) => onNumberBlur(month, "pnl", e.target.value)}
                      />
                      {tradeSum !== 0 && (
                        <div className={`account-balance-hint ${pnlClass(tradeSum)}`}>
                          From trades: {formatMoney(tradeSum)}
                        </div>
                      )}
                    </td>
                    <td className="account-balance-td-center">
                      <input
                        type="checkbox"
                        className="account-balance-checkbox"
                        checked={recordOpening}
                        onChange={(e) => onToggleOpening(month, e.target.checked)}
                        aria-label={`New opening balance for ${formatMonthHeading(month)}`}
                      />
                    </td>
                    <td>
                      <input
                        className="account-balance-input"
                        type="text"
                        inputMode="decimal"
                        disabled={!recordOpening}
                        defaultValue={inputValueForNumber(row.startBalance ?? null)}
                        key={`${month}-start-${row.startBalance ?? "x"}-${recordOpening}`}
                        aria-label={`Starting balance ${formatMonthHeading(month)}`}
                        onBlur={(e) => onNumberBlur(month, "startBalance", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="account-balance-input"
                        type="text"
                        inputMode="decimal"
                        defaultValue={inputValueForNumber(row.endBalance ?? null)}
                        key={`${month}-end-${row.endBalance ?? "x"}`}
                        aria-label={`Ending balance ${formatMonthHeading(month)}`}
                        onBlur={(e) => onNumberBlur(month, "endBalance", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="account-balance-input"
                        type="text"
                        inputMode="decimal"
                        defaultValue={inputValueForNumber(row.wireOut ?? null)}
                        key={`${month}-wire-${row.wireOut ?? "x"}`}
                        aria-label={`Wire out ${formatMonthHeading(month)}`}
                        onBlur={(e) => onNumberBlur(month, "wireOut", e.target.value)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="account-balance-fill-btn"
                        onClick={() => onFillPnlFromTrades(month)}
                      >
                        Use trade P&amp;L
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
