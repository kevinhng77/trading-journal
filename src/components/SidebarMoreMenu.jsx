import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";

export default function SidebarMoreMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(/** @type {MouseEvent} */ e) {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (wrapRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(/** @type {KeyboardEvent} */ e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const menu =
    open && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        className="import-trades-settings-pop sidebar-more-menu-pop sidebar-more-menu-pop--portal"
        role="menu"
      >
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
    ) : null;

  return (
    <div className="sidebar-more-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="sidebar-more-menu-btn"
        aria-label="Settings and import"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <svg className="sidebar-more-menu-kebab" viewBox="0 0 4 16" width="4" height="16" aria-hidden>
          <circle cx="2" cy="2" r="1.35" fill="currentColor" />
          <circle cx="2" cy="8" r="1.35" fill="currentColor" />
          <circle cx="2" cy="14" r="1.35" fill="currentColor" />
        </svg>
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
