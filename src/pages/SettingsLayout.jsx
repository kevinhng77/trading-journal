import { Link, NavLink, Outlet } from "react-router-dom";

function navClass({ isActive }) {
  return `settings-layout-nav-link${isActive ? " is-active" : ""}`;
}

export default function SettingsLayout() {
  return (
    <div className="settings-standalone-root">
      <div className="settings-standalone-inner settings-standalone-inner--layout">
        <Link to="/" className="settings-standalone-back">
          ← Back to journal
        </Link>
        <p className="settings-standalone-kicker">Settings</p>
        <p className="settings-layout-top-lead">
          Appearance, account labels, and import options. Changes apply immediately and are stored in this browser.
        </p>

        <div className="settings-layout-shell">
          <nav className="settings-layout-nav" aria-label="Settings sections">
            <div className="settings-layout-nav-head">Sections</div>
            <NavLink to="general" className={navClass} end>
              General
            </NavLink>
            <NavLink to="trade-import" className={navClass}>
              Trade import
            </NavLink>
            <NavLink to="trading-account" className={navClass}>
              Trading account
            </NavLink>
          </nav>
          <div className="settings-layout-main">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
