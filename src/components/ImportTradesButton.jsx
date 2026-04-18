import { Link } from "react-router-dom";

export default function ImportTradesButton() {
  return (
    <div className="import-trades-wrap">
      <Link to="/settings/trade-import" className="import-btn import-btn--nav">
        Import Trades
      </Link>
    </div>
  );
}
