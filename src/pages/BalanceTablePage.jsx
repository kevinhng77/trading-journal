import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveTrades } from "../hooks/useLiveTrades";
import { buildSetupFilterSuggestions, collectAllTagsFromTrades } from "../lib/tradeTags";
import { usePlaybookPlayNames } from "../hooks/usePlaybookPlayNames";
import { DEFAULT_REPORT_FILTERS } from "../lib/reportFilters";
import { REPORT_FILTERS_DATES_EVENT } from "../lib/reportFilterEvents";
import ReportsFilterStrip from "../components/ReportsFilterStrip";
import { REPORTS_DURATION_OPTIONS } from "../lib/tradeDuration";
import {
  clearPersistedReportFilters,
  loadPersistedReportFilters,
  savePersistedReportFilters,
} from "../storage/reportFiltersPersist";
import ReportsTable from "./reports/ReportsTable";

export default function BalanceTablePage() {
  const trades = useLiveTrades();
  const allTags = useMemo(() => collectAllTagsFromTrades(trades), [trades]);
  const playbookPlayNames = usePlaybookPlayNames();
  const allSetups = useMemo(
    () => buildSetupFilterSuggestions(trades, playbookPlayNames),
    [trades, playbookPlayNames],
  );
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
        const nextParams = new URLSearchParams(prev);
        nextParams.delete("tag");
        return nextParams;
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
        <h1>Balance table</h1>
      </div>

      <ReportsFilterStrip
        draft={filterDraft}
        setDraft={setFilterDraft}
        onApply={applyFilters}
        onClear={clearFilters}
        allTags={allTags}
        allSetups={allSetups}
        durationOptions={REPORTS_DURATION_OPTIONS}
      />

      <ReportsTable appliedReportFilters={appliedReportFilters} />
    </div>
  );
}
