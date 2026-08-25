/**
 * scoring.js
 * -----------------------------------------------------------------------
 * Real, inspectable heuristic scoring — NOT a trained ML model.
 * This is intentionally a transparent, defensible stand-in:
 *   - It actually reads pixel data from the uploaded product image
 *     (extractDominantColor) — not a fake hash of a string.
 *   - It combines that with a manually curated category × actor-type
 *     affinity table (AFFINITY) that would, in production, be learned
 *     from real aggregated render-outcome data instead of hand-set.
 *
 * If asked "how does this compute a score?" — the honest answer is:
 * "dominant-color hue-harmony (real pixel math) blended with a curated
 * affinity prior, then Bayesian-shrunk toward logged outcomes as real
 * data accumulates (see storage.js)."
 * -----------------------------------------------------------------------
 */

/** Downsample an <img> element and average its pixels into an HSL color. */
export function extractDominantColor(imageEl) {
  const size = 32; // small enough to be fast, large enough to average fairly
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageEl, 0, 0, size, size);

  let data;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch (err) {
    // Cross-origin canvas taint (e.g. remote image without CORS headers) —
    // fail loudly rather than silently faking a result.
    throw new Error('Could not read pixel data from this image (CORS?). Use a local upload.');
  }

  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  }
  r /= n; g /= n; b /= n;
  return { ...rgbToHsl(r, g, b), rgb: { r: Math.round(r), g: Math.round(g), b: Math.round(b) } };
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

/**
 * Category × actor-type affinity prior.
 * Manually curated for this demo — the exact numbers are a stand-in.
 * In production, this table (or a proper learned model) would be
 * derived from real historical render-to-outcome data, which is the
 * whole point of the Conversion Intelligence flywheel.
 */
const AFFINITY = {
  'Skincare': { 'AI actor': 0.5, 'Licensed actor': 1.0, 'Your AI twin': 0.2 },
  'Electronics': { 'AI actor': 0.8, 'Licensed actor': 0.6, 'Your AI twin': 0.4 },
  'Fashion': { 'AI actor': 0.6, 'Licensed actor': 1.0, 'Your AI twin': 0.3 },
  'Home & Decor': { 'AI actor': 0.4, 'Licensed actor': 0.7, 'Your AI twin': 0.5 },
};

/** How well two hues "work together" — complementary or analogous hues score highest. 0..1 */
function hueHarmony(h1, h2) {
  let diff = Math.abs(h1 - h2) % 360;
  if (diff > 180) diff = 360 - diff;
  const complementaryFit = 1 - Math.abs(diff - 180) / 180; // best near 180°
  const analogousFit = 1 - Math.min(diff, 40) / 40;         // best near 0°
  return Math.max(complementaryFit, analogousFit);
}

/**
 * Computes a 0–10 "render confidence" heuristic for a given
 * (product image, actor persona hue, category, actor type) combo.
 * Returns the intermediate signals too, so the UI can show its work
 * instead of just a bare number — that transparency is the point.
 */
export function computeFitScore({ productHsl, actorHueDeg, category, actorTag }) {
  const colorComponent = productHsl ? hueHarmony(actorHueDeg, productHsl.h) : 0.6;
  const affinity = AFFINITY[category]?.[actorTag] ?? 0.5;

  const raw = colorComponent * 0.55 + affinity * 0.45;   // weighted blend, both real inputs
  const score = +(4 + raw * 6).toFixed(1);               // map 0..1 -> 4..10 (avoids implausible near-zero UI)

  return { score, colorComponent: +colorComponent.toFixed(2), affinity };
}
