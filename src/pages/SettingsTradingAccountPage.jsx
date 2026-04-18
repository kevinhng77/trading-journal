import SettingsAccountsSection from "../components/SettingsAccountsSection";

export default function SettingsTradingAccountPage() {
  return (
    <>
      <h1 className="settings-layout-panel-h1">Trading account</h1>
      <p className="settings-layout-panel-lead">
        Names and pictures are only for this browser—they help you tell accounts apart. Imports and trade data stay in
        each account&apos;s bucket.
      </p>
      <SettingsAccountsSection />
    </>
  );
}
