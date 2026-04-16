/**
 * Series-attached primitive (same coordinate space as the candle series).
 * With a volume histogram, pane-level drawing uses the full pane height while
 * `priceToCoordinate` is relative to the candle plot — attaching to the series fixes vertical alignment.
 * Triangles keep the soft style; tip sits at the execution price.
 */

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
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
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
 * @param {import('lightweight-charts').ISeriesApi<'Candlestick'>} candleSeries
 * @param {Array<{ time: import('lightweight-charts').Time, price: number, isBuy: boolean }>} markers
 * @param {{ buy: string, sell: string, size: number }} colors
 * @returns {import('lightweight-charts').ISeriesPrimitive<import('lightweight-charts').Time>}
 */
export function createSoftTriangleMarkersSeriesPrimitive(candleSeries, markers, colors) {
  /** @type {import('lightweight-charts').IChartApiBase<import('lightweight-charts').Time> | null} */
  let chart = null;
  /** @type {import('lightweight-charts').ISeriesApi<'Candlestick'> | null} */
  let series = null;
  let requestUpdate = () => {};
  /** @type {(() => void) | null} */
  let unsubscribe = null;

  const size = colors.size ?? 12;

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
      const buyC = colors.buy;
      const sellC = colors.sell;
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
                  for (const m of selfMarkers) {
                    const x = ts.timeToCoordinate(m.time);
                    const y = s.priceToCoordinate(m.price);
                    if (x == null || y == null) continue;
                    const fill = m.isBuy ? buyC : sellC;
                    /* One neutral rim so custom marker colors from prefs still look balanced (avoids hue-clash strokes) */
                    const stroke = "rgba(10, 12, 18, 0.48)";
                    drawSoftTriangle(ctx, x, y, size, m.isBuy, fill, stroke);
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
