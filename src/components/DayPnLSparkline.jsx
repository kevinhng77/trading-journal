import { useMemo } from "react";

/**
 * Tiny cumulative P&L polyline for a list of trades (same day).
 * @param {{ rows: object[] }} props
 */
export default function DayPnlSparkline({ rows }) {
  const pathD = useMemo(() => {
    const sorted = [...(rows ?? [])].sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? "")));
    let c = 0;
    const pts = sorted.map((r) => {
      c += Number(r.pnl) || 0;
      return c;
    });
    if (pts.length < 2) return null;
    const w = 140;
    const h = 52;
    const padX = 4;
    const padY = 6;
    const min = Math.min(...pts, 0);
    const max = Math.max(...pts, 0);
    const spanY = max - min || 1;
    return pts
      .map((y, i) => {
        const x = padX + (i / (pts.length - 1)) * (w - 2 * padX);
        const py = padY + (1 - (y - min) / spanY) * (h - 2 * padY);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${py.toFixed(1)}`;
      })
      .join("");
  }, [rows]);

  if (!pathD) {
    return <div className="journal-curve-fallback">—</div>;
  }

  return (
    <svg className="journal-curve-svg" viewBox="0 0 140 52" preserveAspectRatio="none" aria-hidden>
      <path
        d={pathD}
        fill="none"
        stroke="url(#journal-curve-grad)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="journal-curve-grad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#4ade80" />
        </linearGradient>
      </defs>
    </svg>
  );
}
