import { formatInTimeZone } from "date-fns-tz";

const NY = "America/New_York";

/**
 * Session VWAP from Alpaca-style bars: cumulative typical price × volume, reset each **US trading
 * calendar day** (NY date). Without a daily reset, one series over the whole loaded history anchors
 * far from the visible session (wrong for multi-day charts).
 *
 * @param {{ t: string, h: number, l: number, c: number, v?: number }[]} bars
 * @returns {{ time: number, value: number }[]}
 */
export function vwapLineDataFromAlpacaBars(bars) {
  if (!bars?.length) return [];

  const sorted = [...bars].sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());

  let cumTPV = 0;
  let cumV = 0;
  /** @type {string | null} */
  let sessionDay = null;
  /** Last VWAP for the current session (for zero-volume bars); never carried across days. */
  let lastVwap = null;

  /** @type {{ time: number, value: number }[]} */
  const out = [];

  for (const bar of sorted) {
    const inst = new Date(bar.t);
    const day = formatInTimeZone(inst, NY, "yyyy-MM-dd");
    if (sessionDay !== day) {
      sessionDay = day;
      cumTPV = 0;
      cumV = 0;
      lastVwap = null;
    }

    const v = Number(bar.v) || 0;
    const h = Number(bar.h);
    const l = Number(bar.l);
    const c = Number(bar.c);
    if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;
    const tp = (h + l + c) / 3;

    if (v > 0) {
      cumTPV += tp * v;
      cumV += v;
    }

    const sec = Math.floor(inst.getTime() / 1000);

    if (cumV > 0) {
      lastVwap = cumTPV / cumV;
      out.push({ time: sec, value: lastVwap });
    } else if (lastVwap != null) {
      out.push({ time: sec, value: lastVwap });
    }
  }

  return out;
}
