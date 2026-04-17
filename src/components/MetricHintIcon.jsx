/**
 * Small “i” control: hover or focus shows the native tooltip (`title`).
 * Use for statistics and chart titles where a short definition helps.
 *
 * @param {{ text: string, className?: string }} props
 */
export default function MetricHintIcon({ text, className = "" }) {
  const t = String(text ?? "").trim();
  if (!t) return null;
  return (
    <button
      type="button"
      className={`reports-chart-info metric-hint-icon ${className}`.trim()}
      title={t}
      aria-label={`Explanation: ${t}`}
    >
      I
    </button>
  );
}
