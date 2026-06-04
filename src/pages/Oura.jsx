import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatISO, startOfDay, subDays, subYears } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  contributorsToRows,
  fetchOuraDatetimePaginated,
  fetchOuraPaginated,
  fetchOuraPersonalInfo,
  formatDurationSeconds,
  humanizeSnake,
  mergeOuraDailyScores,
  ouraTry,
} from "../api/ouraApi";
import { assertOuraProxyOrThrow } from "../lib/chartApiEnv";

const OURA_CLOUD = "https://cloud.ouraring.com";

const TABS = [
  { id: "today", label: "Today" },
  { id: "sleep", label: "Sleep" },
  { id: "activity", label: "Activity" },
  { id: "readiness", label: "Readiness" },
  { id: "sessions", label: "Sessions" },
  { id: "workouts", label: "Workouts" },
  { id: "vitals", label: "Vitals" },
  { id: "journal", label: "Journal & rest" },
  { id: "ring", label: "Ring & profile" },
];

function rangeToIsoDates(days) {
  const end = new Date();
  const start = subDays(end, days - 1);
  return {
    startDate: format(start, "yyyy-MM-dd"),
    endDate: format(end, "yyyy-MM-dd"),
  };
}

function formatAxisDay(iso) {
  try {
    return format(new Date(`${iso}T12:00:00`), "MMM d");
  } catch {
    return iso;
  }
}

function formatDtShort(iso) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "EEE MMM d · HH:mm");
  } catch {
    return String(iso);
  }
}

function maskEmail(email) {
  if (!email || typeof email !== "string" || !email.includes("@")) return email || "—";
  const [u, d] = email.split("@");
  if (u.length <= 1) return `*@${d}`;
  return `${u[0]}${"*".repeat(Math.min(4, u.length - 1))}@${d}`;
}

function ScoreRing({ label, value, color, sub }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const v = value == null || Number.isNaN(value) ? null : Math.max(0, Math.min(100, value));
  const dash = v == null ? 0 : (v / 100) * c;

  return (
    <div className="oura-score-ring">
      <svg className="oura-score-ring-svg" viewBox="0 0 120 120" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 60 60)"
          opacity={v == null ? 0.25 : 1}
        />
      </svg>
      <div className="oura-score-ring-center">
        <span className="oura-score-ring-value">{v == null ? "—" : Math.round(v)}</span>
        <span className="oura-score-ring-label">{label}</span>
        {sub ? <span className="oura-score-ring-sub">{sub}</span> : null}
      </div>
    </div>
  );
}

