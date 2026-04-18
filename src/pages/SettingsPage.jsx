import { Link } from "react-router-dom";
import ThemeSchemeControl from "../components/ThemeSchemeControl";
import SettingsAccountsSection from "../components/SettingsAccountsSection";

export default function SettingsPage() {
  return (
    <div className="settings-standalone-root">
      <div className="settings-standalone-inner settings-standalone-inner--wide">
        <Link to="/" className="settings-standalone-back">
          ← Back to journal
        </Link>
        <p className="settings-standalone-kicker">Settings</p>
        <h1 className="settings-standalone-title">Settings</h1>
        <p className="settings-standalone-lead">
          Appearance, account labels, and import options. Changes apply immediately and are stored in
          this browser.
        </p>

        <div className="settings-standalone-two-col">
          <div className="settings-standalone-col">
            <section className="settings-standalone-card" aria-labelledby="general-heading">
              <h2 id="general-heading" className="settings-standalone-card-title">
                General
              </h2>
              <p className="settings-standalone-section-lead">
                Core display options. Open the full settings page from the sidebar ⋮ menu anytime.
              </p>
              <table className="settings-kv-table">
                <tbody>
                  <tr>
                    <th scope="row">Color scheme</th>
                    <td>
                      <ThemeSchemeControl className="settings-standalone-theme" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="settings-standalone-card" aria-labelledby="trade-import-nav-heading">
              <h2 id="trade-import-nav-heading" className="settings-standalone-card-title">
                Trade import
              </h2>
              <p className="settings-standalone-section-lead">
                Fill timestamps, time zone handling, and how rows merge when you re-import CSVs from the
                sidebar.
              </p>
              <table className="settings-kv-table">
                <tbody>
                  <tr>
                    <th scope="row">Import options</th>
                    <td>
                      <Link className="settings-standalone-subpage-link" to="/settings/trade-import">
                        Open trade import settings →
                      </Link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>

          <div className="settings-standalone-col settings-standalone-col--accounts">
            <SettingsAccountsSection />
          </div>
        </div>
      </div>
    </div>
  );
}
