import { useEffect, useId, useMemo, useRef, useState } from "react";
import { normalizeTagList, normalizeTagString } from "../lib/tradeTags";
import { patchTradeByStableId } from "../storage/storage";

/**
 * @param {object} props
 * @param {string} props.tradeId stable trade id
 * @param {string[] | undefined} props.tags from trade row
 * @param {string[]} props.suggestionTags unique tags from all trades (for picker)
 * @param {"full"|"picker"|"chips"} [props.variant] `picker` / `chips` split the bar (e.g. trade detail header).
 */
export default function TradeTagsEditor({ tradeId, tags: tagsProp, suggestionTags = [], variant = "full" }) {
  const tags = normalizeTagList(tagsProp);
  const [input, setInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const pickerRootRef = useRef(null);
  const pickerSearchRef = useRef(null);
  const pickerId = useId();
  const pickerSearchId = useId();

  function persist(next) {
    patchTradeByStableId(tradeId, { tags: normalizeTagList(next) });
  }

  function addFromInput() {
    const t = normalizeTagString(input);
    setInput("");
    if (!t) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    persist([...tags, t]);
  }

  function removeTag(tag) {
    persist(tags.filter((x) => x.toLowerCase() !== tag.toLowerCase()));
  }

  function addFromList(value) {
    if (!value) return;
    if (tags.some((x) => x.toLowerCase() === value.toLowerCase())) return;
    persist([...tags, value]);
  }

  const availablePick = useMemo(
    () => suggestionTags.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase())),
    [suggestionTags, tags],
  );

  const filteredPick = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    const pool = q ? availablePick.filter((t) => t.toLowerCase().includes(q)) : [...availablePick];
    pool.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return pool;
  }, [pickerSearch, availablePick]);

  useEffect(() => {
    if (!pickerOpen) {
      setPickerSearch("");
      return;
    }
    const id = window.requestAnimationFrame(() => {
      pickerSearchRef.current?.focus();
    });
    function onDocMouseDown(e) {
      if (!pickerRootRef.current?.contains(e.target)) setPickerOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(id);
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const pickerBlock = (
    <div className="trade-tags-picker-wrap">
      {tags.length === 0 ? (
        <button
          type="button"
          className="trade-tags-add-empty-btn"
          aria-expanded={pickerOpen}
          aria-haspopup="dialog"
          aria-controls={pickerId}
          onClick={() => setPickerOpen((o) => !o)}
        >
          Add tags
        </button>
      ) : (
        <button
          type="button"
          className="trade-tags-add-link"
          aria-expanded={pickerOpen}
          aria-haspopup="dialog"
          aria-controls={pickerId}
          onClick={() => setPickerOpen((o) => !o)}
        >
          Add tags +
        </button>
      )}
      {pickerOpen ? (
        <div className="trade-tags-dropdown" id={pickerId} role="dialog" aria-label="Add tags">
          <label className="trade-tags-dropdown-search-label visually-hidden" htmlFor={pickerSearchId}>
            Search tags
          </label>
          <input
            ref={pickerSearchRef}
            id={pickerSearchId}
            type="text"
            className="trade-tags-dropdown-search"
            placeholder="Search tags…"
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            autoComplete="off"
          />
          <div className="trade-tags-dropdown-scroll" role="listbox" aria-label="Matching tags">
            {suggestionTags.length === 0 ? (
              <p className="trade-tags-dropdown-empty">No saved tags yet. Create one below.</p>
            ) : filteredPick.length === 0 ? (
              <p className="trade-tags-dropdown-empty">
                {availablePick.length === 0 ? "All known tags are on this trade." : "No matching tags."}
              </p>
            ) : (
              filteredPick.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  role="option"
                  className="trade-tags-dropdown-item"
                  onClick={() => addFromList(tag)}
                >
                  {tag}
                </button>
              ))
            )}
          </div>
          <div className="trade-tags-dropdown-footer">
            <input
              className="trade-tags-dropdown-new-input"
              type="text"
              placeholder="New tag"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFromInput();
                }
              }}
            />
            <button type="button" className="trade-tags-dropdown-new-btn" onClick={addFromInput}>
              Add
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  const chipsBlock =
    tags.length > 0 ? (
      <div className="trade-tags-chips-scroller" title={tags.join(", ")}>
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            className="trade-tags-chip trade-tags-chip--compact"
            onClick={() => removeTag(t)}
            title={`Remove “${t}”`}
          >
            {t}
            <span className="trade-tags-chip-x" aria-hidden>
              ×
            </span>
          </button>
        ))}
      </div>
    ) : null;

  if (variant === "picker") {
    return (
      <div className="trade-tags-editor trade-tags-editor--variant-picker">
        <div className="trade-tags-compact-bar trade-tags-compact-bar--picker-only" ref={pickerRootRef}>
          {pickerBlock}
        </div>
      </div>
    );
  }

  if (variant === "chips") {
    if (!chipsBlock) return null;
    return <div className="trade-tags-editor trade-tags-editor--variant-chips">{chipsBlock}</div>;
  }

  return (
    <div className="trade-tags-editor">
      <div className="trade-tags-compact-bar" ref={pickerRootRef}>
        {pickerBlock}
        {chipsBlock}
      </div>
    </div>
  );
}
