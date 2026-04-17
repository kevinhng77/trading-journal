import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSetupFilterSuggestions, collectAllTagsFromTrades } from "../lib/tradeTags";
import { usePlaybookPlayNames } from "../hooks/usePlaybookPlayNames";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { useLiveTrades } from "../hooks/useLiveTrades";
import ChartIndicatorsModal from "../components/ChartIndicatorsModal";
import ChartPresetsDropdown from "../components/ChartPresetsDropdown";
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
import {
  computeFillReplayStats,
  tradeFeesPaid,
  tradeGrossPnl,
  tradeNetPnl,
} from "../lib/tradeExecutionMetrics";
import { formatChartIntervalLabel } from "../lib/chartIntervals";
import { formatPlaybookTradeTag } from "../lib/formatPlaybookTradeTag";
import { loadTradeAnnotationNotes, saveTradeAnnotationNotes } from "../storage/tradeAnnotationNotes";
import {
  loadTradeChartRiskLinesRaw,
  migrateRiskLineRows,
  saveTradeChartRiskLines,
} from "../storage/tradeChartRiskLines";
import { loadTradeChartTrendlines, saveTradeChartTrendlines } from "../storage/tradeChartTrendlines";
import { visiblePageNumbers } from "../lib/pagination";
import MetricHintIcon from "../components/MetricHintIcon";
import { TRADE_SNAPSHOT_HINTS } from "../lib/metricHints";
import StarToggle from "../components/StarToggle";
import { useStarred } from "../hooks/useStarred";

const EXECUTIONS_PAGE_SIZE = 15;

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

