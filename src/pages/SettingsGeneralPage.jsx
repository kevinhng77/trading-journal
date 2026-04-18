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
    </>
  );
}
