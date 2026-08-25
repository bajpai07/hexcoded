/**
 * library.js
 * -----------------------------------------------------------------------
 * Renders the "Actor library" section — the visual that makes the pitch
 * concrete: today HexCoded ranks actors by USAGE VOLUME; Fit Check adds a
 * second, outcome-based signal per category.
 *
 * This module is strictly additive and read-only with respect to the
 * existing Fit Check flow:
 *   - it imports the shared actor roster from main.js (no duplicate data)
 *   - it reads the flywheel through storage.js's public allEntries()
 *   - it never writes to localStorage and never touches scoring
 *
 * It stays in sync with logged outcomes by observing #leaderboard, which
 * main.js's renderFlywheel() rewrites on every fit check, log, and reset.
 * That keeps the coupling one-way: main.js has no knowledge of this file.
 * -----------------------------------------------------------------------
 */
import { actors } from './main.js';
import { allEntries } from './storage.js';

/* ── Stand-in for HexCoded's existing usage-volume ranking ──────────────
   These are placeholder numbers representing the signal that already
   exists today ("the more your twin gets used, the higher it ranks").
   They are NOT computed — that is the whole point of the comparison. */
const USAGE = {
  Aanya: { rank: 1, share: 94 },
  Dev:   { rank: 2, share: 78 },
  Meera: { rank: 3, share: 63 },
  Rohan: { rank: 4, share: 47 },
  Isha:  { rank: 5, share: 31 },
  Kabir: { rank: 6, share: 16 },
};

/* Informal, hand-written per-actor tags — the kind already shown next to
   actor cards on the casting site. Deliberately vague, to contrast with
   the measured number beside them. */
const INFORMAL_TAG = {
  Aanya: 'great for skincare ads',
  Rohan: 'works well for tech & gadgets',
  Meera: 'strong for premium & home',
  Kabir: 'your twin — brand-consistent',
  Isha:  'good for fashion & lifestyle',
  Dev:   'reliable for everyday retail',
};

function avatarSVG(a) {
  // distinct gradient id prefix so these never collide with #actorGrid's
  const id = `lib-g-${a.name}`;
  return `
  <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${a.grad[0]}"/>
        <stop offset="100%" stop-color="${a.grad[1]}"/>
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="32" fill="url(#${id})"/>
    <circle cx="32" cy="25" r="10.5" fill="#ffffff" fill-opacity="0.92"/>
    <path d="M10 60 C10 44 19.5 36 32 36 C44.5 36 54 44 54 60 Z" fill="#ffffff" fill-opacity="0.92"/>
  </svg>`;
}

/**
 * Aggregate this browser's logged outcomes for one actor.
 * Combo keys are `${category}__${actorTag}__${actorName}` (see main.js).
 */
function fitFor(actorName, data) {
  let sum = 0, count = 0;
  const byCat = {};
  for (const [key, entry] of Object.entries(data)) {
    const parts = key.split('__');
    if (parts.length < 3) continue;
    const [cat, , name] = parts;
    if (name !== actorName) continue;
    sum += entry.sum;
    count += entry.count;
    if (!byCat[cat]) byCat[cat] = { sum: 0, count: 0 };
    byCat[cat].sum += entry.sum;
    byCat[cat].count += entry.count;
  }
  if (count === 0) return null;
  const best = Object.entries(byCat)
    .map(([cat, v]) => ({ cat, avg: v.sum / v.count }))
    .sort((a, b) => b.avg - a.avg)[0];
  return {
    avg: +(sum / count).toFixed(1),
    count,
    cats: Object.keys(byCat).length,
    bestCat: best.cat,
  };
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function render() {
  const grid = document.getElementById('libGrid');
  if (!grid) return;

  const data = allEntries();

  // Score every actor, then rank the ones that actually have outcomes.
  const rows = actors.map(a => ({ actor: a, usage: USAGE[a.name], fit: fitFor(a.name, data) }));
  const withFit = rows.filter(r => r.fit).sort((a, b) => b.fit.avg - a.fit.avg);
  withFit.forEach((r, i) => { r.fitRank = i + 1; });

  grid.innerHTML = rows.map(r => {
    const a = r.actor;
    const u = r.usage;
    const f = r.fit;

    const fitCell = f
      ? `<div class="lib-val lib-val--fit">${f.avg}<span class="lib-den">/10</span></div>
         <div class="lib-meta">#${r.fitRank} by fit · ${f.count} outcome${f.count > 1 ? 's' : ''}</div>
         <div class="lib-meta lib-meta--best">best in ${esc(f.bestCat)}</div>`
      : `<div class="lib-val lib-val--empty">no data yet</div>
         <div class="lib-meta">run a fit check below</div>`;

    return `
      <article class="lib-card${f ? ' has-fit' : ''}">
        <div class="lib-head">
          <div class="lib-avatar">${avatarSVG(a)}</div>
          <div class="lib-id">
            <div class="lib-name">${esc(a.name)}</div>
            <div class="lib-tier">${esc(a.tag)}</div>
          </div>
        </div>

        <div class="lib-informal">“${esc(INFORMAL_TAG[a.name])}”</div>

        <div class="lib-stats">
          <div class="lib-stat">
            <div class="lib-stat-lbl">Usage rank</div>
            <div class="lib-val">#${u.rank}</div>
            <div class="lib-bar"><i style="width:${u.share}%"></i></div>
            <div class="lib-meta">today’s signal</div>
          </div>
          <div class="lib-stat lib-stat--fit">
            <div class="lib-stat-lbl">Fit score</div>
            ${fitCell}
          </div>
        </div>
      </article>`;
  }).join('');

  renderVerdict(withFit, rows);
}

/**
 * The punchline line under the grid — only claims divergence when the two
 * rankings genuinely disagree in this browser's data.
 */
function renderVerdict(withFit, rows) {
  const el = document.getElementById('libVerdict');
  if (!el) return;

  if (withFit.length === 0) {
    el.className = 'lib-verdict';
    el.innerHTML = `Nothing logged in this browser yet — every actor still ranks purely by usage. Run a fit check below and log an outcome to see the second signal appear.`;
    return;
  }

  // Compare the two orderings over the actors that have outcomes.
  const byUsage = [...withFit].sort((a, b) => a.usage.rank - b.usage.rank);
  const diverges = byUsage.some((r, i) => r !== withFit[i]);
  const top = withFit[0];

  el.className = 'lib-verdict on';
  if (withFit.length === 1) {
    el.innerHTML = `<b>${esc(top.actor.name)}</b> now carries a measured fit score of <b>${top.fit.avg}/10</b> alongside usage rank #${top.usage.rank} — one signal where before there was only the other. Log outcomes for another actor to compare the two rankings.`;
  } else if (diverges) {
    el.innerHTML = `The two rankings already disagree: <b>${esc(top.actor.name)}</b> ranks <b>#${top.fitRank} by fit</b> but <b>#${top.usage.rank} by usage</b>. Usage says who gets picked most; fit says who actually converts for this category.`;
  } else {
    el.innerHTML = `Across ${withFit.length} actors with logged outcomes, fit ranking currently agrees with usage ranking — the signals can agree, but only one of them is measured against outcomes.`;
  }
}

/* ── Stay in sync without touching main.js ────────────────────────────
   renderFlywheel() rewrites #leaderboard after every fit check, logged
   outcome, and reset, so observing it is a reliable one-way signal that
   the flywheel changed. */
function watchFlywheel() {
  const lb = document.getElementById('leaderboard');
  if (!lb) return;
  new MutationObserver(() => render()).observe(lb, { childList: true, subtree: true });
}

render();
watchFlywheel();
