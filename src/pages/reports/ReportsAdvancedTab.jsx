import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useLiveTrades } from "../../hooks/useLiveTrades";
import { filterTradesForReport, reportFiltersActive, DEFAULT_REPORT_FILTERS } from "../../lib/reportFilters";
import { sortTradesChronoAsc } from "../../lib/dashboardStats";
import {
  computeFillReplayStats,
  tradeFeesPaid,
  tradeGrossPnl,
  tradeSignedAmountForAggregation,
} from "../../lib/tradeExecutionMetrics";
import { CHART_GREEN, CHART_RED } from "../../lib/chartPalette";
import MetricHintIcon from "../../components/MetricHintIcon";
import { REPORTS_ADVANCED_TAB_HINT, REPORTS_ADVANCED_SCATTER_HINT } from "../../lib/metricHints";

/** @typedef {{ value: string, label: string }} AxisOption */

const AXIS_OPTIONS = /** @type {const} */ ([
  { value: "tradeIndex", label: "Trade # (chronological)" },
  { value: "netPnl", label: "Net P&L ($)" },
  { value: "grossPnl", label: "Gross P&L ($)" },
  { value: "volume", label: "Volume (shares)" },
  { value: "holdMinutes", label: "Hold time (min)" },
  { value: "feesPaid", label: "Fees paid ($)" },
  { value: "positionMfe", label: "Position MFE ($)" },
  { value: "positionMae", label: "Position MAE ($)" },
  { value: "dayOfWeek", label: "Day of week (Sun=0 … Sat=6)" },
  { value: "hour", label: "Hour of day (0–23)" },
]);

const PRESETS = /** @type {const} */ ([
  { value: "custom", label: "Custom…", xKey: null, yKey: null },
  { value: "pnl_index", label: "P&L vs trade #", xKey: "tradeIndex", yKey: "netPnl" },
  { value: "pnl_hold", label: "P&L vs hold (min)", xKey: "holdMinutes", yKey: "netPnl" },
  { value: "mae_index", label: "Position MAE vs trade #", xKey: "tradeIndex", yKey: "positionMae" },
  { value: "mfe_mae", label: "Position MFE vs MAE", xKey: "positionMfe", yKey: "positionMae" },
  { value: "vol_pnl", label: "Volume vs P&L", xKey: "volume", yKey: "netPnl" },
]);

const GRID = "#2a3140";
const TICK = { fill: "#94a3b8", fontSize: 10 };

/** @param {object} trade @param {string} key @param {number} index */
function axisValue(trade, key, index) {
  switch (key) {
    case "tradeIndex":
      return index + 1;
    case "netPnl":
      return tradeSignedAmountForAggregation(trade);
    case "grossPnl":
      return tradeGrossPnl(trade);
    case "volume":
      return Number(trade.volume) || 0;
    case "holdMinutes": {
      const h = Number(trade.holdMinutes);
      return Number.isFinite(h) ? h : null;
    }
    case "feesPaid":
      return tradeFeesPaid(trade);
    case "positionMfe": {
      const r = computeFillReplayStats(trade);
      return r.mfeDollars != null ? r.mfeDollars : null;
    }
    case "positionMae": {
      const r = computeFillReplayStats(trade);
      return r.maeDollars != null ? -r.maeDollars : null;
    }
    case "dayOfWeek": {
      if (!trade.date) return null;
      return new Date(`${String(trade.date)}T12:00:00`).getDay();
    }
    case "hour": {
      const raw = String(trade.time ?? "12:00:00").slice(0, 5);
      const [hh] = raw.split(":").map(Number);
      return Number.isFinite(hh) ? hh : null;
    }
    default:
      return null;
  }
}

/** @param {string} key */
function axisTickLabel(key, v) {
  if (!Number.isFinite(v)) return "";
  if (key === "tradeIndex" || key === "dayOfWeek" || key === "hour") return String(Math.round(v));
  if (
    key === "netPnl" ||
    key === "grossPnl" ||
    key === "feesPaid" ||
    key === "positionMfe" ||
    key === "positionMae"
  ) {
    return `$${Number(v).toFixed(0)}`;
  }
  if (key === "holdMinutes" || key === "volume") return String(Math.round(v));
  return String(v);
}

