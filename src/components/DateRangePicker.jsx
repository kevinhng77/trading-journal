import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  parseISO,
  isValid,
  startOfDay,
  subDays,
} from "date-fns";
import { dispatchReportFilterDates } from "../lib/reportFilterEvents";

function ymd(d) {
  return format(d, "yyyy-MM-dd");
}

function parseYmd(s) {
  const raw = String(s ?? "").trim();
  if (!raw) return startOfDay(new Date());
  const d = parseISO(`${raw}T12:00:00`);
  return isValid(d) ? startOfDay(d) : startOfDay(new Date());
}

function presetsToday() {
  const t = startOfDay(new Date());
  return { from: t, to: t };
}

function presetsYesterday() {
  const t = subDays(startOfDay(new Date()), 1);
  return { from: t, to: t };
}

function presetsLastDays(n) {
  const end = startOfDay(new Date());
  const start = subDays(end, n - 1);
  return { from: start, to: end };
}

function presetsThisMonth() {
  const now = new Date();
  return { from: startOfMonth(now), to: startOfDay(now) };
}

function presetsLastMonth() {
  const now = new Date();
  const m = subMonths(now, 1);
  return { from: startOfMonth(m), to: endOfMonth(m) };
}

function presetsYtd() {
  const now = new Date();
  const start = startOfDay(new Date(now.getFullYear(), 0, 1));
  return { from: start, to: startOfDay(now) };
}

const PRESETS = [
  { id: "today", label: "Today", fn: presetsToday },
  { id: "yesterday", label: "Yesterday", fn: presetsYesterday },
  { id: "7", label: "Last 7 days", fn: () => presetsLastDays(7) },
  { id: "30", label: "Last 30 days", fn: () => presetsLastDays(30) },
  { id: "90", label: "Last 90 days", fn: () => presetsLastDays(90) },
  { id: "thisM", label: "This month", fn: presetsThisMonth },
  { id: "lastM", label: "Last month", fn: presetsLastMonth },
  { id: "ytd", label: "Year to date", fn: presetsYtd },
];

