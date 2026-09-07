/**
 * confidence-chart.js
 * -----------------------------------------------------------------------
 * A small sparkline in the Fit Check result panel showing the Bayesian
 * shrinkage argument as a shape rather than a paragraph.
 *
 * WHAT IT PLOTS — and what it does not.
 * storage.js keeps only { sum, count } per combo, never the individual
 * outcomes. The real sequence of past blended scores is therefore not
 * recoverable, and inventing one (by assuming every past outcome equalled
 * the running average) would be fabricating data that was never logged.
 *
 * So this charts the shrinkage PATH instead: for each outcome count k,
 * where the blended score sits given the heuristic prior and the observed
 * average. The final point (k = n) is the real, current score — verified
 * against blendedScore() itself. The earlier points are the curve's shape,
 * not a replay of history, and the caption says exactly that.
 *
 * Strictly additive, following the library.js / theme.js pattern:
 *   - reads the flywheel through storage.js's public allEntries()
 *   - gets the true score through storage.js's public blendedScore()
 *   - recovers the prior weight by PROBING blendedScore rather than
 *     hardcoding it, so the math stays owned by storage.js
 *   - never writes storage, never touches scoring or the Fit Check flow
 * Removing this file's script tag removes the chart and nothing else.
 * -----------------------------------------------------------------------
 */
import { actors, currentHeuristic } from './main.js';
import { allEntries, blendedScore, confidenceFor } from './storage.js';
import { computeFitScore, rgbToHsl } from './scoring.js';

/* Below this, a chart would be a flat line through one or two points. */
const MIN_OUTCOMES = 3;

const W = 130, H = 38, PAD = 4;   // small enough to sit inline in the panel

/** Current combo, read from the DOM the same way render-preview.js does. */
function currentCombo() {
  const card = document.querySelector('#actorGrid .actor-card.sel');
  const category = document.querySelector('.sample-chip.on')?.dataset.cat;
  if (!card || !category) return null;
  const name = card.querySelector('.actor-name')?.textContent.trim();
  const tag = card.querySelector('.actor-tag')?.textContent.trim();
  const actor = actors.find(a => a.name === name && a.tag === tag);
  if (!actor) return null;
  return { actor, category, key: `${category}__${tag}__${name}` };   // main.js's comboKey format
}

/** The extracted product colour, read back off the evidence swatch. */
function productHslFromSwatch() {
  const bg = document.getElementById('swatchProduct')?.style.background || '';
  const m = bg.match(/(\d+(?:\.\d+)?)/g);
  if (!m || m.length < 3) return null;
  const [r, g, b] = m.slice(0, 3).map(Number);
  return rgbToHsl(r, g, b);              // storage/scoring's own converter
}

/**
 * Recover the prior weight without hardcoding it.
 * blendedScore(key, h) = (h·W + S) / (W + n) is linear in h, so probing two
 * heuristics gives D = W/(W+n), and W follows. If storage.js ever changes
 * PRIOR_WEIGHT, this tracks it automatically instead of drifting.
 */
function recoverPriorWeight(key, n) {
  const b0 = blendedScore(key, 0).score;
  const b10 = blendedScore(key, 10).score;
  const D = (b10 - b0) / 10;
  if (!(D > 0 && D < 1)) return null;
  return (D * n) / (1 - D);
}

/**
 * The shrinkage path for one combo.
 * curve(k) = h + (avg − h)·k/(W + k) — the weight on real data is k/(W+k),
 * which is the same shrinkage storage.js applies. At k = n this reduces to
 * (h·W + S)/(W + n), i.e. exactly blendedScore()'s answer.
 */
