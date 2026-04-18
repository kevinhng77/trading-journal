import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";

export default function SidebarMoreMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(/** @type {MouseEvent} */ e) {
      const el = wrapRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  return (
    <div className="sidebar-more-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="sidebar-more-menu-btn"
        aria-label="More: settings and import options"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sidebar-more-menu-dots" aria-hidden>
          ···
        </span>
      </button>
      {open ? (
        <div className="import-trades-settings-pop sidebar-more-menu-pop" role="menu">
          <NavLink
            to="/settings"
            className="import-trades-settings-pop-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Settings &amp; theme
          </NavLink>
          <NavLink
            to="/settings/trade-import"
            className="import-trades-settings-pop-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Trade import settings
          </NavLink>
        </div>
      ) : null}
    </div>
  );
}