function ContributorPanel({ title, rows, barColor }) {
  if (!rows.length) {
    return (
      <div className="oura-contrib-empty">
        <h3 className="oura-panel-title">{title}</h3>
        <p className="oura-muted">No contributor data in this range.</p>
      </div>
    );
  }
  const chartData = [...rows].reverse();
  return (
    <div className="oura-contrib-panel">
      <h3 className="oura-panel-title">{title}</h3>
      <div className="oura-contrib-chart">
        <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 28)}>
          <BarChart layout="vertical" data={chartData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} stroke="var(--text)" tick={{ fill: "var(--text)", fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="label"
              width={118}
              stroke="var(--text)"
              tick={{ fill: "var(--muted)", fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                background: "var(--code-bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text-h)",
              }}
            />
            <Bar dataKey="value" fill={barColor} radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

async function fetchAllOuraData(rangeDays, signal) {
  const range = rangeToIsoDates(rangeDays);
  const wideRange = {
    startDate: format(subYears(new Date(), 3), "yyyy-MM-dd"),
    endDate: range.endDate,
  };
  const batteryStart = formatISO(startOfDay(subDays(new Date(), 7)));
  const batteryEnd = formatISO(new Date());

  const [
    personalInfo,
    ringConfig,
    trendSleep,
    trendReadiness,
    trendActivity,
    dailySleepDetail,
    dailyReadinessDetail,
    dailyActivityDetail,
    sleeps,
    workouts,
    sessions,
    spo2,
    stress,
    resilience,
    vo2,
    cardioAge,
    sleepTime,
    battery,
    tags,
    restMode,
  ] = await Promise.all([
    ouraTry(() => fetchOuraPersonalInfo(signal)),
    ouraTry(() =>
      fetchOuraPaginated(
        "ring_configuration",
        wideRange,
        signal,
        "color,design,firmware_version,hardware_type,set_up_at,size",
      ),
    ),
    ouraTry(() => fetchOuraPaginated("daily_sleep", range, signal, "day,score")),
    ouraTry(() => fetchOuraPaginated("daily_readiness", range, signal, "day,score")),
    ouraTry(() => fetchOuraPaginated("daily_activity", range, signal, "day,score")),
    ouraTry(() => fetchOuraPaginated("daily_sleep", range, signal, "day,score,contributors")),
    ouraTry(() =>
      fetchOuraPaginated("daily_readiness", range, signal, "day,score,contributors,temperature_deviation"),
    ),
    ouraTry(() =>
      fetchOuraPaginated(
        "daily_activity",
        range,
        signal,
        "day,score,contributors,steps,active_calories,total_calories,target_calories,target_meters,equivalent_walking_distance",
      ),
    ),
    ouraTry(() =>
      fetchOuraPaginated(
        "sleep",
        range,
        signal,
        "day,bedtime_start,bedtime_end,total_sleep_duration,deep_sleep_duration,rem_sleep_duration,light_sleep_duration,awake_time,average_hrv,average_heart_rate,efficiency,latency,lowest_heart_rate,average_breath,score,type",
      ),
    ),
    ouraTry(() =>
      fetchOuraPaginated(
        "workout",
        range,
        signal,
        "day,activity,calories,distance,start_datetime,end_datetime,intensity,label,source",
      ),
    ),
    ouraTry(() => fetchOuraPaginated("session", range, signal, "day,start_datetime,end_datetime,type,mood")),
    ouraTry(() => fetchOuraPaginated("daily_spo2", range, signal, null)),
    ouraTry(() =>
      fetchOuraPaginated("daily_stress", range, signal, "day,day_summary,recovery_high,stress_high"),
    ),
    ouraTry(() => fetchOuraPaginated("daily_resilience", range, signal, "day,level,contributors")),
    ouraTry(() => fetchOuraPaginated("vO2_max", range, signal, "day,vo2_max,timestamp")),
    ouraTry(() => fetchOuraPaginated("daily_cardiovascular_age", range, signal, "day,score")),
    ouraTry(() => fetchOuraPaginated("sleep_time", range, signal, "day,recommendation,status,optimal_bedtime")),
    ouraTry(() =>
      fetchOuraDatetimePaginated("ring_battery_level", batteryStart, batteryEnd, signal, "timestamp,level,charging"),
    ),
    ouraTry(() => fetchOuraPaginated("tag", range, signal, "day,text,timestamp,tags")),
    ouraTry(() =>
      fetchOuraPaginated("rest_mode_period", range, signal, "start_day,end_day,start_time,end_time,episodes"),
    ),
  ]);

  return {
    personalInfo,
    ringConfig,
    trendSleep,
    trendReadiness,
    trendActivity,
    dailySleepDetail,
    dailyReadinessDetail,
    dailyActivityDetail,
    sleeps,
    workouts,
    sessions,
    spo2,
    stress,
    resilience,
    vo2,
    cardioAge,
    sleepTime,
    battery,
    tags,
    restMode,
  };
}

function collectFailures(bundle) {
  const out = [];
  for (const [key, val] of Object.entries(bundle)) {
    if (val && typeof val === "object" && val.ok === false) {
      out.push({ key, error: val.error, status: val.status });
    }
  }
  return out;
}

export default function Oura() {
  const [tab, setTab] = useState("today");
  const [rangeDays, setRangeDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [fatalError, setFatalError] = useState(null);
  const [bundle, setBundle] = useState(null);

  const runFetch = useCallback(
    async (signal) => {
      setFatalError(null);
      try {
        assertOuraProxyOrThrow();
      } catch (e) {
        setFatalError(e?.message || String(e));
        setBundle(null);
        return;
      }

      setLoading(true);
      try {
        const data = await fetchAllOuraData(rangeDays, signal);
        if (signal.aborted) return;
        setBundle(data);
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (!signal.aborted) setFatalError(e?.message || String(e));
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [rangeDays],
  );

  useEffect(() => {
    const ac = new AbortController();
    runFetch(ac.signal);
    return () => ac.abort();
  }, [runFetch]);

  const trendSeries = useMemo(() => {
    if (!bundle?.trendSleep?.ok || !bundle?.trendReadiness?.ok || !bundle?.trendActivity?.ok) return [];
    return mergeOuraDailyScores(
      bundle.trendSleep.data,
      bundle.trendReadiness.data,
      bundle.trendActivity.data,
    );
  }, [bundle]);

  const latestDay = useMemo(() => (trendSeries.length ? trendSeries[trendSeries.length - 1].day : null), [trendSeries]);

  const latestDailySleep = useMemo(() => {
    if (!bundle?.dailySleepDetail?.ok || !latestDay) return null;
    const rows = bundle.dailySleepDetail.data;
    return rows.find((r) => r.day === latestDay) ?? rows[rows.length - 1] ?? null;
  }, [bundle, latestDay]);

  const latestDailyReadiness = useMemo(() => {
    if (!bundle?.dailyReadinessDetail?.ok || !latestDay) return null;
    const rows = bundle.dailyReadinessDetail.data;
    return rows.find((r) => r.day === latestDay) ?? rows[rows.length - 1] ?? null;
  }, [bundle, latestDay]);

  const latestDailyActivity = useMemo(() => {
    if (!bundle?.dailyActivityDetail?.ok || !latestDay) return null;
    const rows = bundle.dailyActivityDetail.data;
    return rows.find((r) => r.day === latestDay) ?? rows[rows.length - 1] ?? null;
  }, [bundle, latestDay]);

  const latestBattery = useMemo(() => {
    if (!bundle?.battery?.ok || !bundle.battery.data.length) return null;
    const sorted = [...bundle.battery.data].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    return sorted[0];
  }, [bundle]);

  const sleepRowsSorted = useMemo(() => {
    if (!bundle?.sleeps?.ok) return [];
    return [...bundle.sleeps.data].sort((a, b) => String(b.day).localeCompare(String(a.day)));
  }, [bundle]);

  const spo2ChartData = useMemo(() => {
    if (!bundle?.spo2?.ok) return [];
    return bundle.spo2.data
      .map((row) => ({
        day: row.day,
        spo2: row.spo2_percentage?.average ?? null,
        bdi: row.breathing_disturbance_index ?? null,
      }))
      .filter((r) => r.day)
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [bundle]);

  const stressChartData = useMemo(() => {
    if (!bundle?.stress?.ok) return [];
    return bundle.stress.data
      .map((row) => ({
        day: row.day,
        stress_high: row.stress_high ?? null,
        recovery_high: row.recovery_high ?? null,
        summary: row.day_summary ?? null,
      }))
      .filter((r) => r.day)
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [bundle]);

  const vo2ChartData = useMemo(() => {
    if (!bundle?.vo2?.ok) return [];
    return bundle.vo2.data
      .map((row) => ({ day: row.day, vo2_max: row.vo2_max ?? null }))
      .filter((r) => r.day)
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [bundle]);

  const cardioChartData = useMemo(() => {
    if (!bundle?.cardioAge?.ok) return [];
    return bundle.cardioAge.data
      .map((row) => ({ day: row.day, score: row.score ?? null }))
      .filter((r) => r.day)
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [bundle]);

  const partialFailures = useMemo(() => (bundle ? collectFailures(bundle) : []), [bundle]);

  const readinessContributors = useMemo(
    () => contributorsToRows(latestDailyReadiness?.contributors),
    [latestDailyReadiness],
  );
  const sleepContributors = useMemo(() => contributorsToRows(latestDailySleep?.contributors), [latestDailySleep]);
  const activityContributors = useMemo(
    () => contributorsToRows(latestDailyActivity?.contributors),
    [latestDailyActivity],
  );

  const latestScores = useMemo(() => {
    if (!latestDay || !trendSeries.length) return { readiness: null, sleep: null, activity: null };
    const row = trendSeries.find((r) => r.day === latestDay) ?? trendSeries[trendSeries.length - 1];
    return { readiness: row.readiness, sleep: row.sleep, activity: row.activity };
  }, [trendSeries, latestDay]);

  return (
    <div className="page-wrap page-oura">
      <header className="page-header page-oura-header">
        <div className="page-oura-header-text">
          <h1>Oura</h1>
          <p className="page-oura-lead">
            Desktop-style overview of your ring data via the{" "}
            <a href={`${OURA_CLOUD}/v2/docs`} target="_blank" rel="noreferrer">
              Oura Cloud API v2
            </a>
            . Set <code>OURA_PERSONAL_ACCESS_TOKEN</code> in <code>.env</code> or <code>keys.env</code> and restart{" "}
            <code>npm run dev</code>. Some metrics require an active Oura membership and may return errors if your plan
            does not include them.
          </p>
        </div>
      </header>

      <section className="card page-oura-controls">
        <div className="page-oura-toolbar">
          <span className="page-oura-toolbar-label">Range</span>
          <div className="range-toggle">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                className={`range-btn ${rangeDays === d ? "active" : ""}`}
                onClick={() => setRangeDays(d)}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            type="button"
            className="page-oura-refresh-btn"
            onClick={() => runFetch(new AbortController().signal)}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        <nav className="oura-tabs" aria-label="Oura sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`oura-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </section>

      {fatalError ? (
        <section className="card page-oura-error" role="alert">
          <h2 className="section-title">Could not load Oura</h2>
          <p>{fatalError}</p>
        </section>
      ) : null}

      {partialFailures.length > 0 ? (
        <section className="card oura-partial-warn" role="status">
          <h2 className="section-title">Partial data</h2>
          <p className="oura-muted">
            Some endpoints failed (subscription limits, scopes, or temporary API errors). Other tabs may still show
            data.
          </p>
          <ul className="oura-partial-list">
            {partialFailures.map((f) => (
              <li key={f.key}>
                <code>{f.key}</code>
                {f.status ? ` (${f.status})` : ""}: {f.error}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!fatalError && tab === "today" ? (
        <>
          <section className="card oura-today-hero">
            <h2 className="section-title">{latestDay ? `Today · ${latestDay}` : "Scores"}</h2>
            <div className="oura-rings-row">
              <ScoreRing label="Readiness" value={latestScores.readiness} color="#c084fc" />
              <ScoreRing label="Sleep" value={latestScores.sleep} color="#38bdf8" />
              <ScoreRing label="Activity" value={latestScores.activity} color="#34d399" />
            </div>
            <div className="oura-today-meta">
              {latestBattery ? (
                <p>
                  Ring battery: <strong>{latestBattery.level != null ? `${latestBattery.level}%` : "—"}</strong>
                  {latestBattery.charging ? " · charging" : ""}
                  {latestBattery.timestamp ? ` · ${formatDtShort(latestBattery.timestamp)}` : ""}
                </p>
              ) : (
                <p className="oura-muted">Battery sample not available in this window.</p>
              )}
            </div>
          </section>

          <div className="oura-two-col">
            <ContributorPanel title="Readiness contributors" rows={readinessContributors} barColor="#c084fc" />
            <ContributorPanel title="Sleep contributors" rows={sleepContributors} barColor="#38bdf8" />
          </div>
          <ContributorPanel title="Activity contributors" rows={activityContributors} barColor="#34d399" />

          <section className="card page-oura-chart-card">
            <h2 className="section-title">Trends</h2>
            {trendSeries.length === 0 && !loading ? (
              <p className="page-oura-empty">No daily scores in range.</p>
            ) : (
              <div className="page-oura-chart">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="day"
                      tickFormatter={formatAxisDay}
                      stroke="var(--text)"
                      tick={{ fill: "var(--text)", fontSize: 12 }}
                      minTickGap={16}
                    />
                    <YAxis domain={[0, 100]} stroke="var(--text)" tick={{ fill: "var(--text)", fontSize: 12 }} width={36} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--code-bg)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--text-h)",
                      }}
                      labelFormatter={(iso) => (typeof iso === "string" ? iso : String(iso))}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="readiness" name="Readiness" stroke="#c084fc" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="sleep" name="Sleep" stroke="#38bdf8" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="activity" name="Activity" stroke="#34d399" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </>
      ) : null}

      {!fatalError && tab === "sleep" ? (
        <>
          <section className="card oura-table-card">
            <h2 className="section-title">Sleep periods</h2>
            <div className="oura-table-wrap">
              <table className="oura-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Bed</th>
                    <th>Wake</th>
                    <th>Asleep</th>
                    <th>Deep</th>
                    <th>REM</th>
                    <th>Light</th>
                    <th>Awake</th>
                    <th>HRV</th>
                    <th>RHR</th>
                    <th>Eff. %</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {sleepRowsSorted.map((s) => (
                    <tr key={s.id ?? `${s.day}-${s.bedtime_start}`}>
                      <td>{s.day}</td>
                      <td>{formatDtShort(s.bedtime_start)}</td>
                      <td>{formatDtShort(s.bedtime_end)}</td>
                      <td>{formatDurationSeconds(s.total_sleep_duration)}</td>
                      <td>{formatDurationSeconds(s.deep_sleep_duration)}</td>
                      <td>{formatDurationSeconds(s.rem_sleep_duration)}</td>
                      <td>{formatDurationSeconds(s.light_sleep_duration)}</td>
                      <td>{formatDurationSeconds(s.awake_time)}</td>
                      <td>{s.average_hrv ?? "—"}</td>
                      <td>{s.average_heart_rate ?? "—"}</td>
                      <td>{s.efficiency ?? "—"}</td>
                      <td>{s.score ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sleepRowsSorted.length === 0 && !loading ? (
              <p className="oura-muted">No sleep sessions in this range.</p>
            ) : null}
          </section>

          <section className="card oura-table-card">
            <h2 className="section-title">Sleep timing guidance</h2>
            <div className="oura-table-wrap">
              <table className="oura-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Status</th>
                    <th>Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {(bundle?.sleepTime?.ok ? bundle.sleepTime.data : []).map((r) => (
                    <tr key={r.id ?? r.day}>
                      <td>{r.day}</td>
                      <td>{r.status ?? "—"}</td>
                      <td>{r.recommendation ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {!fatalError && tab === "activity" ? (
        <>
          <section className="card oura-stat-cards">
            <h2 className="section-title">Latest day · movement</h2>
            <div className="page-oura-stat-grid">
              <div className="page-oura-stat">
                <span className="page-oura-stat-label">Steps</span>
                <span className="page-oura-stat-value">{latestDailyActivity?.steps ?? "—"}</span>
              </div>
              <div className="page-oura-stat">
                <span className="page-oura-stat-label">Active kcal</span>
                <span className="page-oura-stat-value">{latestDailyActivity?.active_calories ?? "—"}</span>
              </div>
              <div className="page-oura-stat">
                <span className="page-oura-stat-label">Total kcal</span>
                <span className="page-oura-stat-value">{latestDailyActivity?.total_calories ?? "—"}</span>
              </div>
              <div className="page-oura-stat">
                <span className="page-oura-stat-label">Walk dist. (m)</span>
                <span className="page-oura-stat-value">{latestDailyActivity?.equivalent_walking_distance ?? "—"}</span>
              </div>
              <div className="page-oura-stat">
                <span className="page-oura-stat-label">Target meters</span>
                <span className="page-oura-stat-value">{latestDailyActivity?.target_meters ?? "—"}</span>
              </div>
              <div className="page-oura-stat">
                <span className="page-oura-stat-label">Activity score</span>
                <span className="page-oura-stat-value">{latestDailyActivity?.score ?? "—"}</span>
              </div>
            </div>
          </section>
          <ContributorPanel title="Activity score contributors" rows={activityContributors} barColor="#34d399" />
          <section className="card page-oura-chart-card">
            <h2 className="section-title">Steps (daily)</h2>
            <div className="page-oura-chart">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart
                  data={(bundle?.dailyActivityDetail?.ok ? bundle.dailyActivityDetail.data : [])
                    .filter((r) => r.day)
                    .sort((a, b) => a.day.localeCompare(b.day))
                    .map((r) => ({ day: r.day, steps: r.steps ?? null }))}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={formatAxisDay}
                    stroke="var(--text)"
                    tick={{ fill: "var(--text)", fontSize: 12 }}
                    minTickGap={16}
                  />
                  <YAxis stroke="var(--text)" tick={{ fill: "var(--text)", fontSize: 12 }} width={44} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--code-bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--text-h)",
                    }}
                  />
                  <Line type="monotone" dataKey="steps" name="Steps" stroke="#34d399" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      ) : null}

      {!fatalError && tab === "readiness" ? (
        <>
          <section className="card oura-readiness-head">
            <h2 className="section-title">Readiness detail</h2>
            <div className="oura-readiness-kpis">
              <div className="page-oura-stat">
                <span className="page-oura-stat-label">Score</span>
                <span className="page-oura-stat-value">{latestDailyReadiness?.score ?? "—"}</span>
              </div>
              <div className="page-oura-stat">
                <span className="page-oura-stat-label">Temp deviation (°)</span>
                <span className="page-oura-stat-value">
                  {latestDailyReadiness?.temperature_deviation != null
                    ? Number(latestDailyReadiness.temperature_deviation).toFixed(2)
                    : "—"}
                </span>
              </div>
            </div>
          </section>
          <ContributorPanel title="Readiness contributors" rows={readinessContributors} barColor="#c084fc" />
        </>
      ) : null}

      {!fatalError && tab === "sessions" ? (
        <section className="card oura-table-card">
          <h2 className="section-title">Guided sessions &amp; moments</h2>
          <div className="oura-table-wrap">
            <table className="oura-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Type</th>
                  <th>Mood</th>
                </tr>
              </thead>
              <tbody>
                {(bundle?.sessions?.ok ? bundle.sessions.data : [])
                  .slice()
                  .sort((a, b) => String(b.start_datetime).localeCompare(String(a.start_datetime)))
                  .map((s) => (
                    <tr key={s.id ?? `${s.start_datetime}-${s.type}`}>
                      <td>{s.day}</td>
                      <td>{formatDtShort(s.start_datetime)}</td>
                      <td>{formatDtShort(s.end_datetime)}</td>
                      <td>{humanizeSnake(s.type || "")}</td>
                      <td>{s.mood ?? "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {bundle?.sessions?.ok && bundle.sessions.data.length === 0 ? (
            <p className="oura-muted">No sessions in this range.</p>
          ) : null}
        </section>
      ) : null}

      {!fatalError && tab === "workouts" ? (
        <section className="card oura-table-card">
          <h2 className="section-title">Workouts</h2>
          <div className="oura-table-wrap">
            <table className="oura-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Activity</th>
                  <th>Label</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Intensity</th>
                  <th>kcal</th>
                  <th>km</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {(bundle?.workouts?.ok ? bundle.workouts.data : [])
                  .slice()
                  .sort((a, b) => String(b.start_datetime).localeCompare(String(a.start_datetime)))
                  .map((w) => (
                    <tr key={w.id ?? `${w.start_datetime}-${w.activity}`}>
                      <td>{w.day}</td>
                      <td>{humanizeSnake(w.activity || "")}</td>
                      <td>{w.label ?? "—"}</td>
                      <td>{formatDtShort(w.start_datetime)}</td>
                      <td>{formatDtShort(w.end_datetime)}</td>
                      <td>{w.intensity ?? "—"}</td>
                      <td>{w.calories ?? "—"}</td>
                      <td>{w.distance != null ? Number(w.distance).toFixed(2) : "—"}</td>
                      <td>{w.source ?? "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {bundle?.workouts?.ok && bundle.workouts.data.length === 0 ? (
            <p className="oura-muted">No workouts in this range.</p>
          ) : null}
        </section>
      ) : null}

      {!fatalError && tab === "vitals" ? (
        <div className="oura-vitals-grid">
          <section className="card page-oura-chart-card">
            <h2 className="section-title">SpO₂ (night average %)</h2>
            <div className="page-oura-chart">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={spo2ChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickFormatter={formatAxisDay} tick={{ fill: "var(--text)", fontSize: 11 }} />
                  <YAxis domain={[85, 100]} tick={{ fill: "var(--text)", fontSize: 11 }} width={36} />
                  <Tooltip contentStyle={{ background: "var(--code-bg)", border: "1px solid var(--border)" }} />
                  <Line type="monotone" dataKey="spo2" name="SpO₂" stroke="#f472b6" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="card page-oura-chart-card">
            <h2 className="section-title">Stress (high minutes)</h2>
            <div className="page-oura-chart">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={stressChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickFormatter={formatAxisDay} tick={{ fill: "var(--text)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--text)", fontSize: 11 }} width={36} />
                  <Tooltip contentStyle={{ background: "var(--code-bg)", border: "1px solid var(--border)" }} />
                  <Legend />
                  <Line type="monotone" dataKey="stress_high" name="Stress" stroke="#fb7185" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="recovery_high" name="Recovery" stroke="#4ade80" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="card page-oura-chart-card">
            <h2 className="section-title">VO₂ max</h2>
            <div className="page-oura-chart">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={vo2ChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickFormatter={formatAxisDay} tick={{ fill: "var(--text)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--text)", fontSize: 11 }} width={36} />
                  <Tooltip contentStyle={{ background: "var(--code-bg)", border: "1px solid var(--border)" }} />
                  <Line type="monotone" dataKey="vo2_max" name="VO₂ max" stroke="#a78bfa" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="card page-oura-chart-card">
            <h2 className="section-title">Cardiovascular age (score)</h2>
            <div className="page-oura-chart">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={cardioChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickFormatter={formatAxisDay} tick={{ fill: "var(--text)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--text)", fontSize: 11 }} width={36} />
                  <Tooltip contentStyle={{ background: "var(--code-bg)", border: "1px solid var(--border)" }} />
                  <Line type="monotone" dataKey="score" name="Score" stroke="#2dd4bf" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="card oura-table-card">
            <h2 className="section-title">Resilience</h2>
            <div className="oura-table-wrap">
              <table className="oura-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {(bundle?.resilience?.ok ? bundle.resilience.data : []).map((r) => (
                    <tr key={r.id ?? r.day}>
                      <td>{r.day}</td>
                      <td>{r.level ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {!fatalError && tab === "journal" ? (
        <>
          <section className="card oura-table-card">
            <h2 className="section-title">Journal notes &amp; tags</h2>
            <div className="oura-table-wrap">
              <table className="oura-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Time</th>
                    <th>Text</th>
                    <th>Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {(bundle?.tags?.ok ? bundle.tags.data : [])
                    .slice()
                    .sort((a, b) => String(b.timestamp || b.day).localeCompare(String(a.timestamp || a.day)))
                    .map((t) => (
                      <tr key={t.id ?? `${t.timestamp}-${t.text}`}>
                        <td>{t.day}</td>
                        <td>{t.timestamp ? formatDtShort(t.timestamp) : "—"}</td>
                        <td className="oura-table-cell-wrap">{t.text ?? "—"}</td>
                        <td>{Array.isArray(t.tags) ? t.tags.join(", ") : "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {bundle?.tags?.ok && bundle.tags.data.length === 0 ? (
              <p className="oura-muted">No journal entries in this range.</p>
            ) : null}
          </section>
          <section className="card oura-table-card">
            <h2 className="section-title">Rest mode periods</h2>
            <div className="oura-table-wrap">
              <table className="oura-table">
                <thead>
                  <tr>
                    <th>Start</th>
                    <th>End</th>
                    <th>Episodes</th>
                  </tr>
                </thead>
                <tbody>
                  {(bundle?.restMode?.ok ? bundle.restMode.data : []).map((r) => (
                    <tr key={r.id ?? `${r.start_day}-${r.end_day}`}>
                      <td>
                        {r.start_day}
                        {r.start_time ? ` · ${r.start_time}` : ""}
                      </td>
                      <td>
                        {r.end_day}
                        {r.end_time ? ` · ${r.end_time}` : ""}
                      </td>
                      <td>{Array.isArray(r.episodes) ? r.episodes.length : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {bundle?.restMode?.ok && bundle.restMode.data.length === 0 ? (
              <p className="oura-muted">No rest mode periods in this range.</p>
            ) : null}
          </section>
        </>
      ) : null}

      {!fatalError && tab === "ring" ? (
        <div className="oura-ring-grid">
          <section className="card oura-table-card">
            <h2 className="section-title">Ring configuration</h2>
            <div className="oura-table-wrap">
              <table className="oura-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Color</th>
                    <th>Size</th>
                    <th>Firmware</th>
                    <th>Set up</th>
                  </tr>
                </thead>
                <tbody>
                  {(bundle?.ringConfig?.ok ? bundle.ringConfig.data : []).map((r) => (
                    <tr key={r.id ?? `${r.hardware_type}-${r.set_up_at}`}>
                      <td>{humanizeSnake(r.hardware_type || r.design || "—")}</td>
                      <td>{humanizeSnake(r.color || "—")}</td>
                      <td>{r.size ?? "—"}</td>
                      <td>{r.firmware_version ?? "—"}</td>
                      <td>{r.set_up_at ? formatDtShort(r.set_up_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card oura-table-card">
            <h2 className="section-title">Profile (from API)</h2>
            {bundle?.personalInfo?.ok ? (
              <dl className="oura-dl">
                <dt>Age</dt>
                <dd>{bundle.personalInfo.data.age ?? "—"}</dd>
                <dt>Height</dt>
                <dd>{bundle.personalInfo.data.height ?? "—"}</dd>
                <dt>Weight</dt>
                <dd>{bundle.personalInfo.data.weight ?? "—"}</dd>
                <dt>Sex</dt>
                <dd>{bundle.personalInfo.data.biological_sex ?? "—"}</dd>
                <dt>Email</dt>
                <dd>{maskEmail(bundle.personalInfo.data.email)}</dd>
              </dl>
            ) : (
              <p className="oura-muted">Profile could not be loaded.</p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
