import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { collectAllTagsFromTrades } from "../lib/tradeTags";
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
import {
  computeFillReplayStats,
  tradeFeesPaid,
  tradeGrossPnl,
  tradeNetPnl,
} from "../lib/tradeExecutionMetrics";
import { formatChartIntervalLabel } from "../lib/chartIntervals";
import { visiblePageNumbers } from "../lib/pagination";

const EXECUTIONS_PAGE_SIZE = 15;

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
  const [chartInterval, setChartInterval] = useState("1");
  const [fillTimeZone] = useState(() => loadFillTimeZone());
  const [indicatorPrefs, setIndicatorPrefs] = useState(() => loadChartIndicatorPrefs());
  const [indicatorsCatalogOpen, setIndicatorsCatalogOpen] = useState(false);
  const chartIntervalLabel = useMemo(() => formatChartIntervalLabel(chartInterval), [chartInterval]);

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

  function go(id) {
    if (!id) return;
    navigate(`/trades/${encodeURIComponent(id)}`);
  }

  async function copyTradeUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      /* ignore */
    }
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
            <button
              type="button"
              className="trade-detail-header-icon-btn"
              onClick={copyTradeUrl}
              title="Copy link to this trade"
              aria-label="Copy link to this trade"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="currentColor">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
              </svg>
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
        </div>
      </div>

      <div className="trade-detail-panels">
        <section className="card trade-detail-stats">
          <h2 className="trade-detail-section-title">Snapshot</h2>
          <dl className="trade-detail-stat-grid">
            <div className="trade-detail-stat-cell">
              <dt>Shares Traded</dt>
              <dd>{trade.volume}</dd>
            </div>
            <div className="trade-detail-stat-cell">
              <dt>Closed P&amp;L (net)</dt>
              <dd className={pnlClass(netPnl)}>{formatMoney(netPnl)}</dd>
            </div>
            <div className="trade-detail-stat-cell">
              <dt>Gross P&amp;L</dt>
              <dd className={pnlClass(grossPnl)} title="Uses fill amount column when present; else matches net">
                {formatMoney(grossPnl)}
              </dd>
            </div>
            <div className="trade-detail-stat-cell">
              <dt>Commissions + fees</dt>
              <dd
                className={hasFeeCols ? pnlClass(-feesPaid) : "trades-cell-muted"}
                title={hasFeeCols ? "Paid from imported comm/misc columns" : "Re-import CSV with comm/misc on fills"}
              >
                {hasFeeCols ? formatMoney(-feesPaid) : "—"}
              </dd>
            </div>
            <div className="trade-detail-stat-cell">
              <dt>Fill count</dt>
              <dd>{trade.executions}</dd>
            </div>
            <div className="trade-detail-stat-cell" title="Largest single reducing fill vs average cost">
              <dt>Best exit P&amp;L</dt>
              <dd className={replay?.bestExitDollars != null ? pnlClass(replay.bestExitDollars) : "trades-cell-muted"}>
                {replay?.bestExitDollars != null ? formatMoney(replay.bestExitDollars) : "—"}
              </dd>
            </div>
            <div className="trade-detail-stat-cell" title="Fill-replay unrealized peak (dollars)">
              <dt>Position MFE</dt>
              <dd className={replay?.mfeDollars != null ? "green" : "trades-cell-muted"}>
                {replay?.mfeDollars != null ? formatMoney(replay.mfeDollars) : "—"}
              </dd>
            </div>
            <div className="trade-detail-stat-cell" title="Fill-replay unrealized worst drawdown (dollars)">
              <dt>Position MAE</dt>
              <dd className={replay?.maeDollars != null ? "red" : "trades-cell-muted"}>
                {replay?.maeDollars != null ? formatMoney(-replay.maeDollars) : "—"}
              </dd>
            </div>
            <div
              className="trade-detail-stat-cell"
              title="Approx. $/share using replay dollars ÷ max |shares| during sequence"
            >
              <dt>Price MFE / MAE</dt>
              <dd className={pxMfeMae === "—" ? "trades-cell-muted" : ""}>{pxMfeMae}</dd>
            </div>
            <div className="trade-detail-stat-cell" title="Closed net ÷ replay MFE when MFE is meaningful">
              <dt>Exit efficiency</dt>
              <dd className="trades-cell-muted">
                {replay?.exitEfficiency != null ? `${(replay.exitEfficiency * 100).toFixed(0)}%` : "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="card trade-detail-notes-panel">
          <h2 className="trade-detail-section-title">Notes</h2>
          <TradeNotesEditor key={tid} tradeId={tid} />
        </section>
      </div>

      <section
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
          </div>
          <div className="trade-detail-chart-tv-bar">
            <button
              type="button"
              className="chart-tv-toolbar-btn chart-tv-toolbar-btn--indicator-catalog chart-tv-toolbar-btn--icon-only"
              onClick={() => setIndicatorsCatalogOpen(true)}
              aria-haspopup="dialog"
              aria-label="Indicators catalog"
              title="Browse indicators"
            >
              <svg
                className="chart-tv-toolbar-indicators-icon chart-tv-toolbar-catalog-icon"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="3" y1="7" x2="21" y2="7" opacity="0.38" />
                <line x1="3" y1="12" x2="21" y2="12" opacity="0.38" />
                <line x1="3" y1="17" x2="21" y2="17" opacity="0.38" />
                <circle cx="16" cy="7" r="3.25" fill="currentColor" stroke="none" opacity="0.95" />
                <circle cx="9" cy="12" r="3.25" fill="currentColor" stroke="none" opacity="0.95" />
                <circle cx="14" cy="17" r="3.25" fill="currentColor" stroke="none" opacity="0.95" />
              </svg>
            </button>
            <ChartPresetsDropdown prefs={indicatorPrefs} onChange={applyIndicatorPrefs} />
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
        <div className="trade-detail-execution-wrap">
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
            />
          </Suspense>
        </div>
      </section>

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
