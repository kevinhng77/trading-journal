import { useCallback, useEffect, useId, useRef, useState } from "react";
import { normalizeTagList, normalizeTagString } from "../lib/tradeTags";
import { patchTradeByStableId } from "../storage/storage";

/**
 * @param {object} props
 * @param {string} props.tradeId stable trade id
 * @param {string[] | undefined} props.setups from trade row
 * @param {string[]} props.suggestionSetups unique setups from all trades (for picker)
 * @param {"full"|"picker"|"chips"} [props.variant] `picker` / `chips` split the bar (e.g. trade detail header).
 */
export default function TradeSetupsEditor({ tradeId, setups: setupsProp, suggestionSetups = [], variant = "full" }) {
  const setups = normalizeTagList(setupsProp);
  const [input, setInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const pickerRootRef = useRef(null);
  const pickerSearchRef = useRef(null);
  const pickerId = useId();
  const pickerSearchId = useId();

  function persist(next) {
    patchTradeByStableId(tradeId, { setups: normalizeTagList(next) });
  }

  function addFromInput() {
    const t = normalizeTagString(input);
    setInput("");
    if (!t) return;
    if (setups.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    persist([...setups, t]);
  }

  function removeSetup(setup) {
    persist(setups.filter((x) => x.toLowerCase() !== setup.toLowerCase()));
  }

  function addFromList(value) {
    if (!value) return;
    if (setups.some((x) => x.toLowerCase() === value.toLowerCase())) return;
    persist([...setups, value]);
  }

  const availablePick = suggestionSetups.filter((s) => !setups.some((t) => t.toLowerCase() === s.toLowerCase()));
  const qPick = pickerSearch.trim().toLowerCase();
  const filteredPickPool = qPick ? availablePick.filter((t) => t.toLowerCase().includes(qPick)) : [...availablePick];
  filteredPickPool.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const filteredPick = filteredPickPool;

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerSearch("");
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const id = window.requestAnimationFrame(() => {
      pickerSearchRef.current?.focus();
    });
    function onDocMouseDown(e) {
      if (!pickerRootRef.current?.contains(e.target)) closePicker();
    }
    function onKey(e) {
      if (e.key === "Escape") closePicker();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(id);
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen, closePicker]);

  const pickerBlock = (
    <div className="trade-tags-picker-wrap">
      {setups.length === 0 ? (
        <button
          type="button"
          className="trade-tags-add-empty-btn"
          aria-expanded={pickerOpen}
          aria-haspopup="dialog"
          aria-controls={pickerId}
          onClick={() => {
            setPickerOpen((prev) => {
              const next = !prev;
              if (!next) setPickerSearch("");
              return next;
            });
          }}
        >
          Add setups
        </button>
      ) : (
        <button
          type="button"
          className="trade-tags-add-link"
          aria-expanded={pickerOpen}
          aria-haspopup="dialog"
          aria-controls={pickerId}
          onClick={() => {
            setPickerOpen((prev) => {
              const next = !prev;
              if (!next) setPickerSearch("");
              return next;
            });
          }}
        >
          Add setups +
        </button>
      )}
      {pickerOpen ? (
        <div className="trade-tags-dropdown" id={pickerId} role="dialog" aria-label="Add setups">
          <label className="trade-tags-dropdown-search-label visually-hidden" htmlFor={pickerSearchId}>
            Search setups
          </label>
          <input
            ref={pickerSearchRef}
            id={pickerSearchId}
            type="text"
            className="trade-tags-dropdown-search"
            placeholder="Search setups…"
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            autoComplete="off"
          />
          <div className="trade-tags-dropdown-scroll" role="listbox" aria-label="Matching setups">
            {suggestionSetups.length === 0 ? (
              <p className="trade-tags-dropdown-empty">No saved setups yet. Create one below.</p>
            ) : filteredPick.length === 0 ? (
              <p className="trade-tags-dropdown-empty">
                {availablePick.length === 0 ? "All known setups are on this trade." : "No matching setups."}
              </p>
            ) : (
              filteredPick.map((setup) => (
                <button
                  key={setup}
                  type="button"
                  role="option"
                  className="trade-tags-dropdown-item"
                  onClick={() => addFromList(setup)}
                >
                  {setup}
                </button>
              ))
            )}
          </div>
          <div className="trade-tags-dropdown-footer">
            <input
              className="trade-tags-dropdown-new-input"
              type="text"
              placeholder="New setup"
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
    setups.length > 0 ? (
      <div className="trade-tags-chips-scroller" title={setups.join(", ")}>
        {setups.map((t) => (
          <button
            key={t}
            type="button"
            className="trade-tags-chip trade-tags-chip--compact"
            onClick={() => removeSetup(t)}
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
      <div className="trade-tags-editor trade-setups-editor trade-tags-editor--variant-picker">
        <div className="trade-tags-compact-bar trade-tags-compact-bar--picker-only" ref={pickerRootRef}>
          {pickerBlock}
        </div>
      </div>
    );
  }

  if (variant === "chips") {
    if (!chipsBlock) return null;
    return (
      <div className="trade-tags-editor trade-setups-editor trade-tags-editor--variant-chips">{chipsBlock}</div>
    );
  }

  return (
    <div className="trade-tags-editor trade-setups-editor">
      <div className="trade-tags-compact-bar" ref={pickerRootRef}>
        {pickerBlock}
        {chipsBlock}
      </div>
    </div>
  );
}
