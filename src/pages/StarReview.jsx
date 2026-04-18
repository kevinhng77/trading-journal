import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStarredForAccount } from "../hooks/useStarredForAccount";
import { useTradesForAccount } from "../hooks/useTradesForAccount";
import { stableTradeId } from "../storage/tradeLookup";
import { formatDisplayDate, formatMoney, pnlClass } from "../storage/storage";
import { tradeSignedAmountForAggregation } from "../lib/tradeExecutionMetrics";
import { toggleStarredTrade } from "../storage/starredItems";
import {
  ACCOUNT_CHANGED_EVENT,
  ACCOUNTS_LIST_CHANGED_EVENT,
  getActiveAccountId,
  listTradingAccounts,
} from "../storage/tradingAccounts";

export default function StarReview() {
  const [viewAccountId, setViewAccountId] = useState(() => getActiveAccountId());
  const accounts = listTradingAccounts();

  useEffect(() => {
    function onAccount() {
      setViewAccountId(getActiveAccountId());
    }
    function onList() {
      const list = listTradingAccounts();
      if (!list.some((a) => a.id === viewAccountId)) {
        setViewAccountId(list[0]?.id ?? getActiveAccountId());
      }
    }
    window.addEventListener(ACCOUNT_CHANGED_EVENT, onAccount);
    window.addEventListener(ACCOUNTS_LIST_CHANGED_EVENT, onList);
    return () => {
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, onAccount);
      window.removeEventListener(ACCOUNTS_LIST_CHANGED_EVENT, onList);
    };
  }, [viewAccountId]);

  const trades = useTradesForAccount(viewAccountId);
  const { starredDays, starredTrades } = useStarredForAccount(viewAccountId);

  const tradeById = useMemo(() => {
    const m = new Map();
    for (const t of trades) {
      m.set(stableTradeId(t), t);
    }
    return m;
  }, [trades]);

  const sortedStarDays = useMemo(
    () => [...starredDays].sort((a, b) => b.localeCompare(a)),
    [starredDays],
  );

  const sortedStarTradeIds = useMemo(
    () => [...starredTrades].sort(),
    [starredTrades],
  );

  const empty = sortedStarDays.length === 0 && sortedStarTradeIds.length === 0;
  const viewLabel = accounts.find((a) => a.id === viewAccountId)?.label ?? viewAccountId;

  return (
    <div className="page-wrap star-review-page">
      <div className="page-header star-review-header">
        <div>
          <h1>Starred</h1>
          <p className="star-review-intro">
            Journal days and trades you marked with a star. Use this view for quick review. Stars are stored per account
            bucket; the menu below matches the sidebar account when you switch accounts.
          </p>
        </div>
        <label className="star-review-account-control">
          <span className="star-review-account-label">Account</span>
          <select
            className="star-review-account-select"
            value={viewAccountId}
            onChange={(e) => setViewAccountId(e.target.value)}
            aria-label="Which account’s starred items to show"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!empty ? (
        <p className="star-review-viewing" aria-live="polite">
          Showing starred items for <strong>{viewLabel}</strong>
        </p>
      ) : null}

      {empty ? (
        <div className="card star-review-empty">
          <p>
            Nothing starred for <strong>{viewLabel}</strong> yet. On <Link to="/journal">Journal</Link>, star a day;
            on <Link to="/trades">Trades</Link> or a trade page, use the star column or header control (while that
            account is active in the sidebar).
          </p>
        </div>
      ) : (
        <div className="star-review-columns">
          <section className="card star-review-section">
            <h2 className="star-review-section-title">Starred days</h2>
            {sortedStarDays.length > 0 ? (
              <ul className="star-review-list">
                {sortedStarDays.map((date) => (
                  <li key={date}>
                    <Link className="star-review-link" to={`/journal?date=${encodeURIComponent(date)}`}>
                      {formatDisplayDate(date)}
                    </Link>
                    <span className="star-review-meta">{date}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="star-review-section-empty">No starred journal days for this account yet.</p>
            )}
          </section>

          <section className="card star-review-section">
            <h2 className="star-review-section-title">Starred trades</h2>
            {sortedStarTradeIds.length > 0 ? (
              <ul className="star-review-list star-review-list--trades">
                {sortedStarTradeIds.map((id) => {
                  const t = tradeById.get(id);
                  if (t) {
                    const pnl = tradeSignedAmountForAggregation(t);
                    return (
                      <li key={id} className="star-review-trade-row">
                        <Link className="star-review-link" to={`/trades/${encodeURIComponent(id)}`}>
                          <span className="star-review-trade-sym">{t.symbol}</span>
                          <span className="star-review-meta">{t.date}</span>
                          <span className={`star-review-pnl ${pnlClass(pnl)}`}>{formatMoney(pnl)}</span>
                        </Link>
                      </li>
                    );
                  }
                  return (
                    <li key={id} className="star-review-trade-row star-review-trade-row--orphan">
                      <span className="star-review-orphan-id" title="Trade no longer in this account’s imported data">
                        {id}
                      </span>
                      <button
                        type="button"
                        className="star-review-unstar-orphan"
                        onClick={() => {
                          toggleStarredTrade(id, viewAccountId);
                        }}
                      >
                        Remove ★
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="star-review-section-empty">No starred trades for this account yet.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
