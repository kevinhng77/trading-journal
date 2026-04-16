import { Link } from "react-router-dom";

/** Tradervue-style “Advanced” — deep slices live on Detailed. */
export default function ReportsAdvancedTab() {
  return (
    <div className="card reports-advanced-card">
      <h2 className="reports-advanced-title">Advanced</h2>
      <p className="reports-advanced-body">
        In Tradervue, <strong>Advanced</strong> opens extra dimensions (liquidity, setups, custom fields). Here, use{" "}
        <Link to="/reports/detailed">Detailed</Link> for hold time, duration, hour/month buckets, Kelly, SQN, and replay
        MFE/MAE.
      </p>
    </div>
  );
}
