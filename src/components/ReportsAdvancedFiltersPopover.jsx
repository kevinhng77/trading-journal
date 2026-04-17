import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { DEFAULT_REPORT_FILTERS } from "../lib/reportFilters";

function IconLock() {
  return (
    <svg className="reports-adv-lock-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M11 7V5a3 3 0 0 0-6 0v2H4v7h8V7h-1zm-1 0H6V5a2 2 0 1 1 4 0v2z"
        opacity="0.85"
      />
    </svg>
  );
}

/** @param {{ label: string; children: import("react").ReactNode }} props */
function AdvRow({ label, children }) {
  return (
    <div className="reports-adv-row">
      <span className="reports-adv-row-label">{label}</span>
      <div className="reports-adv-row-controls">{children}</div>
    </div>
  );
}

/** @param {{ title: string }} props */
function AdvSection({ title, children }) {
  return (
    <details className="reports-adv-section" open>
      <summary className="reports-adv-section-summary">{title}</summary>
      <div className="reports-adv-section-body">{children}</div>
    </details>
  );
}

/**
 * @param {{ title: string }} props
 */
function AdvSectionLocked({ title, children }) {
  return (
    <details className="reports-adv-section reports-adv-section--muted">
      <summary className="reports-adv-section-summary">
        {title}
        <span className="reports-adv-section-hint">Requires data not in CSV import</span>
      </summary>
      <div className="reports-adv-section-body">{children}</div>
    </details>
  );
}

/** @param {{ placeholder?: string }} props */
function LockedTwin({ placeholder = "—" }) {
  return (
    <div className="reports-adv-twin">
      <span className="reports-adv-fake-input">
        {placeholder} min <IconLock />
      </span>
      <span className="reports-adv-fake-input">
        {placeholder} max <IconLock />
      </span>
    </div>
  );
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onApply?: () => void,
 *   draft: import("../lib/reportFilters").ReportFilters,
 *   patch: (p: Partial<import("../lib/reportFilters").ReportFilters>) => void,
 *   triggerRef: import("react").RefObject<HTMLElement | null>,
 *   clampRightBeforeRef?: import("react").RefObject<HTMLElement | null>,
 * }} props
 */
