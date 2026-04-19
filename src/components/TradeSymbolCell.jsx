import { inferOpeningSide } from "../lib/tradeSide";
import { tradeShowsOpenPositionRect } from "../lib/tradeRowUi";

/** @param {{ trade: object }} props */
export default function TradeSymbolCell({ trade }) {
  const side = inferOpeningSide(trade);
  const showOpen = tradeShowsOpenPositionRect(trade);
  return (
    <div className="trade-symbol-cell">
      {showOpen ? (
        <span
          className="trade-open-rect"
          title="Open position: avg entry on remaining size, not flat in these fills"
          aria-label="Open position"
        />
      ) : null}
      <span className="trades-symbol trades-symbol-text">{trade.symbol}</span>
      {side ? (
        <span className={`trade-side-pill trade-side-pill--${side}`} title={side === "long" ? "Long" : "Short"}>
          {side === "long" ? "Long" : "Short"}
        </span>
      ) : null}
    </div>
  );
}
