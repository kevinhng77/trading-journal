import { Link } from "react-router-dom";
import FillTimeZoneSettingsForm from "../components/FillTimeZoneSettingsForm";
import ImportGroupingSettingsForm from "../components/ImportGroupingSettingsForm";

export default function TradeImportSettingsPage() {
  return (
    <div className="settings-standalone-root">
      <div className="settings-standalone-inner">
        <Link to="/settings" className="settings-standalone-back">
          ← Back to settings
        </Link>
        <p className="settings-standalone-kicker">Settings</p>
        <h1 className="settings-standalone-title">Trade import</h1>
        <p className="settings-standalone-lead">
          Imports read <strong>TRD</strong> rows with <strong>BOT</strong> / <strong>SOLD</strong> descriptions only:
          stored trade P&amp;L sums the <strong>AMOUNT</strong> column (Schwab / TOS symbol grids); misc and commission
          stay on each fill for fees and for cash-impact on the trade page. The parser uses the Cash Balance
          section when present, otherwise scans the whole file for the same column shape. If nothing matches, you need
          a statement that includes those TRD lines (Account Trade History alone is not used unless you switch the
          parser to <code>cashTrdPlusAth</code> in code).
        </p>

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
