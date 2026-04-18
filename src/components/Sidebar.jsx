import { Link, NavLink } from "react-router-dom";
import ImportTradesButton from "./ImportTradesButton";

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden>
      <svg viewBox="0 0 24 24" className="brand-mark-svg" fill="currentColor">
        <path d="M14.2 1.25 4.75 14.4h5.35L6.8 22.75 19.25 9.05h-5.1L17.45 1.25h-3.25z" />
      </svg>
    </span>
  );
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <Link to="/" className="brand-link" aria-label="Goatedvue dashboard">
          <BrandMark />
          <span className="brand-title">
            <span className="brand-title-base">Goatedvue</span>
          </span>
        </Link>
      </div>

      <nav className="sidebar-nav" aria-label="Main">
        <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          Dashboard
        </NavLink>

        <NavLink
          to="/reports/calendar"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          Calendar
        </NavLink>

        <NavLink
          to="/reports"
          end
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          Reports
        </NavLink>

        <NavLink
          to="/trades"
          end
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          Trades
        </NavLink>

        <NavLink to="/journal" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          Journal
        </NavLink>

        <NavLink to="/playbook" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          Playbook
        </NavLink>

        <NavLink
          to="/star"
          className={({ isActive }) => `nav-link nav-link--star ${isActive ? "active" : ""}`}
          title="Starred days and trades for review"
        >
          *
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <NavLink
          to="/settings"
          className={({ isActive }) => `sidebar-settings-link ${isActive ? "active" : ""}`}
          title="Theme, appearance, and trade import settings"
        >
          <span className="sidebar-settings-link-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </span>
          <span>Settings</span>
        </NavLink>
        <ImportTradesButton />
      </div>
    </aside>
  );
}

export default Sidebar;