function shrinkagePath(combo) {
  const entry = allEntries()[combo.key];
  if (!entry || entry.count < MIN_OUTCOMES) return null;

  const n = entry.count;
  const avg = entry.sum / n;

  // Prefer the heuristic main.js actually used. Rebuilding it from the swatch
  // costs precision: the swatch is written with rounded h/s/l, so the rgb->hsl
  // round trip shifts the hue and can move the score by 0.1. Fall back to the
  // reconstruction only if main.js has not run a check yet.
  const fromMain = currentHeuristic();
  const heuristic = fromMain
    ? fromMain.score
    : computeFitScore({
        productHsl: productHslFromSwatch(),
        actorHueDeg: combo.actor.actorHue,
        category: combo.category,
        actorTag: combo.actor.tag,
        actorName: combo.actor.name,
      }).score;

  const w = recoverPriorWeight(combo.key, n);
  if (w === null) return null;

  const points = [];
  for (let k = 1; k <= n; k++) {
    points.push({ k, score: heuristic + (avg - heuristic) * (k / (w + k)) });
  }

  return {
    points, n, avg, heuristic, priorWeight: w,
    // storage.js's own answer, for the endpoint check
    actual: blendedScore(combo.key, heuristic).score,
    conf: confidenceFor(n),
  };
}

function svg(path) {
  const scores = path.points.map(p => p.score);
  // Frame the curve against both endpoints so the movement is visible.
  const lo = Math.min(...scores, path.heuristic, path.avg);
  const hi = Math.max(...scores, path.heuristic, path.avg);
  const span = hi - lo || 1;

  const x = i => PAD + (i / Math.max(path.points.length - 1, 1)) * (W - PAD * 2);
  const y = s => H - PAD - ((s - lo) / span) * (H - PAD * 2);

  const line = path.points.map((p, i) => `${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  // A dot per real outcome count, so the plotted counts are explicit
  const dots = path.points.map((p, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(p.score).toFixed(1)}" r="1.7"/>`).join('');
  const last = path.points[path.points.length - 1];

  return `
  <svg class="cc-svg" viewBox="0 0 ${W} ${H}" role="img"
       aria-label="Blended score across ${path.n} outcome counts, ending at ${path.actual} out of 10">
    <polyline class="cc-line" points="${line}"/>
    <g class="cc-dots">${dots}</g>
    <circle class="cc-end" cx="${x(path.points.length - 1).toFixed(1)}"
            cy="${y(last.score).toFixed(1)}" r="2.8"/>
  </svg>`;
}

function render() {
  const host = document.getElementById('confChart');
  if (!host) return;

  const combo = currentCombo();
  const path = combo ? shrinkagePath(combo) : null;

  // Under the threshold (or no combo yet): render nothing at all, leaving the
  // existing verdict text exactly as it was.
  if (!path) { host.innerHTML = ''; host.hidden = true; return; }

  host.hidden = false;
  host.innerHTML = `
    <div class="cc-row">
      ${svg(path)}
      <div class="cc-legend">
        <div class="cc-ends"><span>${path.heuristic.toFixed(1)}</span>
          <span class="cc-arrow" aria-hidden="true">→</span>
          <span class="cc-now">${path.actual.toFixed(1)}</span></div>
        <div class="cc-sub">heuristic → now (${path.n} outcomes)</div>
      </div>
    </div>
    <p class="cc-cap">Shrinkage path for this combo: where the blended score sits at each
      outcome count, holding the observed average of ${path.avg.toFixed(1)}. The final point is
      the current score; the earlier points show the curve's shape, not a replay of what was
      logged — storage keeps totals, not each outcome.</p>`;
}

/* Mount a container directly below the verdict text, then keep it in sync the
   same one-way way library.js does: main.js rewrites #leaderboard on every fit
   check, logged outcome and reset. */
function mount() {
  const verdict = document.getElementById('verdictBox');
  if (!verdict || document.getElementById('confChart')) return;

  const host = document.createElement('div');
  host.className = 'cc';
  host.id = 'confChart';
  host.hidden = true;
  verdict.insertAdjacentElement('afterend', host);

  const lb = document.getElementById('leaderboard');
  if (lb) new MutationObserver(() => render()).observe(lb, { childList: true, subtree: true });

  render();
}

mount();
