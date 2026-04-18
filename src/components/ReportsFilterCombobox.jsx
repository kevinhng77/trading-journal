import { useEffect, useRef, useState } from "react";

/**
 * Rounded listbox for filter strip (replaces native select so the menu can match UI corners).
 * @param {{
 *   id: string,
 *   ariaLabelledBy: string,
 *   value: string,
 *   options: { value: string, label: string }[],
 *   onChange: (value: string) => void,
 *   variant: "side" | "duration" | "account",
 *   disabled?: boolean,
 * }} props
 */
export default function ReportsFilterCombobox({
  id,
  ariaLabelledBy,
  value,
  options,
  onChange,
  variant,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      const el = /** @type {Node | null} */ (e.target);
      if (!el || !wrapRef.current?.contains(el)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={wrapRef} className={`reports-filter-combobox reports-filter-combobox--${variant}`}>
      <button
        type="button"
        id={id}
        className="reports-filter-combobox-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-listbox` : undefined}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Escape") setOpen(false);
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {active.label}
      </button>
      {open ? (
        <ul className="reports-filter-combobox-menu" role="listbox" aria-labelledby={ariaLabelledBy} id={`${id}-listbox`}>
          {options.map((o) => (
            <li key={o.value} className="reports-filter-combobox-li" role="none">
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`reports-filter-combobox-option ${o.value === value ? "is-active" : ""}`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
