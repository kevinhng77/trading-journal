import { Link } from "react-router-dom";
import ThemeSchemeControl from "../components/ThemeSchemeControl";

export default function SettingsPage() {
  return (
    <div className="settings-standalone-root">
      <div className="settings-standalone-inner">
        <Link to="/" className="settings-standalone-back">
          ← Back to journal
        </Link>
        <p className="settings-standalone-kicker">Settings</p>
        <h1 className="settings-standalone-title">Settings</h1>
        <p className="settings-standalone-lead">
          Appearance and import options. Changes apply immediately and are stored in this browser.
        </p>

        <section className="settings-standalone-card" aria-labelledby="appearance-heading">
          <h2 id="appearance-heading" className="settings-standalone-card-title">
            Appearance
          </h2>
          <p className="settings-standalone-section-lead">Color scheme for the whole app (including this page).</p>
          <ThemeSchemeControl className="settings-standalone-theme" />
        </section>

        <section className="settings-standalone-card" aria-labelledby="trade-import-nav-heading">
          <h2 id="trade-import-nav-heading" className="settings-standalone-card-title">
            Trade import
          </h2>
          <p className="settings-standalone-section-lead">
            Fill timestamps, time zone handling, and how rows merge when you re-import CSVs from the sidebar.
          </p>
          <Link className="settings-standalone-subpage-link" to="/settings/trade-import">
            Open trade import settings →
          </Link>
        </section>
      </div>
    </div>
  );
}
