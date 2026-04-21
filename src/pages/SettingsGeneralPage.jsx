import ThemeSchemeControl from "../components/ThemeSchemeControl";

export default function SettingsGeneralPage() {
  return (
    <>
      <h1 className="settings-layout-panel-h1">General</h1>
      <p className="settings-layout-panel-lead">Core display options for this browser.</p>

      <section className="settings-standalone-card" aria-labelledby="general-heading">
        <h2 id="general-heading" className="settings-standalone-card-title">
          Appearance
        </h2>
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

      <section className="settings-standalone-card" aria-labelledby="das-chart-heading">
        <h2 id="das-chart-heading" className="settings-standalone-card-title">
          DAS-style chart demo
        </h2>
        <p className="settings-layout-panel-lead">
          Full-screen interactive chart (black pane, green axes, blue volume, triangle executions). Uses the same
          engine as trade charts; open in a new window if you like.
        </p>
        <p className="settings-layout-panel-lead">
          <a href="#/chart-das" className="settings-standalone-subpage-link">
            Open TSLA DAS demo
          </a>{" "}
          ·{" "}
          <a href="#/chart-das?date=2025-07-24&amp;symbol=TSLA" className="settings-standalone-subpage-link">
            Example session (2025-07-24)
          </a>
        </p>
      </section>
    </>
  );
}
