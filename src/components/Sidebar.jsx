import { Link, NavLink } from "react-router-dom";
import ImportTradesButton from "./ImportTradesButton";
import SidebarAccountRow from "./SidebarAccountRow";

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
        <div className="sidebar-footer-import-block">
          <ImportTradesButton />
        </div>
        <div className="sidebar-footer-divider" aria-hidden />
        <SidebarAccountRow />
      </div>
    </aside>
  );
}

export default Sidebar;
