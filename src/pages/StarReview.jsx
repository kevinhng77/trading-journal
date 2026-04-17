import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLiveTrades } from "../hooks/useLiveTrades";
import { useStarred } from "../hooks/useStarred";
import { stableTradeId } from "../storage/tradeLookup";
import { formatDisplayDate, formatMoney, pnlClass } from "../storage/storage";
import { tradeNetPnl } from "../lib/tradeExecutionMetrics";
import { toggleStarredTrade } from "../storage/starredItems";

export default function StarReview() {
  const trades = useLiveTrades();
  const { starredDays, starredTrades } = useStarred();

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

  return (
    <div className="page-wrap star-review-page">
      <div className="page-header star-review-header">
        <div>
          <h1>Starred</h1>
          <p className="star-review-intro">
            Journal days and trades you marked with ★. Use this view for quick review.
          </p>
        </div>
      </div>

      {empty ? (
        <div className="card star-review-empty">
          <p>
            Nothing starred yet. On <Link to="/journal">Journal</Link>, star a day; on{" "}
            <Link to="/trades">Trades</Link> or a trade page, use the star column or header control.
          </p>
        </div>
      ) : (
        <div className="star-review-columns">
          {sortedStarDays.length > 0 ? (
            <section className="card star-review-section">
              <h2 className="star-review-section-title">Starred days</h2>
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
            </section>
          ) : null}

          {sortedStarTradeIds.length > 0 ? (
            <section className="card star-review-section">
              <h2 className="star-review-section-title">Starred trades</h2>
              <ul className="star-review-list star-review-list--trades">
                {sortedStarTradeIds.map((id) => {
                  const t = tradeById.get(id);
                  if (t) {
                    const pnl = tradeNetPnl(t);
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
                      <span className="star-review-orphan-id" title="Trade no longer in imported data">
                        {id}
                      </span>
                      <button
                        type="button"
                        className="star-review-unstar-orphan"
                        onClick={() => {
                          toggleStarredTrade(id);
                        }}
                      >
                        Remove ★
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
