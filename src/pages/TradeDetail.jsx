import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSetupFilterSuggestions,
  collectAllTagsFromTrades,
  normalizeTagList,
} from "../lib/tradeTags";
import { usePlaybookPlayNames } from "../hooks/usePlaybookPlayNames";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  formatMoney,
  pnlClass,
  deleteTradesByStableIds,
} from "../storage/storage";
import { findTradeByParam, neighborTradeIds, stableTradeId } from "../storage/tradeLookup";
import { loadFillTimeZone } from "../storage/fillTimePrefs";
import {
  DEFAULT_ROUND_TRIP_SHADING,
  loadChartIndicatorPrefs,
  saveChartIndicatorPrefs,
} from "../storage/chartIndicatorPrefs";
import {
  loadChartGridVisible,
  loadChartSkinId,
  saveChartGridVisible,
  saveChartSkinId,
} from "../storage/chartAppearancePersist";
import ChartPresetsDropdown from "../components/ChartPresetsDropdown";
import { useRawAndReportTrades } from "../hooks/useReportViewTrades";
import { filterTradesForReport, reportFiltersActive } from "../lib/reportFilters";
import {
  loadPersistedReportFilters,
  REPORT_FILTERS_PERSIST_EVENT,
  REPORT_FILTERS_STORAGE_KEY,
} from "../storage/reportFiltersPersist";
import ChartIndicatorsModal from "../components/ChartIndicatorsModal";
const TradeExecutionChart = lazy(() => import("../components/TradeExecutionChart.jsx"));
import TradeNotesEditor from "../components/TradeNotesEditor";
import TradeTagsEditor from "../components/TradeTagsEditor";
import TradeSetupsEditor from "../components/TradeSetupsEditor";
import PlaybookChartSendModal from "../components/PlaybookChartSendModal";
import {
  captureChartElementAsPngBlob,
  captureDomElementAsPngBlob,
  stackPngBlobsVertical,
} from "../lib/chartImageCapture";
import { tradeFeesPaid, tradeGrossPnl, tradeNetPnl } from "../lib/tradeExecutionMetrics";
import { roundTripLegSummariesFromFills } from "../lib/fillRoundTrips";
import { formatChartIntervalLabel } from "../lib/chartIntervals";
import { formatPlaybookTradeTag } from "../lib/formatPlaybookTradeTag";
import MetricHintIcon from "../components/MetricHintIcon";
import { TRADE_SNAPSHOT_HINTS } from "../lib/metricHints";
import StarToggle from "../components/StarToggle";
import { useStarred } from "../hooks/useStarred";

/** @param {{ hintKey: string, children: import("react").ReactNode }} props */
function SnapshotDt({ hintKey, children }) {
  const hint = TRADE_SNAPSHOT_HINTS[hintKey];
  return (
    <dt>
      <span className="trade-detail-dt-row">
        <span>{children}</span>
        {hint ? <MetricHintIcon text={hint} /> : null}
      </span>
    </dt>
  );
}