/** @param {string} key */
function axisShortLabel(key) {
  const o = AXIS_OPTIONS.find((a) => a.value === key);
  return o?.label ?? key;
}

function ScatterTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="chart-tooltip">
      {p.symbol != null && <div className="chart-tooltip-label">{String(p.symbol)}</div>}
      {p.date != null && <div className="chart-tooltip-row">{String(p.date)}</div>}
      <div className="chart-tooltip-row">
        <span>X</span>
        <span>{typeof p.x === "number" ? axisTickLabel(p.xKey, p.x) : p.x}</span>
      </div>
      <div className="chart-tooltip-row">
        <span>Y</span>
        <span>{typeof p.y === "number" ? axisTickLabel(p.yKey, p.y) : p.y}</span>
      </div>
      <div className="chart-tooltip-row">
        <span>Net P&L</span>
        <span>${Number(p.netPnl ?? 0).toFixed(2)}</span>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   id: string,
 *   label: string,
 *   value: string,
 *   options: AxisOption[],
 *   onChange: (v: string) => void,
 *   disabled?: boolean,
 * }} props
 */
function AdvancedCombobox({ id, label, value, options, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const listboxId = useId();
  const active = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onDoc(/** @type {MouseEvent} */ e) {
      const el = /** @type {Node | null} */ (e.target);
      if (!el || !wrapRef.current?.contains(el)) setOpen(false);
    }
    function onKey(/** @type {KeyboardEvent} */ e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="reports-advanced-field">
      <span id={id} className="reports-advanced-field-label">
        {label}
      </span>
      <div ref={wrapRef} className="trade-chart-send-combobox">
        <button
          type="button"
          className="trade-chart-send-combobox-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-labelledby={id}
          aria-label={`${label}: ${active.label}`}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span className="trade-chart-send-combobox-trigger-text">{active.label}</span>
        </button>
        {open ? (
          <ul className="trade-chart-send-combobox-menu" id={listboxId} role="listbox" aria-labelledby={id}>
            {options.map((o) => (
              <li key={o.value} className="trade-chart-send-combobox-li" role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  className={`trade-chart-send-combobox-option ${o.value === value ? "is-selected" : ""}`}
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
    </div>
  );
}

/** Custom scatter: same size when not scaling by P&amp;L. */
function TradeDot(/** @type {{ cx?: number, cy?: number, payload?: { fill?: string, r?: number } }} */ props) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const r = payload?.r ?? 6;
  const fill = payload?.fill ?? "#94a3b8";
  return <circle cx={cx} cy={cy} r={r} fill={fill} opacity={0.52} stroke="rgba(15,23,42,0.35)" strokeWidth={0.5} />;
}

export default function ReportsAdvancedTab() {
  const ctx = useOutletContext() ?? {};
  const applied = ctx.appliedReportFilters ?? DEFAULT_REPORT_FILTERS;
  const trades = useLiveTrades();
  const filtersOn = reportFiltersActive(applied);

  const [preset, setPreset] = useState("pnl_index");
  const [xKey, setXKey] = useState("tradeIndex");
  const [yKey, setYKey] = useState("netPnl");
  const [scaleByPnl, setScaleByPnl] = useState(false);

  const presetLabelId = useId();
  const xLabelId = useId();
  const yLabelId = useId();

  const filtered = useMemo(() => filterTradesForReport(trades, applied), [trades, applied]);

  function applyPreset(pid) {
    setPreset(pid);
    const def = PRESETS.find((p) => p.value === pid);
    if (def?.xKey && def?.yKey) {
      setXKey(def.xKey);
      setYKey(def.yKey);
    }
  }

  const presetOptions = useMemo(
    () => PRESETS.map((p) => ({ value: p.value, label: p.label })),
    [],
  );

  const axisOptions = useMemo(() => AXIS_OPTIONS.map((a) => ({ value: a.value, label: a.label })), []);

  const points = useMemo(() => {
    const sorted = sortTradesChronoAsc(filtered);
    const raw = sorted.map((t, i) => {
      const x = axisValue(t, xKey, i);
      const y = axisValue(t, yKey, i);
      if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      const net = tradeSignedAmountForAggregation(t);
      const fill = net >= 0 ? CHART_GREEN : CHART_RED;
      return {
        x,
        y,
        z: Math.max(1, Math.abs(net)),
        netPnl: net,
        fill,
        symbol: t.symbol,
        date: t.date,
        xKey,
        yKey,
      };
    });
    const list = raw.filter(Boolean);
    if (!scaleByPnl || !list.length) {
      return list.map((p) => ({ ...p, r: 6 }));
    }
    const maxZ = Math.max(...list.map((p) => p.z), 1);
    return list.map((p) => ({ ...p, r: 4 + 22 * (p.z / maxZ) }));
  }, [filtered, xKey, yKey, scaleByPnl]);

  return (
    <>
      <div className="reports-overview-toolbar">
        <p className="reports-filter-summary">
          <span className="reports-advanced-summary-head">
            <strong>Advanced</strong>
            <MetricHintIcon text={REPORTS_ADVANCED_TAB_HINT} />
          </span>{" "}
          — pick any two numeric trade fields (after Reports filters) for a scatter view.
          Replay-based <strong>Position MFE / MAE</strong> need fills on the trade.
          {filtersOn ? (
            <>
              {" "}
              Using <strong>{filtered.length}</strong> trades matching filters.
            </>
          ) : null}{" "}
          Bucket charts and donuts stay on{" "}
          <Link to="/reports/detailed">Detailed</Link>.
        </p>
      </div>

      <div className="card reports-advanced-panel">
        <div className="reports-advanced-controls">
          <AdvancedCombobox
            id={presetLabelId}
            label="Quick report"
            value={preset}
            options={presetOptions}
            onChange={applyPreset}
          />
          <div className="reports-advanced-axis-row">
            <AdvancedCombobox
              id={xLabelId}
              label="X axis"
              value={xKey}
              options={axisOptions}
              onChange={(v) => {
                setPreset("custom");
                setXKey(v);
              }}
            />
            <AdvancedCombobox
              id={yLabelId}
              label="Y axis"
              value={yKey}
              options={axisOptions}
              onChange={(v) => {
                setPreset("custom");
                setYKey(v);
              }}
            />
          </div>
          <label className="reports-advanced-scale">
            <input
              type="checkbox"
              checked={scaleByPnl}
              onChange={(e) => setScaleByPnl(e.target.checked)}
              className="reports-advanced-scale-input"
            />
            <span>Scale markers by |net P&amp;L|</span>
          </label>
        </div>

        <div className="reports-advanced-chart-card">
          <div className="panel-title reports-chart-title">
            <span className="reports-chart-title-text">
              {axisShortLabel(yKey)} vs {axisShortLabel(xKey)}
            </span>
            <MetricHintIcon text={REPORTS_ADVANCED_SCATTER_HINT} />
          </div>
          <div className="reports-advanced-scatter-area">
            {points.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name={axisShortLabel(xKey)}
                    tick={TICK}
                    stroke="#475569"
                    tickFormatter={(v) => axisTickLabel(xKey, v)}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name={axisShortLabel(yKey)}
                    tick={TICK}
                    stroke="#475569"
                    tickFormatter={(v) => axisTickLabel(yKey, v)}
                    width={56}
                  />
                  <Tooltip content={<ScatterTip />} cursor={{ strokeDasharray: "3 3" }} />
                  <Scatter name="Trades" data={points} shape={<TradeDot />} />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">
                No trades with valid values for both axes. Try <strong>Net P&L</strong> vs <strong>Trade #</strong>, or
                relax filters — fields like hold time or replay MFE/MAE are skipped when missing on a trade.
              </div>
            )}
          </div>
        </div>

        <p className="reports-advanced-foot">
          Plot winners and losers by duration, size, time-of-day, excursion, or dollar P&amp;L. Axes always match the
          labels above (no mismatched preview like a locked demo).
        </p>
      </div>
    </>
  );
}
