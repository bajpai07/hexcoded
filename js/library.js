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
import { allEntries, confidenceFor } from './storage.js';

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
 *
 * Deliberately does NOT report a "best category" any more. An actor's own
 * strongest category says nothing about whether they beat anyone else in
 * it — see computeCategoryLeaders() for the cross-actor comparison that
 * the "best in X" tag actually needs.
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
  return {
    avg: +(sum / count).toFixed(1),
    count,
    cats: Object.keys(byCat).length,
  };
}

/**
 * Who genuinely leads each category, compared across ALL actors.
 *
 * Groups the flywheel by category first, then by actor within it, so the
 * winner of "Electronics" is the actor with the highest average IN
 * Electronics — not an actor whose personal best happens to be Electronics.
 * Without this, two actors could both claim "best in Electronics", which
 * contradicts the whole point of the comparison.
 *
 * Ranking rule: highest average wins. Ties break toward more logged
 * outcomes, because the same average backed by more evidence is the more
 * defensible claim; a remaining exact tie keeps the first encountered, so
 * the label is stable rather than flickering between equals on re-render.
 *
 * Returns { [category]: { actorName, avg, count } }.
 */
function computeCategoryLeaders(data) {
  const byCatActor = {};
  for (const [key, entry] of Object.entries(data)) {
    const parts = key.split('__');
    if (parts.length < 3) continue;
    const [cat, , name] = parts;
    if (!byCatActor[cat]) byCatActor[cat] = {};
    if (!byCatActor[cat][name]) byCatActor[cat][name] = { sum: 0, count: 0 };
    byCatActor[cat][name].sum += entry.sum;
    byCatActor[cat][name].count += entry.count;
  }

  const leaders = {};
  for (const [cat, perActor] of Object.entries(byCatActor)) {
    let best = null;
    for (const [name, v] of Object.entries(perActor)) {
      // Threshold: reuse storage.js's existing confidence tiers rather than
      // inventing a number. cls 'none' is n === 0, i.e. no real outcomes, so
      // this admits any actor with at least one logged result. That minimum
      // is deliberate, not an oversight: with only four demo categories a
      // stricter bar (say 'med', n >= 2) would leave most categories with no
      // leader at all during a live demo. The confidence pill already shown
      // on the card communicates how much weight the number deserves.
      if (confidenceFor(v.count).cls === 'none') continue;
      const cand = { actorName: name, avg: +(v.sum / v.count).toFixed(1), count: v.count };
      if (!best
          || cand.avg > best.avg
          || (cand.avg === best.avg && cand.count > best.count)) {
        best = cand;
      }
    }
    if (best) leaders[cat] = best;
  }
  return leaders;
}

/** The categories this actor genuinely leads, strongest first. */
function categoriesLedBy(leaders, actorName) {
  return Object.entries(leaders)
    .filter(([, l]) => l.actorName === actorName)
    .map(([cat, l]) => ({ cat, avg: l.avg, count: l.count }))
    .sort((a, b) => b.avg - a.avg);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function render() {
  const grid = document.getElementById('libGrid');
  if (!grid) return;

  const data = allEntries();

  // Recomputed on every render, so a newly logged outcome can hand "best in X"
  // to a different actor immediately — same lifecycle as the fit scores.
  const leaders = computeCategoryLeaders(data);

  // Score every actor, then rank the ones that actually have outcomes.
  const rows = actors.map(a => ({ actor: a, usage: USAGE[a.name], fit: fitFor(a.name, data) }));
  // Ties break on outcome count: the same average backed by more logged
  // outcomes is the more confident number, so it ranks higher. Without this the
  // comparator returns 0 and the stable sort silently falls back to the order
  // actors happen to sit in main.js's array, which has nothing to do with data
  // quality. A full tie (same avg AND same count) keeps that array order.
  const withFit = rows
    .filter(r => r.fit)
    .sort((a, b) => {
      if (b.fit.avg !== a.fit.avg) return b.fit.avg - a.fit.avg;
      return b.fit.count - a.fit.count;
    });
  withFit.forEach((r, i) => { r.fitRank = i + 1; });

  grid.innerHTML = rows.map(r => {
    const a = r.actor;
    const u = r.usage;
    const f = r.fit;

    // Only tag "best in X" where this actor actually tops that category across
    // everyone. An actor with data but no category win gets no tag at all,
    // rather than a personal-best that reads as a claim they cannot support.
    const led = f ? categoriesLedBy(leaders, a.name) : [];
    const bestTag = led.length
      ? `<div class="lib-meta lib-meta--best">best in ${esc(led[0].cat)}</div>`
      : '';

    const fitCell = f
      ? `<div class="lib-val lib-val--fit">${f.avg}<span class="lib-den">/10</span></div>
         <div class="lib-meta">#${r.fitRank} by fit · ${f.count} outcome${f.count > 1 ? 's' : ''}</div>
         ${bestTag}`
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