function buildMonthCells(monthStart) {
  const start = startOfMonth(monthStart);
  const end = endOfMonth(monthStart);
  const pad = start.getDay();
  const days = eachDayOfInterval({ start, end });
  const cells = [];
  for (let i = 0; i < pad; i++) cells.push(null);
  for (const d of days) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function inRange(d, fromStr, toStr) {
  if (!d || !fromStr || !toStr) return false;
  const t = d.getTime();
  return t >= parseYmd(fromStr).getTime() && t <= parseYmd(toStr).getTime();
}

/**
 * Tradervue-style date range: button + modal (presets + two months).
 * @param {{
 *   dateFrom: string,
 *   dateTo: string,
 *   onChange: (r: { dateFrom: string, dateTo: string }) => void,
 *   broadcast?: boolean,
 *   className?: string,
 *   label?: string,
 *   placeholder?: string,
 *   iconOnlyTrigger?: boolean,
 *   triggerAriaLabel?: string,
 *   "aria-labelledby"?: string,
 *   alignPopoverEnd?: boolean,
 *   positionAnchorRef?: import("react").RefObject<HTMLElement | null>,
 *   clampRightBeforeRef?: import("react").RefObject<HTMLElement | null>,
 *   splitCalendarFromLabel?: boolean,
 * }} props
 */
export default function DateRangePicker({
  dateFrom,
  dateTo,
  onChange,
  broadcast = false,
  className = "",
  label = "From – To",
  placeholder,
  iconOnlyTrigger = false,
  triggerAriaLabel,
  "aria-labelledby": ariaLabelledBy,
  /** Anchor popover to the trigger's right edge so it grows left (avoids covering controls to the right, e.g. filter Apply). */
  alignPopoverEnd = false,
  /** Optional: element that includes the field label + trigger — used so “open above” clears the whole field, not just the button. */
  positionAnchorRef = null,
  /** Optional: keep the popover’s right edge left of this element (e.g. strip action buttons). */
  clampRightBeforeRef = null,
  /** Tradervue-style: calendar icon in its own control; date range text in a separate adjacent control (not icon+text in one pill). */
  splitCalendarFromLabel = false,
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => parseYmd(dateFrom));
  const [tempFrom, setTempFrom] = useState(dateFrom);
  const [tempTo, setTempTo] = useState(dateTo);
  const [anchor, setAnchor] = useState(null);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  /** @type {import('react').CSSProperties | undefined} */
  const [popPositionStyle, setPopPositionStyle] = useState(undefined);

  useEffect(() => {
    if (!open) return;
    setTempFrom(dateFrom);
    setTempTo(dateTo);
    setAnchor(null);
    setViewMonth(parseYmd(dateFrom));
  }, [open, dateFrom, dateTo]);

  useLayoutEffect(() => {
    if (!open) {
      setPopPositionStyle(undefined);
      return;
    }
    const margin = 12;
    const gap = 8;

    function measure() {
      const wrap = wrapRef.current;
      const pop = popRef.current;
      const trigger = triggerRef.current;
      if (!wrap || !pop || !trigger) return;

      const tr = trigger.getBoundingClientRect();
      const fieldEl = positionAnchorRef?.current ?? wrap;
      const fr = fieldEl.getBoundingClientRect();

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const clampEl = clampRightBeforeRef?.current;
      const actionsLeft = clampEl ? clampEl.getBoundingClientRect().left : vw - margin;
      /** Horizontal room for the panel (to the left of actions when clamping, else viewport). */
      const availW = clampEl
        ? Math.max(280, Math.floor(actionsLeft - margin - gap))
        : Math.max(280, vw - 2 * margin);

      const pr = pop.getBoundingClientRect();
      let naturalW = pr.width > 8 ? pr.width : pop.offsetWidth;
      if (!naturalW || naturalW < 8) naturalW = Math.min(520, vw - 32);
      /** Hard cap so CSS `min-width` on `.drp-pop` cannot outgrow `left` / clamp math. */
      const capW = Math.floor(Math.min(availW, vw - 2 * margin));
      const w = Math.min(naturalW, capW);

      let h = pr.height > 8 ? pr.height : pop.offsetHeight;
      if (!h || h < 8) h = 380;

      const belowY = tr.bottom + gap;
      const spaceBelow = vh - belowY - margin;
      const spaceAbove = fr.top - margin;

      /** @type {number} */
      let top;
      /** @type {string | undefined} */
      let maxH;
      /** Opening downward vs upward — used so viewport clamp never pulls the panel over the trigger. */
      let preferBelow = true;

      if (h <= spaceBelow) {
        top = belowY;
      } else if (h + gap <= spaceAbove) {
        top = fr.top - gap - h;
        preferBelow = false;
      } else {
        preferBelow = spaceBelow >= spaceAbove;
        const cap = Math.max(160, (preferBelow ? spaceBelow : spaceAbove) - gap);
        maxH = String(cap);
        const boundedH = Math.min(h, cap);
        if (preferBelow) {
          top = belowY;
        } else {
          top = fr.top - gap - boundedH;
        }
      }

      const effH = maxH ? Math.min(h, parseFloat(maxH)) : h;
      const topMax = vh - margin - effH;
      top = Math.max(margin, Math.min(top, topMax));
      if (preferBelow) {
        top = Math.max(belowY, top);
      }

      const maxLeft = clampEl
        ? Math.min(vw - margin - w, actionsLeft - gap - w)
        : vw - margin - w;
      let left;
      if (alignPopoverEnd) {
        const rightLimit = clampEl ? actionsLeft - gap : vw - margin;
        const targetRight = Math.min(tr.right, rightLimit);
        left = targetRight - w;
      } else {
        left = tr.left;
      }
      left = Math.max(margin, Math.min(left, maxLeft));

      const needsHorzScroll = naturalW > capW + 0.5;

      /** @type {import('react').CSSProperties} */
      const style = {
        position: "fixed",
        left,
        top,
        right: "auto",
        bottom: "auto",
        zIndex: 220,
        boxSizing: "border-box",
        maxWidth: `${capW}px`,
        ...(needsHorzScroll ? { overflowX: "auto" } : {}),
        ...(maxH ? { maxHeight: maxH, overflowY: "auto" } : {}),
      };
      setPopPositionStyle(style);
    }
    measure();
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(measure);
    });
    function onReflow() {
      measure();
    }
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, viewMonth, alignPopoverEnd, splitCalendarFromLabel, iconOnlyTrigger]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const labelText = useMemo(() => {
    if (iconOnlyTrigger) return "";
    const fromRaw = String(dateFrom ?? "").trim();
    const toRaw = String(dateTo ?? "").trim();
    if (!fromRaw || !toRaw) {
      return placeholder !== undefined && placeholder !== "" ? placeholder : label;
    }
    try {
      const a = parseYmd(fromRaw);
      const b = parseYmd(toRaw);
      return `${format(a, "MMM d")} – ${format(b, "MMM d, yyyy")}`;
    } catch {
      return placeholder !== undefined && placeholder !== "" ? placeholder : label;
    }
  }, [dateFrom, dateTo, label, placeholder, iconOnlyTrigger]);

  function applyPreset(fn) {
    const { from, to } = fn();
    setTempFrom(ymd(from));
    setTempTo(ymd(to));
    setAnchor(null);
  }

  function onDayClick(d) {
    const day = startOfDay(d);
    if (!anchor) {
      setAnchor(day);
      setTempFrom(ymd(day));
      setTempTo(ymd(day));
      return;
    }
    const a = anchor.getTime();
    const b = day.getTime();
    const lo = a <= b ? anchor : day;
    const hi = a <= b ? day : anchor;
    setTempFrom(ymd(lo));
    setTempTo(ymd(hi));
    setAnchor(null);
  }

  function commit() {
    const from = String(tempFrom ?? "").trim();
    const to = String(tempTo ?? "").trim();
    if (!from || !to) {
      setOpen(false);
      return;
    }
    onChange({ dateFrom: from, dateTo: to });
    if (broadcast) {
      dispatchReportFilterDates({ dateFrom: from, dateTo: to });
    }
    setOpen(false);
  }

  const leftCells = useMemo(() => buildMonthCells(viewMonth), [viewMonth]);
  const rightMonth = addMonths(viewMonth, 1);
  const rightCells = useMemo(() => buildMonthCells(rightMonth), [rightMonth]);

  function renderMonth(title, cells) {
    return (
      <div className="drp-month">
        <div className="drp-month-title">{title}</div>
        <div className="drp-dow">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <span key={d} className="drp-dow-cell">
              {d}
            </span>
          ))}
        </div>
        <div className="drp-grid">
          {cells.map((d, i) => {
            if (!d) return <div key={`e-${i}`} className="drp-cell drp-cell--pad" />;
            const sel = inRange(d, tempFrom, tempTo);
            const isAnchor = anchor && startOfDay(d).getTime() === anchor.getTime();
            return (
              <button
                key={ymd(d)}
                type="button"
                className={`drp-cell ${sel ? "drp-cell--in" : ""} ${isAnchor ? "drp-cell--anchor" : ""}`}
                onClick={() => onDayClick(d)}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const hasDates = Boolean(String(dateFrom ?? "").trim() && String(dateTo ?? "").trim());

  const calendarGlyph = (
    <span className="drp-trigger-icon" aria-hidden>
      <svg
        className="drp-trigger-calendar-svg"
        viewBox="0 0 24 24"
        width="19"
        height="19"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3.5" y="5.5" width="17" height="15" rx="2.25" />
        <path d="M3.5 10.25h17" />
        <path d="M8 3.75v4.25M16 3.75v4.25" />
        <path d="M8 14h2M12 14h2M16 14h2M8 17.5h2M12 17.5h2" opacity="0.45" />
      </svg>
    </span>
  );

  function toggleOpen() {
    setOpen((o) => !o);
  }

  return (
    <div className={`drp-wrap${splitCalendarFromLabel && !iconOnlyTrigger ? " drp-wrap--split" : ""} ${className}`.trim()} ref={wrapRef}>
      {splitCalendarFromLabel && !iconOnlyTrigger ? (
        <div ref={triggerRef} className="drp-split-trigger-row">
          <button
            type="button"
            className="drp-trigger drp-trigger--split-calendar"
            onClick={toggleOpen}
            aria-label={triggerAriaLabel ?? "Open calendar"}
            title={triggerAriaLabel ?? "Open calendar"}
          >
            {calendarGlyph}
          </button>
          <button
            type="button"
            className="drp-trigger drp-trigger--split-label"
            onClick={toggleOpen}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-labelledby={ariaLabelledBy}
          >
            <span className={`drp-trigger-text${!hasDates ? " drp-trigger-text--placeholder" : ""}`}>{labelText}</span>
          </button>
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className={`drp-trigger${iconOnlyTrigger ? " drp-trigger--icon-only" : ""}`}
          onClick={toggleOpen}
          aria-expanded={open}
          aria-label={iconOnlyTrigger ? (triggerAriaLabel ?? label) : undefined}
          aria-labelledby={iconOnlyTrigger ? undefined : ariaLabelledBy}
        >
          {!iconOnlyTrigger ? calendarGlyph : null}
          {iconOnlyTrigger ? (
            <>
              {calendarGlyph}
              <span className="visually-hidden">{triggerAriaLabel ?? label}</span>
            </>
          ) : (
            <span className={`drp-trigger-text${!hasDates ? " drp-trigger-text--placeholder" : ""}`}>{labelText}</span>
          )}
        </button>
      )}
      {open ? (
        <div ref={popRef} className="drp-pop" role="dialog" aria-label="Date range" style={popPositionStyle}>
          <div className="drp-pop-inner">
            <div className="drp-presets">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" className="drp-preset-btn" onClick={() => applyPreset(p.fn)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="drp-cal-area">
              <div className="drp-nav">
                <button type="button" className="drp-nav-btn" onClick={() => setViewMonth((m) => subMonths(m, 1))} aria-label="Previous months">
                  ‹
                </button>
                <button type="button" className="drp-nav-btn" onClick={() => setViewMonth((m) => addMonths(m, 1))} aria-label="Next months">
                  ›
                </button>
              </div>
              <div className="drp-months">
                {renderMonth(format(viewMonth, "MMMM yyyy"), leftCells)}
                {renderMonth(format(rightMonth, "MMMM yyyy"), rightCells)}
              </div>
              <div className="drp-footer">
                <button type="button" className="drp-btn-secondary" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="drp-btn-primary" onClick={commit}>
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