function formatTradeWhen(trade) {
  const time = trade.time || "12:00:00";
  const d = new Date(`${trade.date}T${time}`);
  if (Number.isNaN(d.getTime())) {
    return trade.date;
  }
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatSessionIso(iso) {
  const s = String(iso ?? "").trim();
  if (!s) return "—";
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function TradeDetail() {
  const { tradeId: tradeIdParam } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const navStarred = searchParams.get("nav") === "starred";
  const { rawTrades } = useRawAndReportTrades();

  const trade = useMemo(
    () => findTradeByParam(rawTrades, tradeIdParam ?? "") ?? null,
    [rawTrades, tradeIdParam],
  );

  const [roundTripsExpanded, setRoundTripsExpanded] = useState(false);

  const roundTripLegs = useMemo(
    () => (trade ? roundTripLegSummariesFromFills(trade.fills) : []),
    [trade],
  );

  const ROUND_TRIPS_COLLAPSE_AT = 4;
  const roundTripLegsVisible = useMemo(() => {
    if (roundTripLegs.length <= ROUND_TRIPS_COLLAPSE_AT || roundTripsExpanded) return roundTripLegs;
    return roundTripLegs.slice(0, ROUND_TRIPS_COLLAPSE_AT);
  }, [roundTripLegs, roundTripsExpanded]);

  const feesPaid = useMemo(() => (trade ? tradeFeesPaid(trade) : 0), [trade]);
  const grossPnl = useMemo(() => (trade ? tradeGrossPnl(trade) : 0), [trade]);
  const netPnl = useMemo(() => (trade ? tradeNetPnl(trade) : 0), [trade]);
  const hasFeeCols = useMemo(() => {
    if (!trade) return false;
    return (trade.fills ?? []).some((f) => f && ("commission" in f || "miscFees" in f));
  }, [trade]);

  const tidNav = trade ? stableTradeId(trade) : "";
  const tidEditor = trade?._editorStableId ? String(trade._editorStableId) : tidNav;
  const { isTradeStarred, toggleTrade, starredTrades } = useStarred();
  const [chartInterval, setChartInterval] = useState("1");
  const [fillTimeZone] = useState(() => loadFillTimeZone());
  const [indicatorPrefs, setIndicatorPrefs] = useState(() => loadChartIndicatorPrefs());
  const [chartSkinId, setChartSkinId] = useState(() => loadChartSkinId());
  const [chartGridVisible, setChartGridVisible] = useState(() => loadChartGridVisible());
  const [indicatorsCatalogOpen, setIndicatorsCatalogOpen] = useState(false);
  const [playbookSendOpen, setPlaybookSendOpen] = useState(false);
  const [chartToolbarMsg, setChartToolbarMsg] = useState(/** @type {string | null} */ (null));
  const [shareBusy, setShareBusy] = useState(false);
  /** Applied Trades/Journal/Reports filters — prev/next chart nav only walks trades in this set. */
  const [appliedNavFilters, setAppliedNavFilters] = useState(() => loadPersistedReportFilters());
  const chartWrapRef = useRef(null);
  const tradeShareBundleRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const tradeSharePanelsRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const tradeShareChartSectionRef = useRef(/** @type {HTMLElement | null} */ (null));
  const chartIntervalLabel = useMemo(() => formatChartIntervalLabel(chartInterval), [chartInterval]);

  const getChartCaptureEl = useCallback(() => {
    return chartWrapRef.current?.querySelector(".trade-execution-chart-host") ?? null;
  }, []);

  useEffect(() => {
    if (!chartToolbarMsg) return;
    const t = window.setTimeout(() => setChartToolbarMsg(null), 4500);
    return () => window.clearTimeout(t);
  }, [chartToolbarMsg]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setRoundTripsExpanded(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [tidNav, trade]);

  useEffect(() => {
    function onFiltersPersisted() {
      setAppliedNavFilters(loadPersistedReportFilters());
    }
    window.addEventListener(REPORT_FILTERS_PERSIST_EVENT, onFiltersPersisted);
    return () => window.removeEventListener(REPORT_FILTERS_PERSIST_EVENT, onFiltersPersisted);
  }, []);

  useEffect(() => {
    function onStorage(/** @type {StorageEvent} */ e) {
      if (e.key === REPORT_FILTERS_STORAGE_KEY) setAppliedNavFilters(loadPersistedReportFilters());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  async function copyChartScreenshotToClipboard() {
    const el = getChartCaptureEl();
    if (!el) {
      setChartToolbarMsg("Chart is not ready to capture yet.");
      return;
    }
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
      setChartToolbarMsg("Clipboard image copy is not supported in this browser.");
      return;
    }
    try {
      const blob = await captureChartElementAsPngBlob(el);
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setChartToolbarMsg("Chart screenshot copied to clipboard.");
    } catch {
      setChartToolbarMsg("Could not copy the chart. Try again after the chart finishes loading.");
    }
  }

  async function copyTradeShareBundleToClipboard() {
    const bundleEl = tradeShareBundleRef.current;
    const panelsEl = tradeSharePanelsRef.current;
    const chartSectionEl = tradeShareChartSectionRef.current;
    if (!bundleEl) {
      setChartToolbarMsg("Nothing to capture yet.");
      return;
    }
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
      setChartToolbarMsg("Clipboard image copy is not supported in this browser.");
      return;
    }
    setShareBusy(true);
    try {
      /** @type {Blob} */
      let blob;
      if (panelsEl && chartSectionEl) {
        const [chartBlob, panelsBlob] = await Promise.all([
          captureDomElementAsPngBlob(chartSectionEl),
          captureDomElementAsPngBlob(panelsEl),
        ]);
        blob = await stackPngBlobsVertical(chartBlob, panelsBlob);
      } else {
        blob = await captureDomElementAsPngBlob(bundleEl);
      }
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setChartToolbarMsg("Chart, snapshot, and notes copied to clipboard.");
    } catch {
      setChartToolbarMsg("Could not copy the image. Wait for the chart to load, then try again.");
    } finally {
      setShareBusy(false);
    }
  }

  const applyIndicatorPrefs = useCallback((next) => {
    setIndicatorPrefs(next);
    saveChartIndicatorPrefs(next);
  }, []);

  const applyFullChartSetup = useCallback((o) => {
    applyIndicatorPrefs(o.prefs);
    if (o.skin === "tos" || o.skin === "das") {
      setChartSkinId(o.skin);
      saveChartSkinId(o.skin);
    }
    if (typeof o.gridVisible === "boolean") {
      setChartGridVisible(o.gridVisible);
      saveChartGridVisible(o.gridVisible);
    }
  }, [applyIndicatorPrefs]);

  const toggleChartGrid = useCallback(() => {
    setChartGridVisible((prev) => {
      const next = !prev;
      saveChartGridVisible(next);
      return next;
    });
  }, []);

  const patchEma = useCallback((id, partial) => {
    setIndicatorPrefs((prev) => {
      const next = {
        ...prev,
        emaLines: prev.emaLines.map((e) => (e.id === id ? { ...e, ...partial } : e)),
      };
      saveChartIndicatorPrefs(next);
      return next;
    });
  }, []);

  const patchVwap = useCallback((partial) => {
    setIndicatorPrefs((prev) => {
      const next = { ...prev, vwap: { ...prev.vwap, ...partial } };
      saveChartIndicatorPrefs(next);
      return next;
    });
  }, []);

  const patchMarkers = useCallback((partial) => {
    setIndicatorPrefs((prev) => {
      const next = { ...prev, markers: { ...prev.markers, ...partial } };
      saveChartIndicatorPrefs(next);
      return next;
    });
  }, []);

  const patchRoundTripShading = useCallback((partial) => {
    setIndicatorPrefs((prev) => {
      const rt = prev.roundTripShading ?? DEFAULT_ROUND_TRIP_SHADING;
      const next = { ...prev, roundTripShading: { ...rt, ...partial } };
      saveChartIndicatorPrefs(next);
      return next;
    });
  }, []);

  const removeEmaLine = useCallback((id) => {
    setIndicatorPrefs((prev) => {
      const next = { ...prev, emaLines: prev.emaLines.filter((e) => e.id !== id) };
      saveChartIndicatorPrefs(next);
      return next;
    });
  }, []);

  const tradesForChartNav = useMemo(() => {
    if (navStarred) {
      return rawTrades.filter((t) => starredTrades.has(stableTradeId(t)));
    }
    if (!reportFiltersActive(appliedNavFilters)) return rawTrades;
    return filterTradesForReport(rawTrades, appliedNavFilters);
  }, [rawTrades, appliedNavFilters, navStarred, starredTrades]);

  const { prev, next } = useMemo(
    () => (tidNav ? neighborTradeIds(tradesForChartNav, tidNav) : { prev: null, next: null }),
    [tradesForChartNav, tidNav],
  );

  const allTagSuggestions = useMemo(() => collectAllTagsFromTrades(rawTrades), [rawTrades]);
  const playbookPlayNames = usePlaybookPlayNames();
  const allSetupSuggestions = useMemo(
    () => buildSetupFilterSuggestions(rawTrades, playbookPlayNames),
    [rawTrades, playbookPlayNames],
  );

  const go = useCallback(
    (id) => {
      if (!id) return;
      const q = navStarred ? "?nav=starred" : "";
      navigate(`/trades/${encodeURIComponent(id)}${q}`);
    },
    [navigate, navStarred],
  );

  function removeTrade() {
    if (!trade) return;
    const ids =
      trade._storageStableIds?.length > 0
        ? [...trade._storageStableIds]
        : [tidEditor].filter(Boolean);
    const ok = window.confirm(
      ids.length > 1
        ? `Delete all ${ids.length} stored rows for this position? This cannot be undone.`
        : "Delete this trade? This cannot be undone.",
    );
    if (!ok) return;
    const n = deleteTradesByStableIds(new Set(ids));
    if (n > 0) navigate("/trades");
  }

  const fills = trade?.fills ?? [];

  const tradeDetailHeaderHasChipsRow = useMemo(
    () => normalizeTagList(trade?.setups).length > 0 || normalizeTagList(trade?.tags).length > 0,
    [trade?.setups, trade?.tags],
  );

  if (!trade) {
    return (
      <div className="page-wrap trade-detail-page">
        <div className="trade-detail-header-bar">
          <Link to="/trades" className="trade-detail-back">
            ← Back
          </Link>
        </div>
        <div className="card trade-detail-not-found">
          <h1>Trade not found</h1>
          <p>No trade matches this link. It may have been removed or the URL is invalid.</p>
          <Link to="/trades" className="trade-detail-back">
            Return to Trades
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap trade-detail-page">
      <div className="trade-detail-page-head">
        <header className="trade-detail-header-bar">
          <div className="trade-detail-header-start">
            <Link to="/trades" className="trade-detail-back">
              ← Back
            </Link>
            <div className="trade-detail-header-titles">
              <h1 className="trade-detail-symbol">{trade.symbol}</h1>
              <p className="trade-detail-when">{formatTradeWhen(trade)}</p>
            </div>
          </div>
          <div className="trade-detail-nav-actions">
            <div
              className="trade-detail-trade-step-group"
              role="group"
              aria-label={navStarred ? "Navigate between starred trades" : "Navigate between trades"}
            >
              <button
                type="button"
                className="trade-detail-trade-step-btn"
                disabled={!prev}
                onClick={() => go(prev)}
                title={
                  prev
                    ? navStarred
                      ? "Open previous starred trade"
                      : "Open previous trade in this list"
                    : navStarred
                      ? "No previous starred trade"
                      : "No previous trade in list"
                }
              >
                Previous trade
              </button>
              <button
                type="button"
                className="trade-detail-trade-step-btn"
                disabled={!next}
                onClick={() => go(next)}
                title={
                  next
                    ? navStarred
                      ? "Open next starred trade"
                      : "Open next trade in this list"
                    : navStarred
                      ? "No next starred trade"
                      : "No next trade in list"
                }
              >
                Next trade
              </button>
            </div>
            <StarToggle
              starred={Boolean(tidNav && isTradeStarred(tidNav))}
              onToggle={() => {
                if (tidNav) toggleTrade(tidNav);
              }}
              className="trade-detail-header-icon-btn trade-detail-header-icon-btn--star"
              title={
                tidNav && isTradeStarred(tidNav)
                  ? "Remove from starred (*)"
                  : "Star this trade for review on the * page"
              }
              aria-label={tidNav && isTradeStarred(tidNav) ? "Unstar trade" : "Star trade"}
            />
            <button
              type="button"
              className="trade-detail-header-share-btn"
              onClick={() => void copyTradeShareBundleToClipboard()}
              disabled={shareBusy}
              title="Copy chart, snapshot, and notes as one image (chart on top)"
              aria-label="Copy chart, snapshot, and notes as one image to clipboard"
            >
              <svg
                className="trade-detail-header-share-icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="18" cy="5" r="2.5" />
                <circle cx="6" cy="12" r="2.5" />
                <circle cx="18" cy="19" r="2.5" />
                <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
              </svg>
              <span>Share</span>
            </button>
            <button
              type="button"
              className="trade-detail-header-icon-btn trade-detail-header-icon-btn--danger"
              onClick={removeTrade}
              title="Remove this trade"
              aria-label="Remove this trade"
            >
              <svg
                className="trade-detail-header-delete-icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          </div>
        </header>
        <div className="trade-detail-header-tags trade-detail-header-tags--split">
          <div className="trade-detail-header-tags-actions">
            <TradeSetupsEditor
              variant="picker"
              tradeId={tidEditor}
              setups={trade.setups}
              suggestionSetups={allSetupSuggestions}
            />
            <TradeTagsEditor variant="picker" tradeId={tidEditor} tags={trade.tags} suggestionTags={allTagSuggestions} />
          </div>
          {tradeDetailHeaderHasChipsRow ? (
            <div className="trade-detail-header-tags-chips" aria-label="Setups and tags on this trade">
              <TradeSetupsEditor
                variant="chips"
                tradeId={tidEditor}
                setups={trade.setups}
                suggestionSetups={allSetupSuggestions}
              />
              <TradeTagsEditor variant="chips" tradeId={tidEditor} tags={trade.tags} suggestionTags={allTagSuggestions} />
            </div>
          ) : null}
        </div>
      </div>

      <div ref={tradeShareBundleRef} className="trade-detail-share-bundle">
        <div ref={tradeSharePanelsRef} className="trade-detail-panels">
        <section className="card trade-detail-stats">
          <h2 className="trade-detail-section-title">Snapshot</h2>
          <dl className="trade-detail-stat-grid">
            <div className="trade-detail-stat-cell">
              <SnapshotDt hintKey="sharesTraded">Shares Traded</SnapshotDt>
              <dd>{trade.volume}</dd>
            </div>
            <div className="trade-detail-stat-cell">
              <SnapshotDt hintKey="closedPnlNet">Closed P&amp;L (net)</SnapshotDt>
              <dd className={pnlClass(netPnl)}>{formatMoney(netPnl)}</dd>
            </div>
            <div className="trade-detail-stat-cell">
              <SnapshotDt hintKey="grossPnl">Gross P&amp;L</SnapshotDt>
              <dd className={pnlClass(grossPnl)}>{formatMoney(grossPnl)}</dd>
            </div>
            <div className="trade-detail-stat-cell">
              <SnapshotDt hintKey="commissionsFees">Commissions + fees</SnapshotDt>
              <dd className={hasFeeCols ? pnlClass(-feesPaid) : "trades-cell-muted"}>
                {hasFeeCols ? formatMoney(-feesPaid) : "—"}
              </dd>
            </div>
          </dl>
          {roundTripLegs.length > 0 ? (
            <>
              <div className="trade-detail-roundtrips" aria-label="Round trips from executions">
                {roundTripLegsVisible.map((leg) => (
                  <div key={leg.legIndex} className="trade-detail-roundtrip-card">
                    <div className="trade-detail-roundtrip-head">
                      <span className="trade-detail-roundtrip-title">Trade {leg.legIndex + 1}</span>
                      <div className="trade-detail-roundtrip-badges">
                        {leg.openingSide ? (
                          <span
                            className={`trade-detail-roundtrip-dir trade-detail-roundtrip-dir--${leg.openingSide}`}
                            title={leg.openingSide === "long" ? "Long" : "Short"}
                          >
                            {leg.openingSide === "long" ? "Long" : "Short"}
                          </span>
                        ) : null}
                        {leg.isOpen ? <span className="trade-detail-roundtrip-badge">Open</span> : null}
                      </div>
                    </div>
                    <div className="trade-detail-roundtrip-body">
                      <span className="trade-detail-roundtrip-kv">
                        <span className="trade-detail-roundtrip-k">Avg entry</span>
                        <span className="trade-detail-roundtrip-v">
                          {leg.avgEntry != null && Number.isFinite(leg.avgEntry)
                            ? `$${leg.avgEntry.toFixed(leg.avgEntry >= 100 ? 2 : 4)}`
                            : "—"}
                        </span>
                      </span>
                      <span className="trade-detail-roundtrip-kv">
                        <span className="trade-detail-roundtrip-k">Avg exit</span>
                        <span className="trade-detail-roundtrip-v">
                          {leg.avgExit != null && Number.isFinite(leg.avgExit)
                            ? `$${leg.avgExit.toFixed(leg.avgExit >= 100 ? 2 : 4)}`
                            : "—"}
                        </span>
                      </span>
                      <span className="trade-detail-roundtrip-kv">
                        <span className="trade-detail-roundtrip-k">P&amp;L</span>
                        <span className={`trade-detail-roundtrip-v ${leg.pnl != null ? pnlClass(leg.pnl) : "trades-cell-muted"}`}>
                          {leg.pnl != null && Number.isFinite(leg.pnl) ? formatMoney(leg.pnl) : "—"}
                        </span>
                      </span>
                      <span className="trade-detail-roundtrip-kv">
                        <span className="trade-detail-roundtrip-k">Share size</span>
                        <span className="trade-detail-roundtrip-v">{leg.shareSize > 0 ? leg.shareSize : "—"}</span>
                      </span>
                      {leg.entryDate ? (
                        <span className="trade-detail-roundtrip-kv">
                          <span className="trade-detail-roundtrip-k">Entry date</span>
                          <span className="trade-detail-roundtrip-v">{formatSessionIso(leg.entryDate)}</span>
                        </span>
                      ) : null}
                      {leg.exitDate ? (
                        <span className="trade-detail-roundtrip-kv">
                          <span className="trade-detail-roundtrip-k">
                            {leg.isOpen ? "Last session" : "Exit date"}
                          </span>
                          <span className="trade-detail-roundtrip-v">{formatSessionIso(leg.exitDate)}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              {roundTripLegs.length > ROUND_TRIPS_COLLAPSE_AT ? (
                <button
                  type="button"
                  className="trade-detail-roundtrips-toggle"
                  onClick={() => setRoundTripsExpanded((v) => !v)}
                  aria-expanded={roundTripsExpanded}
                >
                  {roundTripsExpanded
                    ? `Show only first ${ROUND_TRIPS_COLLAPSE_AT} trades`
                    : `Show ${roundTripLegs.length - ROUND_TRIPS_COLLAPSE_AT} more trade${roundTripLegs.length - ROUND_TRIPS_COLLAPSE_AT === 1 ? "" : "s"}`}
                </button>
              ) : null}
            </>
          ) : fills.length > 0 ? (
            <p className="trade-detail-roundtrips-empty trades-cell-muted">
              No BOT/SOLD legs detected in fills to list round trips.
            </p>
          ) : null}
        </section>

        <section className="card trade-detail-notes-panel">
          <h2 className="trade-detail-section-title">Notes</h2>
          <TradeNotesEditor key={tidEditor} tradeId={tidEditor} />
        </section>
        </div>

        <section
        ref={tradeShareChartSectionRef}
        className="card trade-detail-chart-section trade-detail-chart-section--primary"
        aria-label="Execution chart"
      >
        <div className="trade-detail-chart-toolbar">
          <div className="trade-detail-chart-toolbar-start">
            <div
              className="trade-detail-chart-symbol-strip"
              title={`${trade.symbol} - Charts · ${chartIntervalLabel}`}
            >
              <span className="trade-detail-chart-symbol-name">{trade.symbol} - Charts</span>
            </div>
            {chartToolbarMsg ? (
              <p className="trade-detail-chart-toolbar-msg" role="status" aria-live="polite">
                {chartToolbarMsg}
              </p>
            ) : null}
          </div>
          <div className="trade-detail-chart-tv-bar">
            <ChartPresetsDropdown
              prefs={indicatorPrefs}
              currentSkin={chartSkinId}
              chartGridVisible={chartGridVisible}
              onChange={applyIndicatorPrefs}
              onApplyFullSetup={applyFullChartSetup}
            />
            <button
              type="button"
              className="chart-tv-toolbar-btn chart-tv-toolbar-btn--icon-only"
              onClick={() => void copyChartScreenshotToClipboard()}
              aria-label="Copy chart screenshot to clipboard"
              title="Copy chart screenshot to clipboard"
            >
              <svg
                className="chart-tv-toolbar-catalog-icon"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                aria-hidden
              >
                <path
                  fill="currentColor"
                  d="M9 3h6l1.5 2H21a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4.5L9 3zm3 16a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-2a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"
                  opacity="0.92"
                />
              </svg>
            </button>
            <button
              type="button"
              className="chart-tv-toolbar-btn chart-tv-toolbar-btn--icon-only"
              onClick={() => setPlaybookSendOpen(true)}
              aria-label="Save chart screenshot to playbook"
              title="Save chart screenshot to a playbook play"
            >
              <svg
                className="chart-tv-toolbar-catalog-icon"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                aria-hidden
              >
                <path
                  fill="currentColor"
                  d="M6 2h12a2 2 0 0 1 2 2v16.5a1 1 0 0 1-1.55.83L12 18.09l-6.45 4.24A1 1 0 0 1 4 21.5V4a2 2 0 0 1 2-2zm2 2v15.09l4.45-2.92a1 1 0 0 1 1.1 0L16 19.09V4H8z"
                  opacity="0.92"
                />
              </svg>
            </button>
          </div>
        </div>
        <ChartIndicatorsModal
          open={indicatorsCatalogOpen}
          onClose={() => setIndicatorsCatalogOpen(false)}
          prefs={indicatorPrefs}
          onChange={(next) => {
            applyIndicatorPrefs(next);
          }}
        />
        <div className="trade-detail-execution-wrap" ref={chartWrapRef}>
          <Suspense
            fallback={
              <div className="trade-execution-chart trade-execution-chart--state trade-detail-chart-suspense-fallback">
                <p className="trade-execution-chart-msg">Loading chart…</p>
              </div>
            }
          >
            <TradeExecutionChart
              symbol={trade.symbol}
              tradeDate={trade.date}
              fills={fills}
              chartInterval={chartInterval}
              onChartIntervalChange={setChartInterval}
              fillTimeZone={fillTimeZone}
              indicatorPrefs={indicatorPrefs}
              onPatchEma={patchEma}
              onPatchVwap={patchVwap}
              onPatchMarkers={patchMarkers}
              onPatchRoundTripShading={patchRoundTripShading}
              onRemoveEmaLine={removeEmaLine}
              onOpenIndicatorsCatalog={() => setIndicatorsCatalogOpen(true)}
              chartSkinId={chartSkinId}
              chartGridVisible={chartGridVisible}
              onToggleChartGrid={toggleChartGrid}
            />
          </Suspense>
        </div>
        <PlaybookChartSendModal
          open={playbookSendOpen}
          onClose={() => setPlaybookSendOpen(false)}
          getCaptureEl={getChartCaptureEl}
          tradeSummary={`${trade.symbol} · ${trade.date}`}
          tradeTag={formatPlaybookTradeTag(trade.symbol, trade.date)}
          onSaved={() => setChartToolbarMsg("Chart saved to playbook.")}
        />
      </section>
      </div>
    </div>
  );
}
