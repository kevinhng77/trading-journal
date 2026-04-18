import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import ThemeSchemeControl from "./ThemeSchemeControl";

function IconGear({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function IconPalette({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="currentColor">
      <path d="M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 12 8 11.33 8 10.5S8.67 9 9.5 9s1.5.67 1.5 1.5S10.33 12 9.5 12zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 9 14.5 9s1.5.67 1.5 1.5S15.33 12 14.5 12zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 15 17.5 15s1.5.67 1.5 1.5S18.33 18 17.5 18z" />
    </svg>
  );
}

export default function SidebarMoreMenu() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);

  const placeMenu = useCallback(() => {
    const wrap = wrapRef.current;
    const menu = menuRef.current;
    const btn = wrap?.querySelector("button");
    if (!wrap || !menu || !btn) return;
    const rect = btn.getBoundingClientRect();
    const mw = menu.offsetWidth || 260;
    const mh = menu.offsetHeight || 120;
    const pad = 10;
    let left = rect.right - mw;
    left = Math.max(pad, Math.min(left, window.innerWidth - mw - pad));
    let top = rect.top - pad - mh;
    if (top < pad) top = rect.bottom + pad;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    placeMenu();
    const id = requestAnimationFrame(() => {
      placeMenu();
      setVisible(true);
    });
    return () => cancelAnimationFrame(id);
  }, [open, placeMenu]);

  useEffect(() => {
    if (!open) return;
    function onWin() {
      placeMenu();
    }
    window.addEventListener("resize", onWin);
    const menu = menuRef.current;
    const ro = menu ? new ResizeObserver(placeMenu) : null;
    if (menu) ro?.observe(menu);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
      ro?.disconnect();
    };
  }, [open, placeMenu]);

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
        className="sidebar-settings-popover"
        style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}
        role="menu"
        aria-label="Quick menu"
      >
        <NavLink
          to="/import-trades"
          className="sidebar-settings-popover__item"
          role="menuitem"
          onClick={() => setOpen(false)}
        >
          <IconGear className="sidebar-settings-popover__icon" />
          <span className="sidebar-settings-popover__label">Trade Settings</span>
        </NavLink>
        <div className="sidebar-settings-popover__theme" role="group" aria-label="Color theme">
          <span className="sidebar-settings-popover__theme-left">
            <IconPalette className="sidebar-settings-popover__icon" />
            <span className="sidebar-settings-popover__label">Theme</span>
          </span>
          <ThemeSchemeControl className="sidebar-settings-popover__theme-control" showLabel={false} />
        </div>
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
