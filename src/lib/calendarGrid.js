import { localISODate, getDayAggregate } from "./dashboardStats";

/** @returns {(string|null)[][]} ISO date strings or null for padding cells */
export function buildCalendarWeeks(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const startPad = first.getDay();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) {
    cells.push(localISODate(new Date(year, monthIndex, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export function formatMonthTitle(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function sumMonthPnl(grouped, year, monthIndex) {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  let total = 0;
  for (let d = 1; d <= last; d++) {
    const iso = localISODate(new Date(year, monthIndex, d));
    total += getDayAggregate(grouped, iso).pnl;
  }
  return total;
}
