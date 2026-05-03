import { chartProxyUrl } from "../lib/chartApiEnv";

/**
 * @param {string} collection
 * @param {{ startDate: string, endDate: string }} range
 * @param {AbortSignal} [signal]
 * @param {string | null} [fields] omit or null for all fields (per API default)
 */
export async function fetchOuraPaginated(collection, range, signal, fields = null) {
  const { startDate, endDate } = range;
  const rows = [];
  let nextToken = null;

  do {
    const sp = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    if (fields) sp.set("fields", fields);
    if (nextToken) sp.set("next_token", nextToken);

    const url = chartProxyUrl("oura", `/v2/usercollection/${collection}?${sp.toString()}`);
    const res = await fetch(url, { signal });
    const text = await res.text();

    if (!res.ok) {
      let msg = `Oura HTTP ${res.status}`;
      try {
        const j = JSON.parse(text);
        if (j.detail != null) msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
        else if (j.message != null) msg = String(j.message);
      } catch {
        /* ignore */
      }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      const err = new Error("Oura returned a non-JSON body.");
      err.status = res.status;
      throw err;
    }

    rows.push(...(json.data ?? []));
    nextToken = json.next_token || null;
  } while (nextToken);

  return rows;
}

/**
 * @param {string} collection - e.g. ring_battery_level
 * @param {string} startDatetime ISO
 * @param {string} endDatetime ISO
 * @param {AbortSignal} [signal]
 * @param {string | null} [fields]
 */
export async function fetchOuraDatetimePaginated(collection, startDatetime, endDatetime, signal, fields = null) {
  const rows = [];
  let nextToken = null;

  do {
    const sp = new URLSearchParams({
      start_datetime: startDatetime,
      end_datetime: endDatetime,
    });
    if (fields) sp.set("fields", fields);
    if (nextToken) sp.set("next_token", nextToken);

    const url = chartProxyUrl("oura", `/v2/usercollection/${collection}?${sp.toString()}`);
    const res = await fetch(url, { signal });
    const text = await res.text();

    if (!res.ok) {
      let msg = `Oura HTTP ${res.status}`;
      try {
        const j = JSON.parse(text);
        if (j.detail != null) msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
        else if (j.message != null) msg = String(j.message);
      } catch {
        /* ignore */
      }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      const err = new Error("Oura returned a non-JSON body.");
      err.status = res.status;
      throw err;
    }

    rows.push(...(json.data ?? []));
    nextToken = json.next_token || null;
  } while (nextToken);

  return rows;
}

/** @param {AbortSignal} [signal] */
export async function fetchOuraPersonalInfo(signal) {
  const url = chartProxyUrl("oura", "/v2/usercollection/personal_info");
  const res = await fetch(url, { signal });
  const text = await res.text();
  if (!res.ok) {
    let msg = `Oura HTTP ${res.status}`;
    try {
      const j = JSON.parse(text);
      if (j.detail != null) msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* ignore */
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text);
}

/**
 * @param {Array<{ day?: string, score?: number|null }>} sleep
 * @param {Array<{ day?: string, score?: number|null }>} readiness
 * @param {Array<{ day?: string, score?: number|null }>} activity
 */
export function mergeOuraDailyScores(sleep, readiness, activity) {
  const m = new Map();

  function add(list, key) {
    for (const row of list) {
      const day = row.day;
      if (!day) continue;
      if (!m.has(day)) {
        m.set(day, { day, sleep: null, readiness: null, activity: null });
      }
      m.get(day)[key] = row.score ?? null;
    }
  }

  add(sleep, "sleep");
  add(readiness, "readiness");
  add(activity, "activity");

  return [...m.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** @param {number | null | undefined} sec */
export function formatDurationSeconds(sec) {
  if (sec == null || Number.isNaN(sec)) return "—";
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** @param {string} key */
export function humanizeSnake(key) {
  if (!key) return "";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * @param {Record<string, number> | null | undefined} contributors
 * @returns {Array<{ key: string, label: string, value: number }>}
 */
export function contributorsToRows(contributors) {
  if (!contributors || typeof contributors !== "object") return [];
  return Object.entries(contributors)
    .filter(([, v]) => typeof v === "number")
    .map(([key, value]) => ({ key, label: humanizeSnake(key), value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ ok: true, data: T } | { ok: false, error: string, status?: number }>}
 */
export async function ouraTry(fn) {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || String(e),
      status: e?.status,
    };
  }
}
