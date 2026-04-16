import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useSearchParams } from "react-router-dom";
import { useLiveTrades } from "../../hooks/useLiveTrades";
import { collectAllTagsFromTrades } from "../../lib/tradeTags";
import { DEFAULT_REPORT_FILTERS } from "../../lib/reportFilters";
import { REPORT_FILTERS_DATES_EVENT } from "../../lib/reportFilterEvents";
import ReportsFilterStrip from "../../components/ReportsFilterStrip";
import { REPORTS_DURATION_OPTIONS } from "../../lib/tradeDuration";
import {
  clearPersistedReportFilters,
  loadPersistedReportFilters,
  savePersistedReportFilters,
} from "../../storage/reportFiltersPersist";

export default function ReportsLayout() {
  const trades = useLiveTrades();
  const allTags = useMemo(() => collectAllTagsFromTrades(trades), [trades]);
  const [searchParams, setSearchParams] = useSearchParams();

  const [filterDraft, setFilterDraft] = useState(() => loadPersistedReportFilters());
  const [appliedReportFilters, setAppliedReportFilters] = useState(() => loadPersistedReportFilters());
  const appliedReportFiltersRef = useRef(appliedReportFilters);
  appliedReportFiltersRef.current = appliedReportFilters;

  useEffect(() => {
    const raw = searchParams.get("tag");
    if (raw == null || raw === "") return;
    const tag = String(raw).trim();
    if (!tag) return;
    const next = { ...appliedReportFiltersRef.current, selectedTags: [tag], tagsMatchAll: false };
    setFilterDraft(next);
    setAppliedReportFilters(next);
    savePersistedReportFilters(next);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("tag");
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    function onDates(/** @type {CustomEvent} */ e) {
      const { dateFrom, dateTo } = e.detail ?? {};
      if (!dateFrom || !dateTo) return;
      setFilterDraft((f) => ({ ...f, dateFrom, dateTo }));
    }
    window.addEventListener(REPORT_FILTERS_DATES_EVENT, onDates);
    return () => window.removeEventListener(REPORT_FILTERS_DATES_EVENT, onDates);
  }, []);

  function applyFilters() {
    const next = { ...filterDraft };
    setAppliedReportFilters(next);
    savePersistedReportFilters(next);
  }

  function clearFilters() {
    clearPersistedReportFilters();
    setFilterDraft({ ...DEFAULT_REPORT_FILTERS });
    setAppliedReportFilters({ ...DEFAULT_REPORT_FILTERS });
  }

  return (
    <div className="page-wrap reports-page">
      <div className="page-header reports-page-header">
        <h1>Reports</h1>
      </div>

      <ReportsFilterStrip
        draft={filterDraft}
        setDraft={setFilterDraft}
        onApply={applyFilters}
        onClear={clearFilters}
        allTags={allTags}
        durationOptions={REPORTS_DURATION_OPTIONS}
      />

      <div className="reports-primary-tabs">
        <NavLink to="/reports" end className={({ isActive }) => `reports-primary-tab ${isActive ? "active" : ""}`}>
          Overview
        </NavLink>
        <NavLink
          to="/reports/detailed"
          className={({ isActive }) => `reports-primary-tab ${isActive ? "active" : ""}`}
        >
          Detailed
        </NavLink>
        <NavLink
          to="/reports/win-loss-days"
          className={({ isActive }) => `reports-primary-tab ${isActive ? "active" : ""}`}
        >
          Win vs Loss Days
        </NavLink>
        <NavLink
          to="/reports/drawdown"
          className={({ isActive }) => `reports-primary-tab ${isActive ? "active" : ""}`}
        >
          Drawdown
        </NavLink>
        <NavLink to="/reports/compare" className={({ isActive }) => `reports-primary-tab ${isActive ? "active" : ""}`}>
          Compare
        </NavLink>
        <NavLink
          to="/reports/tag-breakdown"
          className={({ isActive }) => `reports-primary-tab ${isActive ? "active" : ""}`}
        >
          Tag Breakdown
        </NavLink>
        <NavLink
          to="/reports/advanced"
          className={({ isActive }) => `reports-primary-tab ${isActive ? "active" : ""}`}
        >
          Advanced
        </NavLink>
      </div>

      <Outlet
        context={{
          appliedReportFilters,
          allTags,
        }}
      />
    </div>
  );
}
