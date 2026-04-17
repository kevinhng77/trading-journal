import { useEffect, useId, useMemo, useRef, useState } from "react";
import { REPORT_DURATION_OPTIONS } from "../lib/tradeDuration";
import { removeTagFromAllTrades } from "../lib/tradeTags";
import DateRangePicker from "./DateRangePicker";
import ReportsFilterCombobox from "./ReportsFilterCombobox";

/** Clear filters — funnel + slash (reads as “remove filters”, not delete data). */
function IconClearFilters() {
  return (
    <svg
      className="reports-action-icon reports-action-icon--stroke"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 5h16l-5.5 7.3V18l-3 1.5v-7.2L4 5z" />
      <path d="M5.5 19.5 19 6" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      className="reports-action-icon reports-action-icon--stroke"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {import("../lib/reportFilters").ReportFilters} props.draft
 * @param {(f: import("../lib/reportFilters").ReportFilters) => void} props.setDraft
 * @param {() => void} props.onApply
 * @param {() => void} props.onClear
 * @param {string[]} props.allTags
 * @param {string[]} [props.allSetups]
 * @param {{ value: string, label: string }[]} [props.durationOptions]
 * @param {string} [props.symbolPlaceholder]
 * @param {import("react").ReactNode} [props.trailingSlot]
 * @param {"default" | "none"} [props.stripActions] When `"none"`, hide Apply/Clear and treat filter changes as immediate (no submit row).
 */
export default function ReportsFilterStrip({
  draft,
  setDraft,
  onApply,
  onClear,
  allTags,
  allSetups = [],
  durationOptions = REPORT_DURATION_OPTIONS,
  symbolPlaceholder = "Symbol",
  trailingSlot = null,
  stripActions = "default",
}) {
  const [tagSearch, setTagSearch] = useState("");
  const [tagsPopOpen, setTagsPopOpen] = useState(false);
  const tagsClusterRef = useRef(null);
  const tagQueryInputRef = useRef(null);
  const tagsPopId = useId();
  const tagsMatchId = useId();
  const [setupSearch, setSetupSearch] = useState("");
  const [setupsPopOpen, setSetupsPopOpen] = useState(false);
  const setupsClusterRef = useRef(null);
  const setupQueryInputRef = useRef(null);
  const setupsPopId = useId();
  const setupsMatchId = useId();
  const setupsFieldLabelId = useId();
  const symbolInputId = useId();
  const tagsFieldLabelId = useId();
  const sideSelectId = useId();
  const sideSelectLabelId = useId();
  const durationSelectId = useId();
  const durationSelectLabelId = useId();
  const dateFieldLabelId = useId();
  const reportsDateFieldRef = useRef(null);
  const reportsStripActionsRef = useRef(null);

  useEffect(() => {
    if (!tagsPopOpen) return;
    function onDocMouseDown(e) {
      const el = /** @type {Node | null} */ (e.target);
      if (!tagsClusterRef.current || !el || tagsClusterRef.current.contains(el)) return;
      /* Defer so native controls (select, input) receive this mousedown before we re-render closed */
      window.setTimeout(() => setTagsPopOpen(false), 0);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [tagsPopOpen]);

  useEffect(() => {
    if (!tagsPopOpen) return;
    function onKey(e) {
      if (e.key === "Escape") setTagsPopOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tagsPopOpen]);

  useEffect(() => {
    if (!setupsPopOpen) return;
    function onDocMouseDown(e) {
      const el = /** @type {Node | null} */ (e.target);
      if (!setupsClusterRef.current || !el || setupsClusterRef.current.contains(el)) return;
      window.setTimeout(() => setSetupsPopOpen(false), 0);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [setupsPopOpen]);

  useEffect(() => {
    if (!setupsPopOpen) return;
    function onKey(e) {
      if (e.key === "Escape") setSetupsPopOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setupsPopOpen]);

  function patch(partial) {
    setDraft({ ...draft, ...partial });
  }

  function removeTag(tag) {
    patch({
      selectedTags: draft.selectedTags.filter((t) => t.toLowerCase() !== tag.toLowerCase()),
    });
  }

  function deleteTagFromAllTrades(tag) {
    const msg = `Remove tag “${tag}” from every trade? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    removeTagFromAllTrades(tag);
    removeTag(tag);
  }

  const draftSelectedSetups = useMemo(() => draft.selectedSetups ?? [], [draft.selectedSetups]);

  function removeSetupFilter(setup) {
    patch({
      selectedSetups: draftSelectedSetups.filter((t) => t.toLowerCase() !== setup.toLowerCase()),
    });
  }

  function addSetup(value) {
    const t = String(value ?? "").trim();
    if (!t) return;
    if (draftSelectedSetups.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    patch({ selectedSetups: [...draftSelectedSetups, t] });
  }

  function addTag(value) {
    const t = String(value ?? "").trim();
    if (!t) return;
    if (draft.selectedTags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    patch({ selectedTags: [...draft.selectedTags, t] });
  }

  const available = allTags.filter(
    (s) => !draft.selectedTags.some((t) => t.toLowerCase() === s.toLowerCase()),
  );

  /** Selected tags matching the search box (shown at top of dropdown with remove control). */
  const tagsDropdownSelected = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    const pool = q ? draft.selectedTags.filter((t) => t.toLowerCase().includes(q)) : [...draft.selectedTags];
    pool.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return pool.slice(0, 40);
  }, [tagSearch, draft.selectedTags]);

  /** Tags not yet selected — click row to add (search filters both sections). */
  const tagsDropdownAddable = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    const pool = q ? available.filter((t) => t.toLowerCase().includes(q)) : [...available];
    pool.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return pool.slice(0, 60);
  }, [tagSearch, available]);

  const tagsTriggerLabel = useMemo(() => {
    const tags = draft.selectedTags ?? [];
    const n = tags.length;
    if (n === 0) return "Select";
    if (n === 1) {
      const t = tags[0];
      return t.length > 24 ? `${t.slice(0, 22)}…` : t;
    }
    return `${n} selected`;
  }, [draft.selectedTags]);

  const availableSetups = allSetups.filter(
    (s) => !draftSelectedSetups.some((t) => t.toLowerCase() === s.toLowerCase()),
  );

  const setupsDropdownSelected = useMemo(() => {
    const q = setupSearch.trim().toLowerCase();
    const pool = q ? draftSelectedSetups.filter((t) => t.toLowerCase().includes(q)) : [...draftSelectedSetups];
    pool.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return pool.slice(0, 40);
  }, [setupSearch, draftSelectedSetups]);

  const setupsDropdownAddable = useMemo(() => {
    const q = setupSearch.trim().toLowerCase();
    const pool = q ? availableSetups.filter((t) => t.toLowerCase().includes(q)) : [...availableSetups];
    pool.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return pool.slice(0, 60);
  }, [setupSearch, availableSetups]);

  const setupsTriggerLabel = useMemo(() => {
    const list = draftSelectedSetups;
    const n = list.length;
    if (n === 0) return "Select";
    if (n === 1) {
      const t = list[0];
      return t.length > 24 ? `${t.slice(0, 22)}…` : t;
    }
    return `${n} selected`;
  }, [draftSelectedSetups]);

  useEffect(() => {
    if (!tagsPopOpen) return;
    const id = window.requestAnimationFrame(() => {
      tagQueryInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [tagsPopOpen]);

  useEffect(() => {
    if (!setupsPopOpen) return;
    const id = window.requestAnimationFrame(() => {
      setupQueryInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [setupsPopOpen]);

  return (
    <div className="reports-filter-strip">
      <form
        className="reports-filter-strip-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (stripActions !== "none") onApply();
        }}
      >
      <div className="reports-filter-fields">
        <div className="reports-filter-fields-left">
          <div className="reports-filter-field reports-filter-field--stacked reports-filter-field--symbol">
            <label className="reports-filter-field-label" htmlFor={symbolInputId}>
              Symbol
            </label>
            <input
              id={symbolInputId}
              className="reports-filter-input reports-filter-symbol-input"
              placeholder={symbolPlaceholder}
              value={draft.symbol}
              onChange={(e) => patch({ symbol: e.target.value })}
            />
          </div>

          <div className="reports-filter-field reports-filter-field--stacked reports-filter-field--tags">
            <span className="reports-filter-field-label" id={tagsFieldLabelId}>
              Tags
            </span>
            <div
              className="reports-filter-tags-wrap"
              ref={tagsClusterRef}
              role="group"
              aria-labelledby={tagsFieldLabelId}
            >
              <div className="reports-filter-tags-anchor">
                <button
                  type="button"
                  className="reports-filter-select reports-filter-tags-trigger"
                  aria-haspopup="dialog"
                  aria-expanded={tagsPopOpen}
                  aria-controls={tagsPopId}
                  onClick={() => {
                    setSetupsPopOpen(false);
                    setTagsPopOpen((o) => !o);
                  }}
                >
                  {tagsTriggerLabel}
                </button>
                {tagsPopOpen ? (
                  <div id={tagsPopId} className="reports-filter-tags-pop" role="dialog" aria-label="Tag filters">
                    <input
                      ref={tagQueryInputRef}
                      type="text"
                      className="reports-filter-input reports-filter-tag-query reports-filter-tag-query--pop"
                      placeholder="Search tags…"
                      value={tagSearch}
                      onChange={(e) => setTagSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                      aria-label="Search tags"
                    />
                    {tagsDropdownSelected.length > 0 || tagsDropdownAddable.length > 0 ? (
                      <div className="reports-filter-tag-dropdown" role="group" aria-label="Tags">
                        {tagsDropdownSelected.map((t) => (
                          <div
                            key={`sel-${t}`}
                            className="reports-filter-tag-dropdown-row reports-filter-tag-dropdown-row--selected"
                          >
                            <span className="reports-filter-tag-dropdown-name">{t}</span>
                            <button
                              type="button"
                              className="reports-filter-tag-dropdown-remove"
                              aria-label={`Remove tag ${t}`}
                              title={`Remove ${t}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removeTag(t);
                              }}
                            >
                              <span aria-hidden>×</span>
                            </button>
                          </div>
                        ))}
                        {tagsDropdownAddable.map((t) => (
                          <div
                            key={t}
                            className="reports-filter-tag-dropdown-row reports-filter-tag-dropdown-row--add reports-filter-tag-dropdown-row--split"
                          >
                            <button
                              type="button"
                              className="reports-filter-tag-dropdown-add-hit"
                              onClick={() => {
                                addTag(t);
                                setTagSearch("");
                              }}
                            >
                              <span className="reports-filter-tag-dropdown-name">{t}</span>
                            </button>
                            <button
                              type="button"
                              className="reports-filter-tag-dropdown-remove"
                              aria-label={`Delete tag ${t} from all trades`}
                              title={`Remove “${t}” from every trade`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                deleteTagFromAllTrades(t);
                              }}
                            >
                              <span aria-hidden>×</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : available.length === 0 && draft.selectedTags.length === 0 ? (
                      <p className="reports-filter-tag-dropdown-empty">No tags left to add.</p>
                    ) : (
                      <p className="reports-filter-tag-dropdown-empty">No matching tags.</p>
                    )}
                    <label className="reports-filter-tags-match reports-filter-tags-match-check" htmlFor={tagsMatchId}>
                      <input
                        id={tagsMatchId}
                        type="checkbox"
                        checked={draft.tagsMatchAll}
                        onChange={(e) => patch({ tagsMatchAll: e.target.checked })}
                      />
                      <span>Must have all tags</span>
                    </label>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="reports-filter-field reports-filter-field--stacked reports-filter-field--setups">
            <span className="reports-filter-field-label" id={setupsFieldLabelId}>
              Setup
            </span>
            <div
              className="reports-filter-tags-wrap"
              ref={setupsClusterRef}
              role="group"
              aria-labelledby={setupsFieldLabelId}
            >
              <div className="reports-filter-tags-anchor">
                <button
                  type="button"
                  className="reports-filter-select reports-filter-tags-trigger"
                  aria-haspopup="dialog"
                  aria-expanded={setupsPopOpen}
                  aria-controls={setupsPopId}
                  onClick={() => {
                    setTagsPopOpen(false);
                    setSetupsPopOpen((o) => !o);
                  }}
                >
                  {setupsTriggerLabel}
                </button>
                {setupsPopOpen ? (
                  <div
                    id={setupsPopId}
                    className="reports-filter-tags-pop reports-filter-tags-pop--setups"
                    role="dialog"
                    aria-label="Setup filters"
                  >
                    <input
                      ref={setupQueryInputRef}
                      type="text"
                      className="reports-filter-input reports-filter-tag-query reports-filter-tag-query--pop"
                      placeholder="Search setups…"
                      value={setupSearch}
                      onChange={(e) => setSetupSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                      aria-label="Search setups"
                    />
                    {setupsDropdownSelected.length > 0 || setupsDropdownAddable.length > 0 ? (
                      <div className="reports-filter-tag-dropdown" role="group" aria-label="Setups">
                        {setupsDropdownSelected.map((t) => (
                          <div
                            key={`sel-su-${t}`}
                            className="reports-filter-tag-dropdown-row reports-filter-tag-dropdown-row--selected"
                          >
                            <span className="reports-filter-tag-dropdown-name">{t}</span>
                            <button
                              type="button"
                              className="reports-filter-tag-dropdown-remove"
                              aria-label={`Remove setup ${t}`}
                              title={`Remove ${t}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removeSetupFilter(t);
                              }}
                            >
                              <span aria-hidden>×</span>
                            </button>
                          </div>
                        ))}
                        {setupsDropdownAddable.map((t) => (
                          <div key={`su-${t}`} className="reports-filter-tag-dropdown-row reports-filter-tag-dropdown-row--add">
                            <button
                              type="button"
                              className="reports-filter-tag-dropdown-add-hit"
                              onClick={() => {
                                addSetup(t);
                                setSetupSearch("");
                              }}
                            >
                              <span className="reports-filter-tag-dropdown-name">{t}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : availableSetups.length === 0 && draftSelectedSetups.length === 0 ? (
                      <p className="reports-filter-tag-dropdown-empty">No setups left to add.</p>
                    ) : (
                      <p className="reports-filter-tag-dropdown-empty">No matching setups.</p>
                    )}
                    <label
                      className="reports-filter-tags-match reports-filter-tags-match-check"
                      htmlFor={setupsMatchId}
                    >
                      <input
                        id={setupsMatchId}
                        type="checkbox"
                        checked={Boolean(draft.setupsMatchAll)}
                        onChange={(e) => patch({ setupsMatchAll: e.target.checked })}
                      />
                      <span>Must have all setups</span>
                    </label>
                    <div className="reports-filter-tags-pop-footer">
                      <button
                        type="button"
                        className="reports-filter-setup-done-btn"
                        title={
                          stripActions === "none"
                            ? "Close setup menu"
                            : "Apply all strip filters and close this menu"
                        }
                        aria-label={stripActions === "none" ? "Close setup menu" : "Apply filters and close setup menu"}
                        onClick={() => {
                          if (stripActions !== "none") onApply();
                          setSetupsPopOpen(false);
                          setSetupSearch("");
                        }}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="reports-filter-field reports-filter-field--stacked reports-filter-field--side">
            <label className="reports-filter-field-label" id={sideSelectLabelId} htmlFor={sideSelectId}>
              Side
            </label>
            <ReportsFilterCombobox
              id={sideSelectId}
              ariaLabelledBy={sideSelectLabelId}
              variant="side"
              value={draft.side}
              onChange={(v) => patch({ side: v })}
              options={[
                { value: "all", label: "All" },
                { value: "long", label: "Long" },
                { value: "short", label: "Short" },
              ]}
            />
          </div>

          <div className="reports-filter-field reports-filter-field--stacked reports-filter-field--duration">
            <label className="reports-filter-field-label" id={durationSelectLabelId} htmlFor={durationSelectId}>
              Duration
            </label>
            <ReportsFilterCombobox
              id={durationSelectId}
              ariaLabelledBy={durationSelectLabelId}
              variant="duration"
              value={draft.duration ?? "all"}
              onChange={(v) => patch({ duration: v })}
              options={durationOptions}
            />
          </div>
        </div>

        <div className="reports-filter-fields-spacer" aria-hidden="true" />
      </div>

      <div className="reports-filter-strip-date-actions">
        <div className="reports-filter-fields-right">
          <div
            ref={reportsDateFieldRef}
            className="reports-filter-field reports-filter-field--stacked reports-filter-field--date"
          >
            <span className="reports-filter-field-label" id={dateFieldLabelId}>
              Date
            </span>
            <DateRangePicker
              className="reports-filter-drp"
              aria-labelledby={dateFieldLabelId}
              alignPopoverEnd
              positionAnchorRef={reportsDateFieldRef}
              clampRightBeforeRef={reportsStripActionsRef}
              dateFrom={draft.dateFrom}
              dateTo={draft.dateTo}
              onChange={(r) => patch(r)}
            />
          </div>
        </div>

        {stripActions !== "none" ? (
          <div ref={reportsStripActionsRef} className="reports-filter-strip-actions">
            <button type="button" className="reports-action-btn reports-action-btn--clear" onClick={onClear} title="Clear filters" aria-label="Clear filters">
              <IconClearFilters />
            </button>
            <button type="submit" className="reports-action-btn reports-action-btn--apply" title="Apply filters" aria-label="Apply filters">
              <IconCheck />
            </button>
            {trailingSlot}
          </div>
        ) : (
          <div ref={reportsStripActionsRef} className="reports-filter-strip-actions reports-filter-strip-actions--placeholder" aria-hidden="true" />
        )}
      </div>
      </form>
    </div>
  );
}
