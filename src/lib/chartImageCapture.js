import { toBlob } from "html-to-image";

/** Matches TradingView-style chart background used in TradeExecutionChart layout. */
const CHART_CAPTURE_BG = "#131722";

/** Slightly lighter fill for multi-card trade detail captures. */
const TRADE_BUNDLE_CAPTURE_BG = "#161b26";

/**
 * Rasterize the chart host element (canvas + overlays) to a PNG blob.
 * @param {HTMLElement} el
 * @returns {Promise<Blob>}
 */
export async function captureChartElementAsPngBlob(el) {
  const blob = await toBlob(el, {
    cacheBust: true,
    pixelRatio: Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1),
    backgroundColor: CHART_CAPTURE_BG,
  });
  if (!blob) throw new Error("Could not capture chart.");
  return blob;
}

/**
 * Rasterize any HTMLElement (e.g. snapshot + notes + chart) to PNG.
 * @param {HTMLElement} el
 * @param {{ backgroundColor?: string }} [opts]
 */
export async function captureDomElementAsPngBlob(el, opts = {}) {
  const bg = opts.backgroundColor ?? TRADE_BUNDLE_CAPTURE_BG;
  const blob = await toBlob(el, {
    cacheBust: true,
    pixelRatio: Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1),
    backgroundColor: bg,
  });
  if (!blob) throw new Error("Could not capture element.");
  return blob;
}

/**
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed."));
    img.src = url;
  });
}

/**
 * Stack two PNG blobs vertically: `topBlob` above `bottomBlob`, centered on the wider width.
 * @param {Blob} topBlob
 * @param {Blob} bottomBlob
 * @param {{ gap?: number, backgroundColor?: string }} [opts]
 * @returns {Promise<Blob>}
 */
export async function stackPngBlobsVertical(topBlob, bottomBlob, opts = {}) {
  const gap = opts.gap ?? 22;
  const bg = opts.backgroundColor ?? TRADE_BUNDLE_CAPTURE_BG;
  const urlTop = URL.createObjectURL(topBlob);
  const urlBottom = URL.createObjectURL(bottomBlob);
  try {
    const [top, bottom] = await Promise.all([loadImageFromUrl(urlTop), loadImageFromUrl(urlBottom)]);
    const wTop = top.naturalWidth;
    const hTop = top.naturalHeight;
    const wBot = bottom.naturalWidth;
    const hBot = bottom.naturalHeight;
    const w = Math.max(wTop, wBot);
    const h = hTop + gap + hBot;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create canvas context.");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(top, Math.round((w - wTop) / 2), 0);
    ctx.drawImage(bottom, Math.round((w - wBot) / 2), hTop + gap);
    const out = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("Could not encode stacked image."));
      }, "image/png");
    });
    return /** @type {Blob} */ (out);
  } finally {
    URL.revokeObjectURL(urlTop);
    URL.revokeObjectURL(urlBottom);
  }
}

/**
 * Re-encode a raster blob as a JPEG data URL for smaller localStorage footprint.
 * @param {Blob} blob
 * @param {number} [maxWidth]
 * @param {number} [quality]
 */
export async function blobToJpegDataUrl(blob, maxWidth = 1400, quality = 0.82) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("decode"));
      img.src = url;
    });
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w < 1 || h < 1) throw new Error("Bad image size.");
    if (w > maxWidth) {
      const s = maxWidth / w;
      w = Math.max(1, Math.round(w * s));
      h = Math.max(1, Math.round(h * s));
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas context.");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
