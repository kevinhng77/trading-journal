/**
 * Series-attached primitive (same coordinate space as the candle series).
 * Execution markers: triangle, circle, square, or diamond; tip or anchor at execution price.
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 */
function applyMarkerShadow(ctx) {
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} tipY
 * @param {number} size
 * @param {boolean} pointUp
 * @param {string} fill
 * @param {string} stroke
 */
function drawSoftTriangle(ctx, cx, tipY, size, pointUp, fill, stroke) {
  const halfW = size * 0.48;
  const h = size * 0.95;
  const dir = pointUp ? 1 : -1;
  const baseY = tipY + dir * h;
  const leftX = cx - halfW;
  const rightX = cx + halfW;

  ctx.save();
  applyMarkerShadow(ctx);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.lineTo(rightX, baseY);
  ctx.lineTo(leftX, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} size
 * @param {string} fill
 * @param {string} stroke
 */
function drawSoftCircle(ctx, cx, cy, size, fill, stroke) {
  const r = size * 0.46;
  ctx.save();
  applyMarkerShadow(ctx);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} size
 * @param {string} fill
 * @param {string} stroke
 */
function drawSoftSquare(ctx, cx, cy, size, fill, stroke) {
  const s = size * 0.82;
  const half = s / 2;
  ctx.save();
  applyMarkerShadow(ctx);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.fillRect(cx - half, cy - half, s, s);
  ctx.strokeRect(cx - half, cy - half, s, s);
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} tipY
 * @param {number} size
 * @param {boolean} pointUp
 * @param {string} fill
 * @param {string} stroke
 */
function drawSoftDiamond(ctx, cx, tipY, size, pointUp, fill, stroke) {
  const w = size * 0.48;
  const h = size * 0.52;

  ctx.save();
  applyMarkerShadow(ctx);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (pointUp) {
    ctx.moveTo(cx, tipY);
    ctx.lineTo(cx + w, tipY + h);
    ctx.lineTo(cx, tipY + h * 2);
    ctx.lineTo(cx - w, tipY + h);
  } else {
    ctx.moveTo(cx, tipY);
    ctx.lineTo(cx - w, tipY - h);
    ctx.lineTo(cx, tipY - h * 2);
    ctx.lineTo(cx + w, tipY - h);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** @param {string | undefined} raw */
function normalizeMarkerShape(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "circle" || s === "square" || s === "diamond") return s;
  return "triangle";
}

/**
 * @param {import('lightweight-charts').ISeriesApi<'Candlestick'>} candleSeries
 * @param {Array<{ time: import('lightweight-charts').Time, price: number, isBuy: boolean, size?: number, fill?: string }>} markers
 * @param {{ buy: string, sell: string, size: number, shape?: string }} options
 * @returns {import('lightweight-charts').ISeriesPrimitive<import('lightweight-charts').Time>}
 */
export function createExecutionMarkersSeriesPrimitive(candleSeries, markers, options) {
  const shape = normalizeMarkerShape(options.shape);
  /** @type {import('lightweight-charts').IChartApiBase<import('lightweight-charts').Time> | null} */
  let chart = null;
  /** @type {import('lightweight-charts').ISeriesApi<'Candlestick'> | null} */
  let series = null;
  let requestUpdate = () => {};
  /** @type {(() => void) | null} */
  let unsubscribe = null;

  const baseSize = options.size ?? 12;

  function onScaleChange() {
    requestUpdate();
  }

  const primitive = {
    attached(
      /** @type {import('lightweight-charts').SeriesAttachedParameter<import('lightweight-charts').Time, 'Candlestick'>} */ param,
    ) {
      chart = param.chart;
      series = param.series;
      requestUpdate = param.requestUpdate;
      chart.timeScale().subscribeVisibleTimeRangeChange(onScaleChange);
      chart.timeScale().subscribeVisibleLogicalRangeChange(onScaleChange);
      unsubscribe = () => {
        chart?.timeScale().unsubscribeVisibleTimeRangeChange(onScaleChange);
        chart?.timeScale().unsubscribeVisibleLogicalRangeChange(onScaleChange);
      };
      requestUpdate();
    },
    detached() {
      unsubscribe?.();
      unsubscribe = null;
      chart = null;
      series = null;
    },
    paneViews() {
      const selfMarkers = markers;
      const buyC = options.buy;
      const sellC = options.sell;
      return [
        {
          zOrder() {
            return "top";
          },
          renderer() {
            return {
              draw(/** @type {import('fancy-canvas').CanvasRenderingTarget2D} */ target) {
                const s = series ?? candleSeries;
                if (!chart || !s) return;
                target.useMediaCoordinateSpace(({ context: ctx }) => {
                  const ts = chart.timeScale();
                  const stroke = "rgba(10, 12, 18, 0.48)";
                  for (const m of selfMarkers) {
                    const x = ts.timeToCoordinate(m.time);
                    const y = s.priceToCoordinate(m.price);
                    if (x == null || y == null) continue;
                    const fill =
                      typeof m.fill === "string" && m.fill.length ? m.fill : m.isBuy ? buyC : sellC;
                    const pxSize =
                      typeof m.size === "number" && Number.isFinite(m.size) && m.size > 2 ? m.size : baseSize;
                    if (shape === "circle") {
                      drawSoftCircle(ctx, x, y, pxSize, fill, stroke);
                    } else if (shape === "square") {
                      drawSoftSquare(ctx, x, y, pxSize, fill, stroke);
                    } else if (shape === "diamond") {
                      drawSoftDiamond(ctx, x, y, pxSize, m.isBuy, fill, stroke);
                    } else {
                      drawSoftTriangle(ctx, x, y, pxSize, m.isBuy, fill, stroke);
                    }
                  }
                });
              },
            };
          },
        },
      ];
    },
  };

  return primitive;
}

/** @deprecated use createExecutionMarkersSeriesPrimitive */
export const createSoftTriangleMarkersSeriesPrimitive = createExecutionMarkersSeriesPrimitive;
