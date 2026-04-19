import { Link, NavLink, useLocation } from "react-router-dom";
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
  const { pathname } = useLocation();
  /** Highlight Reports for every reports sub-route except the calendar (sidebar Calendar owns that). */
  const reportsSidebarActive = pathname.startsWith("/reports") && pathname !== "/reports/calendar";

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

        <Link
          to="/reports"
          className={`nav-link ${reportsSidebarActive ? "active" : ""}`}
          aria-current={reportsSidebarActive ? "page" : undefined}
        >
          Reports
        </Link>

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
          aria-label="Starred"
        >
          <svg className="nav-link-star-svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
            />
          </svg>
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
