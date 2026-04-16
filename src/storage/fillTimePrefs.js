const KEY = "tradingJournalFillTimeZone";

/** Wall clock for fill times and trade chart axis labels (IANA). */
const DEFAULT_TZ = "America/New_York";

export const FILL_TIME_ZONES = [
  { id: "America/New_York", label: "Eastern (ET)" },
  { id: "America/Chicago", label: "Central (CT)" },
  { id: "America/Los_Angeles", label: "Pacific (PT)" },
];

export function loadFillTimeZone() {
  try {
    const v = localStorage.getItem(KEY);
    if (v && FILL_TIME_ZONES.some((z) => z.id === v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_TZ;
}

export function saveFillTimeZone(tz) {
  try {
    localStorage.setItem(KEY, tz);
  } catch {
    /* ignore */
  }
}
