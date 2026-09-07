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

/**
 * Delivery-tone / energy prior — a SECOND hand-set stand-in, same status as
 * AFFINITY above and no more real than it is.
 *
 * There is no voice data in this prototype and none is analysed: these are
 * literally two typed-in tables. In production the per-actor value would come
 * from the voice samples the actor library already holds, and the per-category
 * value from how energetic deliveries actually performed for that category.
 * Both are hand-set here so the number stays inspectable rather than implying
 * an audio model that does not exist.
 */
const DELIVERY_ENERGY = {
  // actor persona -> 0..1 delivery energy
  'Aanya': 0.60, 'Rohan': 0.80, 'Meera': 0.50,
  'Kabir': 0.70, 'Isha': 0.65, 'Dev': 0.55,
};

const CATEGORY_ENERGY_FIT = {
  // category -> the delivery energy that suits it best
  'Skincare': 0.50, 'Electronics': 0.80, 'Fashion': 0.70, 'Home & Decor': 0.45,
};

/**
 * How close an actor's delivery energy sits to what a category wants. 0..1,
 * 1 being an exact match. Same shape as hueHarmony(): a small, explainable
 * rule over hand-set inputs, not a model.
 *
 * Returns a neutral 0.5 when either side is unknown, mirroring how AFFINITY
 * falls back — so callers that do not know the actor name still get a sane
 * score rather than a crash or a zero.
 */
export function deliveryFit({ actorName, category }) {
  const actorEnergy = DELIVERY_ENERGY[actorName];
  const categoryEnergy = CATEGORY_ENERGY_FIT[category];
  if (actorEnergy === undefined || categoryEnergy === undefined) return 0.5;
  return 1 - Math.abs(actorEnergy - categoryEnergy);
}

/**
 * Plain-English delivery style for the persona picker, derived from the same
 * table — so the UI describes the dimension instead of showing a raw number.
 */
export function deliveryLabel(actorName) {
  const e = DELIVERY_ENERGY[actorName];
  if (e === undefined) return '';
  if (e >= 0.75) return 'high energy';
  if (e >= 0.65) return 'warm and upbeat';
  if (e >= 0.55) return 'measured';
  return 'calm and reassuring';
}

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
 * (product image, actor persona hue, category, actor type, actor name) combo.
 * Returns the intermediate signals too, so the UI can show its work
 * instead of just a bare number — that transparency is the point.
 *
 * Weights: colour 40%, affinity 35%, delivery 25%.
 * Colour harmony keeps the largest share because it is the only component
 * computed from real input — the actual pixels of the uploaded image. Affinity
 * comes next: hand-set, but the longest-standing and most category-specific of
 * the stand-ins. Delivery takes the smallest share because it is the thinnest
 * stand-in of the three — two typed-in tables — so it should nudge the score,
 * not drive it. The 4..10 mapping is unchanged.
 *
 * `actorName` is optional and additive: callers that do not supply it get the
 * neutral 0.5 delivery fallback and otherwise behave exactly as before.
 */
export function computeFitScore({ productHsl, actorHueDeg, category, actorTag, actorName }) {
  const colorComponent = productHsl ? hueHarmony(actorHueDeg, productHsl.h) : 0.6;
  const affinity = AFFINITY[category]?.[actorTag] ?? 0.5;
  const delivery = deliveryFit({ actorName, category });

  const raw = colorComponent * 0.40 + affinity * 0.35 + delivery * 0.25;
  const score = +(4 + raw * 6).toFixed(1);               // map 0..1 -> 4..10 (avoids implausible near-zero UI)

  return { score, colorComponent: +colorComponent.toFixed(2), affinity, delivery: +delivery.toFixed(2) };
}