/** Paginated executions table; remount with key when trade changes to reset page. */
function TradeExecutionsTable({ fills }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(fills.length / EXECUTIONS_PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const offset = (pageClamped - 1) * EXECUTIONS_PAGE_SIZE;
  const slice = useMemo(
    () => fills.slice(offset, offset + EXECUTIONS_PAGE_SIZE),
    [fills, offset],
  );
  const pageItems = useMemo(
    () => visiblePageNumbers(totalPages, pageClamped),
    [totalPages, pageClamped],
  );

  return (
    <>
      <div className="table-card inner-table">
        <div className="table-header trade-detail-fill-grid">
          <div>Time</div>
          <div>Side</div>
          <div>Qty</div>
          <div>Price</div>
        </div>
        {slice.map((f) => (
          <div
            key={f.id != null && String(f.id) !== "" ? String(f.id) : `${f.time}|${f.side}|${f.quantity}|${f.price}`}
            className="table-row trade-detail-fill-grid"
          >
            <div className="journal-time-cell">{f.time}</div>
            <div>{f.side}</div>
            <div>{f.quantity}</div>
            <div>{f.price}</div>
          </div>
        ))}
      </div>
      {fills.length > EXECUTIONS_PAGE_SIZE && (
        <nav className="trade-detail-fills-pagination" aria-label="Executions pages">
          <button
            type="button"
            className="trade-detail-fills-page-btn trade-detail-fills-page-btn--nav"
            disabled={pageClamped <= 1}
            onClick={() => setPage(pageClamped - 1)}
            aria-label="Previous page"
          >
            ‹
          </button>
          {pageItems.map((item, i) =>
            item === "ellipsis" ? (
              <span key={`e-${i}`} className="trade-detail-fills-page-ellipsis" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={
                  item === pageClamped
                    ? "trade-detail-fills-page-btn trade-detail-fills-page-btn--active"
                    : "trade-detail-fills-page-btn"
                }
                onClick={() => setPage(item)}
                aria-label={`Page ${item}`}
                aria-current={item === pageClamped ? "page" : undefined}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            className="trade-detail-fills-page-btn trade-detail-fills-page-btn--nav"
            disabled={pageClamped >= totalPages}
            onClick={() => setPage(pageClamped + 1)}
            aria-label="Next page"
          >
            ›
          </button>
        </nav>
      )}
    </>
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

export default function TradeDetail() {
  const { tradeId: tradeIdParam } = useParams();
  const navigate = useNavigate();
  const trades = useLiveTrades();

  const trade = useMemo(
    () => findTradeByParam(trades, tradeIdParam ?? ""),
    [trades, tradeIdParam],
  );

  const replay = useMemo(() => (trade ? computeFillReplayStats(trade) : null), [trade]);
  const feesPaid = useMemo(() => (trade ? tradeFeesPaid(trade) : 0), [trade]);
  const grossPnl = useMemo(() => (trade ? tradeGrossPnl(trade) : 0), [trade]);
  const netPnl = useMemo(() => (trade ? tradeNetPnl(trade) : 0), [trade]);
  const hasFeeCols = useMemo(() => {
    if (!trade) return false;
    return (trade.fills ?? []).some((f) => f && ("commission" in f || "miscFees" in f));
  }, [trade]);

  const tid = trade ? stableTradeId(trade) : "";
  const { isTradeStarred, toggleTrade } = useStarred();
  const [chartInterval, setChartInterval] = useState("1");
  const [fillTimeZone] = useState(() => loadFillTimeZone());
  const [indicatorPrefs, setIndicatorPrefs] = useState(() => loadChartIndicatorPrefs());
  const [indicatorsCatalogOpen, setIndicatorsCatalogOpen] = useState(false);
  const [playbookSendOpen, setPlaybookSendOpen] = useState(false);
  const [chartToolbarMsg, setChartToolbarMsg] = useState(/** @type {string | null} */ (null));
  const [shareBusy, setShareBusy] = useState(false);
  const [riskLineMarkMode, setRiskLineMarkMode] = useState(false);
  const [riskLines, setRiskLines] = useState(() => []);
  const [trendlineDrawMode, setTrendlineDrawMode] = useState(false);
  const [trendlines, setTrendlines] = useState(() => []);
  const [annotationNotes, setAnnotationNotes] = useState(() => []);
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
      if (!tid) {
        setRiskLines([]);
        setRiskLineMarkMode(false);
        setTrendlines([]);
        setTrendlineDrawMode(false);
        setAnnotationNotes([]);
        return;
      }
      setRiskLines(migrateRiskLineRows(loadTradeChartRiskLinesRaw(tid), trade));
      setRiskLineMarkMode(false);
      const tl = loadTradeChartTrendlines(tid);
      setTrendlines(tl);
      setTrendlineDrawMode(false);
      const rawAnn = loadTradeAnnotationNotes(tid);
      const n = tl.length;
      const aligned = [];
      for (let i = 0; i < n; i += 1) aligned.push(typeof rawAnn[i] === "string" ? rawAnn[i] : "");
      setAnnotationNotes(aligned);
    });
    return () => cancelAnimationFrame(raf);
  }, [tid, trade]);

  useEffect(() => {
    if (!tid) return;
    const raf = requestAnimationFrame(() => {
      setAnnotationNotes((prev) => {
        const n = trendlines.length;
        if (prev.length === n) return prev;
        const next = prev.slice(0, n);
        while (next.length < n) next.push("");
        saveTradeAnnotationNotes(tid, next);
        return next;
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [trendlines.length, tid]);

  useEffect(() => {
    if (!riskLineMarkMode && !trendlineDrawMode) return;
    function onKey(/** @type {KeyboardEvent} */ e) {
      if (e.key === "Escape") {
        setRiskLineMarkMode(false);
        setTrendlineDrawMode(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [riskLineMarkMode, trendlineDrawMode]);

  const addRiskLineSegment = useCallback((seg) => {
    if (!tid || !seg || !Number.isFinite(seg.price) || seg.t1 == null || seg.t2 == null) return;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `rl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setRiskLines((prev) => {
      const next = [...prev, { id, t1: seg.t1, t2: seg.t2, price: seg.price }];
      saveTradeChartRiskLines(tid, next);
      return next;
    });
  }, [tid]);

  const clearRiskLines = useCallback(() => {
    if (!tid) return;
    setRiskLines([]);
    saveTradeChartRiskLines(tid, []);
  }, [tid]);

  const onTrendlinesChange = useCallback((updater) => {
    if (!tid) return;
    setTrendlines((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveTradeChartTrendlines(tid, next);
      return next;
    });
  }, [tid]);

  const undoLastTrendline = useCallback(() => {
    if (!tid) return;
    setTrendlines((prev) => {
      const next = prev.slice(0, -1);
      saveTradeChartTrendlines(tid, next);
      return next;
    });
  }, [tid]);

  const clearTrendlines = useCallback(() => {
    if (!tid) return;
    setTrendlines([]);
    saveTradeChartTrendlines(tid, []);
    setAnnotationNotes([]);
    saveTradeAnnotationNotes(tid, []);
  }, [tid]);

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

  const { prev, next } = useMemo(
    () => (tid ? neighborTradeIds(trades, tid) : { prev: null, next: null }),
    [trades, tid],
  );

  const allTagSuggestions = useMemo(() => collectAllTagsFromTrades(trades), [trades]);
  const playbookPlayNames = usePlaybookPlayNames();
  const allSetupSuggestions = useMemo(
    () => buildSetupFilterSuggestions(trades, playbookPlayNames),
    [trades, playbookPlayNames],
  );

  function go(id) {
    if (!id) return;
    navigate(`/trades/${encodeURIComponent(id)}`);
  }

  function removeTrade() {
    if (!tid) return;
    const ok = window.confirm("Delete this trade? This cannot be undone.");
    if (!ok) return;
    const n = deleteTradesByStableIds(new Set([tid]));
    if (n > 0) navigate("/trades");
  }

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

  const fills = trade.fills ?? [];
  const pxMfeMae =
    replay &&
    replay.maxAbsShares > 0 &&
    replay.mfeDollars != null &&
    replay.maeDollars != null
      ? `${(replay.mfeDollars / replay.maxAbsShares).toFixed(4)} / ${(-replay.maeDollars / replay.maxAbsShares).toFixed(4)}`
      : "—";

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
            <div className="trade-detail-trade-step-group" role="group" aria-label="Navigate between trades">
              <button
                type="button"
                className="trade-detail-trade-step-btn"
                disabled={!prev}
                onClick={() => go(prev)}
                title={prev ? "Open previous trade in this list" : "No previous trade in list"}
              >
                Previous trade
              </button>
              <button
                type="button"
                className="trade-detail-trade-step-btn"
                disabled={!next}
                onClick={() => go(next)}
                title={next ? "Open next trade in this list" : "No next trade in list"}
              >
                Next trade
              </button>
            </div>
            <StarToggle
              starred={Boolean(tid && isTradeStarred(tid))}
              onToggle={() => {
                if (tid) toggleTrade(tid);
              }}
              className="trade-detail-header-icon-btn trade-detail-header-icon-btn--star"
              title={
                tid && isTradeStarred(tid)
                  ? "Remove from starred (*)"
                  : "Star this trade for review on the * page"
              }
              aria-label={tid && isTradeStarred(tid) ? "Unstar trade" : "Star trade"}
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
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="currentColor">
                <path d="M9 3h6a1 1 0 0 1 1 1v1h4v2H4V5h4V4a1 1 0 0 1 1-1zm1 5h2v10h-2V8zm4 0h2v10h-2V8zM7 8h2v10H7V8z" />
              </svg>
            </button>
          </div>
        </header>
        <div className="trade-detail-header-tags">
          <TradeTagsEditor tradeId={tid} tags={trade.tags} suggestionTags={allTagSuggestions} />
          <TradeSetupsEditor tradeId={tid} setups={trade.setups} suggestionSetups={allSetupSuggestions} />
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
            <div className="trade-detail-stat-cell">
              <SnapshotDt hintKey="fillCount">Fill count</SnapshotDt>
              <dd>{trade.executions}</dd>
            </div>
            <div className="trade-detail-stat-cell">
              <SnapshotDt hintKey="bestExitPnl">Best exit P&amp;L</SnapshotDt>
              <dd className={replay?.bestExitDollars != null ? pnlClass(replay.bestExitDollars) : "trades-cell-muted"}>
                {replay?.bestExitDollars != null ? formatMoney(replay.bestExitDollars) : "—"}
              </dd>
            </div>
            <div className="trade-detail-stat-cell">
              <SnapshotDt hintKey="positionMfe">Position MFE</SnapshotDt>
              <dd className={replay?.mfeDollars != null ? "green" : "trades-cell-muted"}>
                {replay?.mfeDollars != null ? formatMoney(replay.mfeDollars) : "—"}
              </dd>
            </div>
            <div className="trade-detail-stat-cell">
              <SnapshotDt hintKey="positionMae">Position MAE</SnapshotDt>
              <dd className={replay?.maeDollars != null ? "red" : "trades-cell-muted"}>
                {replay?.maeDollars != null ? formatMoney(-replay.maeDollars) : "—"}
              </dd>
            </div>
            <div className="trade-detail-stat-cell">
              <SnapshotDt hintKey="priceMfeMae">Price MFE / MAE</SnapshotDt>
              <dd className={pxMfeMae === "—" ? "trades-cell-muted" : ""}>{pxMfeMae}</dd>
            </div>
            <div className="trade-detail-stat-cell">
              <SnapshotDt hintKey="exitEfficiency">Exit efficiency</SnapshotDt>
              <dd className="trades-cell-muted">
                {replay?.exitEfficiency != null ? `${(replay.exitEfficiency * 100).toFixed(0)}%` : "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="card trade-detail-notes-panel">
          <h2 className="trade-detail-section-title">Notes</h2>
          <TradeNotesEditor
            key={tid}
            tradeId={tid}
            numberedMarkerCount={trendlines.length}
            annotationNotes={annotationNotes}
            onAnnotationNotesChange={(rows) => {
              setAnnotationNotes(rows);
              saveTradeAnnotationNotes(tid, rows);
            }}
          />
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
            <div className="trade-detail-chart-tools-left" role="toolbar" aria-label="Chart markup">
              <button
                type="button"
                className={`chart-tv-toolbar-btn chart-tv-toolbar-btn--icon-only${trendlineDrawMode ? " is-active" : ""}`}
                onClick={() => {
                  setRiskLineMarkMode(false);
                  setTrendlineDrawMode((v) => !v);
                }}
                aria-pressed={trendlineDrawMode}
                aria-label={
                  trendlineDrawMode ? "Stop placing numbered chart notes" : "Place numbered chart notes"
                }
                title={
                  trendlineDrawMode
                    ? "Click the chart to drop the next number. Each number has a matching note in Notes below. Esc to stop."
                    : "Numbered notes: turn on, then click the chart once per marker. Write details next to each number under Notes."
                }
              >
                <svg
                  className="chart-tv-toolbar-catalog-icon"
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <circle cx="6" cy="7" r="2.25" fill="currentColor" stroke="none" opacity="0.95" />
                  <circle cx="6" cy="12" r="2.25" fill="currentColor" stroke="none" opacity="0.95" />
                  <circle cx="6" cy="17" r="2.25" fill="currentColor" stroke="none" opacity="0.95" />
                  <path d="M11 7h9M11 12h9M11 17h7" opacity="0.92" />
                </svg>
              </button>
              <button
                type="button"
                className={`chart-tv-toolbar-btn chart-tv-toolbar-btn--icon-only${riskLineMarkMode ? " is-active" : ""}`}
                onClick={() => {
                  setTrendlineDrawMode(false);
                  setRiskLineMarkMode((v) => !v);
                }}
                aria-pressed={riskLineMarkMode}
                aria-label={riskLineMarkMode ? "Stop drawing risk segments" : "Draw risk segments on chart"}
                title={
                  riskLineMarkMode
                    ? "Drag on the chart: press, drag horizontally, release. Y snaps to a clean price level; no axis label. Esc or click again to stop."
                    : "Horizontal risk segment (TradingView-style): turn on, press on the chart, drag to the end time, release. Saved per trade."
                }
              >
                <svg
                  className="chart-tv-toolbar-catalog-icon"
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M4 12h16" opacity="0.95" />
                  <path d="M7 8v8M12 7v10M17 9v6" opacity="0.4" />
                </svg>
              </button>
              {trendlines.length > 0 ? (
                <>
                  <button
                    type="button"
                    className="trade-detail-chart-risk-clear"
                    onClick={undoLastTrendline}
                    title="Remove the last numbered chart marker"
                    aria-label="Undo last numbered marker"
                  >
                    Undo #
                  </button>
                  <button
                    type="button"
                    className="trade-detail-chart-risk-clear"
                    onClick={clearTrendlines}
                    title="Remove all numbered markers and their chart notes"
                    aria-label="Clear all numbered markers"
                  >
                    Clear #
                  </button>
                </>
              ) : null}
              {riskLines.length > 0 ? (
                <button
                  type="button"
                  className="trade-detail-chart-risk-clear"
                  onClick={clearRiskLines}
                  title="Remove all horizontal risk segments for this trade"
                  aria-label="Clear risk segments"
                >
                  Clear lines
                </button>
              ) : null}
            </div>
            <ChartPresetsDropdown prefs={indicatorPrefs} onChange={applyIndicatorPrefs} />
            {chartToolbarMsg ? (
              <p className="trade-detail-chart-toolbar-msg" role="status" aria-live="polite">
                {chartToolbarMsg}
              </p>
            ) : null}
          </div>
          <div className="trade-detail-chart-tv-bar">
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
              riskLines={riskLines}
              onAddRiskLine={addRiskLineSegment}
              riskLineMarkMode={riskLineMarkMode}
              trendlines={trendlines}
              onTrendlinesChange={onTrendlinesChange}
              trendlineDrawMode={trendlineDrawMode}
              onOpenIndicatorsCatalog={() => setIndicatorsCatalogOpen(true)}
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

      {fills.length > 0 && (
        <section className="card trade-detail-fills">
          <h2 className="trade-detail-section-title">Imported fills</h2>
          <p className="trade-detail-fills-hint">
            On intraday charts, vertical tints mark each complete round trip (shares return to flat); open size at the
            end of the sequence is not tinted. Toggle shading and colors under chart Executions (⚙).
          </p>
          <TradeExecutionsTable key={tid} fills={fills} />
        </section>
      )}
    </div>
  );
}
