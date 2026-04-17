import { Link } from "react-router-dom";
import FillTimeZoneSettingsForm from "../components/FillTimeZoneSettingsForm";
import ImportGroupingSettingsForm from "../components/ImportGroupingSettingsForm";
import ThemeSchemeControl from "../components/ThemeSchemeControl";

export default function TradeImportSettingsPage() {
  return (
    <div className="settings-standalone-root">
      <div className="settings-standalone-inner">
        <Link to="/" className="settings-standalone-back">
          ← Back to journal
        </Link>
        <p className="settings-standalone-kicker">Settings</p>
        <h1 className="settings-standalone-title">Trade import</h1>
        <p className="settings-standalone-lead">
          These options apply when you import a Schwab / Thinkorswim account statement CSV from the sidebar. Cash TRD
          lines include fees in P&amp;L; fills taken only from Account Trade History omit fee columns in the CSV, so
          those legs can be slightly optimistic versus your statement.
        </p>

        <ThemeSchemeControl className="settings-standalone-theme" />

        <section className="settings-standalone-card" aria-labelledby="fill-times-heading">
          <h2 id="fill-times-heading" className="settings-standalone-card-title">
            Fill timestamps
          </h2>
          <FillTimeZoneSettingsForm />
        </section>

        <section className="settings-standalone-card" aria-labelledby="trade-import-merge-heading">
          <h2 id="trade-import-merge-heading" className="settings-standalone-card-title">
            Trade import auto-merge settings
          </h2>
          <ImportGroupingSettingsForm />
        </section>
      </div>
    </div>
  );
}