export default function ReportsAdvancedFiltersPopover({
  open,
  onClose,
  onApply,
  draft,
  patch,
  triggerRef,
  clampRightBeforeRef,
}) {
  const titleId = useId();
  const popRef = useRef(null);
  /** @type {import("react").CSSProperties | undefined} */
  const [pos, setPos] = useState(undefined);

  useLayoutEffect(() => {
    if (!open) {
      setPos(undefined);
      return;
    }
    const margin = 10;
    const gap = 8;
    function measure() {
      const tr = triggerRef.current?.getBoundingClientRect();
      const pop = popRef.current;
      if (!tr) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const clampEl = clampRightBeforeRef?.current;
      const rightLimit = clampEl ? clampEl.getBoundingClientRect().left - gap : vw - margin;
      const maxW = Math.max(280, Math.min(560, rightLimit - margin - tr.left, vw - 2 * margin));
      const pr = pop?.getBoundingClientRect();
      const h = Math.min(pr?.height || 420, vh - 2 * margin);
      let top = tr.bottom + gap;
      if (top + h > vh - margin) {
        top = Math.max(margin, vh - margin - h);
      }
      let left = Math.min(tr.left, rightLimit - maxW);
      left = Math.max(margin, left);
      setPos({
        position: "fixed",
        left,
        top,
        zIndex: 6500,
        width: maxW,
        maxHeight: `min(72vh, ${Math.round(vh - top - margin)}px)`,
        boxSizing: "border-box",
        overflow: "auto",
      });
    }
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, triggerRef, clampRightBeforeRef]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      const t = /** @type {Node | null} */ (e.target);
      if (!t) return;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose, triggerRef]);

  function clearAdvanced() {
    patch({
      advDayOfWeek: DEFAULT_REPORT_FILTERS.advDayOfWeek,
      advMonth: DEFAULT_REPORT_FILTERS.advMonth,
      advTimeFrom: DEFAULT_REPORT_FILTERS.advTimeFrom,
      advTimeTo: DEFAULT_REPORT_FILTERS.advTimeTo,
      advHoldMin: DEFAULT_REPORT_FILTERS.advHoldMin,
      advHoldMax: DEFAULT_REPORT_FILTERS.advHoldMax,
      advNetPnlMin: DEFAULT_REPORT_FILTERS.advNetPnlMin,
      advNetPnlMax: DEFAULT_REPORT_FILTERS.advNetPnlMax,
      advGrossPnlMin: DEFAULT_REPORT_FILTERS.advGrossPnlMin,
      advGrossPnlMax: DEFAULT_REPORT_FILTERS.advGrossPnlMax,
      advVolumeMin: DEFAULT_REPORT_FILTERS.advVolumeMin,
      advVolumeMax: DEFAULT_REPORT_FILTERS.advVolumeMax,
      advExecutionsMin: DEFAULT_REPORT_FILTERS.advExecutionsMin,
      advExecutionsMax: DEFAULT_REPORT_FILTERS.advExecutionsMax,
      advTradeResult: DEFAULT_REPORT_FILTERS.advTradeResult,
    });
  }

  if (!open || typeof document === "undefined") return null;

  const panel = (
    <div
      ref={popRef}
      className="reports-adv-pop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={pos}
    >
      <div className="reports-adv-pop-head">
        <h2 id={titleId} className="reports-adv-pop-title">
          Advanced filters
        </h2>
        <button type="button" className="reports-adv-pop-close" onClick={onClose} aria-label="Close advanced filters">
          ×
        </button>
      </div>

      <div className="reports-adv-pop-scroll">
        <AdvSection title="Days / time">
          <AdvRow label="Day of week">
            <select
              className="reports-adv-select"
              value={draft.advDayOfWeek}
              onChange={(e) => patch({ advDayOfWeek: e.target.value })}
            >
              <option value="all">All</option>
              <option value="0">Sunday</option>
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
            </select>
          </AdvRow>
          <AdvRow label="Time of day (entry)">
            <div className="reports-adv-twin">
              <input
                type="text"
                inputMode="numeric"
                className="reports-adv-input"
                placeholder="min HH:mm"
                value={draft.advTimeFrom}
                onChange={(e) => patch({ advTimeFrom: e.target.value })}
                aria-label="Minimum time of day"
              />
              <input
                type="text"
                className="reports-adv-input"
                placeholder="max HH:mm"
                value={draft.advTimeTo}
                onChange={(e) => patch({ advTimeTo: e.target.value })}
                aria-label="Maximum time of day"
              />
            </div>
          </AdvRow>
          <AdvRow label="Month">
            <select className="reports-adv-select" value={draft.advMonth} onChange={(e) => patch({ advMonth: e.target.value })}>
              <option value="all">All</option>
              <option value="1">January</option>
              <option value="2">February</option>
              <option value="3">March</option>
              <option value="4">April</option>
              <option value="5">May</option>
              <option value="6">June</option>
              <option value="7">July</option>
              <option value="8">August</option>
              <option value="9">September</option>
              <option value="10">October</option>
              <option value="11">November</option>
              <option value="12">December</option>
            </select>
          </AdvRow>
          <AdvRow label="Hold time (min)">
            <div className="reports-adv-twin">
              <input
                type="text"
                className="reports-adv-input"
                placeholder="min"
                value={draft.advHoldMin}
                onChange={(e) => patch({ advHoldMin: e.target.value })}
                aria-label="Minimum hold minutes"
              />
              <input
                type="text"
                className="reports-adv-input"
                placeholder="max"
                value={draft.advHoldMax}
                onChange={(e) => patch({ advHoldMax: e.target.value })}
                aria-label="Maximum hold minutes"
              />
            </div>
            <p className="reports-adv-help">Uses holdMinutes on trades when that field exists on your import.</p>
          </AdvRow>
        </AdvSection>

        <AdvSection title={"P&L, size, activity"}>
          <AdvRow label="Net P&amp;L ($)">
            <div className="reports-adv-twin">
              <input
                type="text"
                className="reports-adv-input"
                placeholder="min"
                value={draft.advNetPnlMin}
                onChange={(e) => patch({ advNetPnlMin: e.target.value })}
              />
              <input
                type="text"
                className="reports-adv-input"
                placeholder="max"
                value={draft.advNetPnlMax}
                onChange={(e) => patch({ advNetPnlMax: e.target.value })}
              />
            </div>
          </AdvRow>
          <AdvRow label="Gross P&amp;L ($)">
            <div className="reports-adv-twin">
              <input
                type="text"
                className="reports-adv-input"
                placeholder="min"
                value={draft.advGrossPnlMin}
                onChange={(e) => patch({ advGrossPnlMin: e.target.value })}
              />
              <input
                type="text"
                className="reports-adv-input"
                placeholder="max"
                value={draft.advGrossPnlMax}
                onChange={(e) => patch({ advGrossPnlMax: e.target.value })}
              />
            </div>
          </AdvRow>
          <AdvRow label="Volume (shares)">
            <div className="reports-adv-twin">
              <input
                type="text"
                className="reports-adv-input"
                placeholder="min"
                value={draft.advVolumeMin}
                onChange={(e) => patch({ advVolumeMin: e.target.value })}
              />
              <input
                type="text"
                className="reports-adv-input"
                placeholder="max"
                value={draft.advVolumeMax}
                onChange={(e) => patch({ advVolumeMax: e.target.value })}
              />
            </div>
          </AdvRow>
          <AdvRow label="Executions">
            <div className="reports-adv-twin">
              <input
                type="text"
                className="reports-adv-input"
                placeholder="min"
                value={draft.advExecutionsMin}
                onChange={(e) => patch({ advExecutionsMin: e.target.value })}
              />
              <input
                type="text"
                className="reports-adv-input"
                placeholder="max"
                value={draft.advExecutionsMax}
                onChange={(e) => patch({ advExecutionsMax: e.target.value })}
              />
            </div>
          </AdvRow>
        </AdvSection>

        <AdvSection title="Win / loss">
          <AdvRow label="Trade result (net P&amp;L)">
            <select
              className="reports-adv-select"
              value={draft.advTradeResult}
              onChange={(e) => patch({ advTradeResult: e.target.value })}
            >
              <option value="all">All</option>
              <option value="win">Win (&gt; 0)</option>
              <option value="loss">Loss (&lt; 0)</option>
              <option value="be">Breakeven (= 0)</option>
            </select>
          </AdvRow>
        </AdvSection>

        <AdvSectionLocked title="Instrument">
          <AdvRow label="Gap %">
            <LockedTwin placeholder="%" />
          </AdvRow>
          <AdvRow label="RVOL">
            <LockedTwin />
          </AdvRow>
          <AdvRow label="ATR">
            <LockedTwin />
          </AdvRow>
        </AdvSectionLocked>

        <AdvSectionLocked title="Tags (metrics)">
          <AdvRow label="Tag win %">
            <span className="reports-adv-fake-input reports-adv-fake-input--wide">
              % minimum <IconLock />
            </span>
          </AdvRow>
          <AdvRow label="Tag P&amp;L">
            <LockedTwin />
          </AdvRow>
        </AdvSectionLocked>

        <AdvSectionLocked title="Entry distance to daily SMA">
          <AdvRow label="20 SMA">
            <LockedTwin placeholder="%" />
          </AdvRow>
          <AdvRow label="50 SMA">
            <LockedTwin placeholder="%" />
          </AdvRow>
        </AdvSectionLocked>

        <AdvSectionLocked title="Statistics (MFE / MAE / timing)">
          <AdvRow label="Position MFE ($)">
            <LockedTwin />
          </AdvRow>
          <AdvRow label="Position MAE ($)">
            <LockedTwin />
          </AdvRow>
          <AdvRow label="Best exit P&amp;L ($)">
            <LockedTwin />
          </AdvRow>
        </AdvSectionLocked>
      </div>

      <div className="reports-adv-pop-foot">
        <button type="button" className="reports-adv-btn-secondary" onClick={clearAdvanced}>
          Clear advanced
        </button>
        <Link
          to="/reports/advanced"
          className="reports-adv-link"
          onClick={() => {
            onApply?.();
            onClose();
          }}
        >
          Scatter / correlation tab →
        </Link>
        <button
          type="button"
          className="reports-adv-btn-primary"
          onClick={() => {
            onApply?.();
            onClose();
          }}
        >
          Done
        </button>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
