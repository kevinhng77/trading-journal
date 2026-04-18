/**
 * @param {{ starred: boolean, onToggle: () => void, title?: string, "aria-label"?: string, className?: string }} props
 */
export default function StarToggle({ starred, onToggle, title, "aria-label": ariaLabel, className }) {
  const extra = className ? ` ${className}` : "";
  return (
    <button
      type="button"
      className={`star-toggle-btn${starred ? " star-toggle-btn--on" : ""}${extra}`}
      aria-pressed={starred}
      title={title ?? (starred ? "Remove from starred (*)" : "Add to starred (*)")}
      aria-label={ariaLabel ?? (starred ? "Unstar" : "Star")}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
    >
      <span className="star-toggle-glyph" aria-hidden>
        ☆
      </span>
    </button>
  );
}
