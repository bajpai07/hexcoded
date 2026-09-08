/**
 * maria.js
 * -----------------------------------------------------------------------
 * A small guided helper that recommends an actor for a product category.
 *
 * NOT an AI model. Every reply is a template string chosen by a switch on
 * the confidence tier that storage.js already computes. There is no network
 * call, no API key, no backend — and the panel says so on its face, in the
 * same spirit as the page's "what's real vs. what's a stand-in" section.
 *
 * Strictly additive, following the js/library.js and js/theme.js pattern:
 *   - reads the flywheel through storage.js's public allEntries()
 *   - labels certainty through storage.js's public confidenceFor()
 *   - derives the no-data fallback through scoring.js's public computeFitScore()
 *   - imports the shared actor roster from main.js
 * It never writes scoring state, never touches AFFINITY, and never calls the
 * Bayesian blending. It also builds its own DOM, so deleting the one script
 * tag in index.html removes the widget completely with no orphan markup.
 * -----------------------------------------------------------------------
 */
import { actors } from './main.js';
import { allEntries, confidenceFor } from './storage.js';
import { computeFitScore } from './scoring.js';

/* Same four categories the Fit Check chips use. */
const CATEGORIES = ['Skincare', 'Electronics', 'Fashion', 'Home & Decor'];

/* The honesty disclosure. Still shown in full — now behind the (i) beside
   Maria's name rather than always-on, to free space for the intro card.
   Kept as a named constant so it is obvious this text must not be dropped. */
const DISCLOSURE = 'Template-based guide, not a live AI model — recommendations come from the ' +
                   'same real fit-score data used in Fit Check below.';

/* First-load introduction timings (skipped entirely under reduced motion). */
const INTRO_DELAY_MS = 1500;   // let the page render first
const INTRO_HOLD_MS = 5500;    // then collapse to the persistent pill
const COLLAPSE_MS = 320;       // must match the CSS collapse duration

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Best actor for one category, from the SAME logged-outcome store the actor
 * library reads. Combo keys are `${category}__${actorTag}__${actorName}`
 * (see main.js) — the same parse library.js's fitFor() does, scoped to one
 * category instead of one actor.
 *
 * Returns { actor, avg, count } or null when nothing is logged for it.
 */
function bestLoggedForCategory(category) {
  const data = allEntries();
  const byActor = {};

  for (const [key, entry] of Object.entries(data)) {
    const parts = key.split('__');
    if (parts.length < 3) continue;
    const [cat, , name] = parts;
    if (cat !== category) continue;
    if (!byActor[name]) byActor[name] = { sum: 0, count: 0 };
    byActor[name].sum += entry.sum;
    byActor[name].count += entry.count;
  }

  const ranked = Object.entries(byActor)
    .map(([name, v]) => ({
      actor: actors.find(a => a.name === name) || { name, tag: '' },
      avg: +(v.sum / v.count).toFixed(1),
      count: v.count,
    }))
    .sort((a, b) => {
      if (b.avg !== a.avg) return b.avg - a.avg;
      return b.count - a.count; // tie-break: more logged outcomes = more confidence, ranks higher
    });

  return ranked[0] || null;
}

/**
 * No outcomes logged yet — fall back to the strongest heuristic-only estimate.
 * This calls the real computeFitScore(); passing productHsl: null is the
 * function's own documented path for "no image yet", so the ranking comes from
 * the genuine affinity signal rather than an invented number.
 */
function bestHeuristicForCategory(category) {
  return actors
    .map(a => ({
      actor: a,
      score: computeFitScore({
        productHsl: null,
        actorHueDeg: a.actorHue,
        category,
        actorTag: a.tag,
        actorName: a.name,
      }).score,
    }))
    .sort((a, b) => b.score - a.score)[0];
}

/** Template reply, picked by the confidence tier storage.js reports. */
function reply(category) {
  const logged = bestLoggedForCategory(category);
  const n = logged ? logged.count : 0;
  const conf = confidenceFor(n);          // heuristic only / low / medium / high

  if (!logged) {
    const h = bestHeuristicForCategory(category);
    return {
      conf,
      html: `No real outcomes logged for <b>${esc(category)}</b> yet, so I can't recommend
             from data. <b>${esc(h.actor.name)}</b> has the strongest heuristic-only estimate
             (${h.score}/10) — treat this as a starting point, not a track record.`,
    };
  }

  const { actor, avg, count } = logged;
  const outcomes = `${count} logged outcome${count > 1 ? 's' : ''}`;

  switch (conf.cls) {
    case 'low':
      return {
        conf,
        html: `<b>${esc(actor.name)}</b> leads for <b>${esc(category)}</b> at ${avg}/10, but that's
               from ${outcomes}. One result isn't a track record — worth a look, not a bet.`,
      };
    case 'med':
      return {
        conf,
        html: `For <b>${esc(category)}</b>, <b>${esc(actor.name)}</b> is ahead at ${avg}/10 across
               ${outcomes}. Enough to lean on, not enough to be certain.`,
      };
    case 'high':
      return {
        conf,
        html: `<b>${esc(actor.name)}</b> is the clear pick for <b>${esc(category)}</b>: ${avg}/10
               across ${outcomes}. That's a real track record, not a guess.`,
      };
    default:
      return {
        conf,
        html: `<b>${esc(actor.name)}</b> scores ${avg}/10 for <b>${esc(category)}</b> across ${outcomes}.`,
      };
  }
}

/* ── widget ─────────────────────────────────────────────────────────── */
function mount() {
  if (document.getElementById('mariaRoot')) return;

  const root = document.createElement('div');
  root.className = 'maria';
  root.id = 'mariaRoot';
  root.innerHTML = `
    <div class="maria-panel" id="mariaPanel" role="dialog" aria-label="Maria, actor guide" hidden>
      <div class="maria-head">
        <div class="maria-avatar" aria-hidden="true">
          <img src="js/OIP.jpg" alt="">
        </div>
        <div class="maria-id">
          <div class="maria-name">
            Maria
            <span class="maria-info-wrap">
              <button class="maria-info" type="button" id="mariaInfo" aria-expanded="false"
                      aria-describedby="mariaTip" aria-label="How these recommendations are made">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9"/><path d="M12 16v-4.5M12 8h.01"/>
                </svg>
              </button>
              <span class="maria-tip" id="mariaTip" role="tooltip">${esc(DISCLOSURE)}</span>
            </span>
          </div>
          <div class="maria-role">HexCoded assistant</div>
        </div>
        <button class="maria-x" type="button" id="mariaClose" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>

      <div class="maria-body" id="mariaBody"></div>
    </div>

    <button class="maria-intro" type="button" id="mariaIntro"
            aria-label="Ask Maria which actor to use">
      <span class="maria-bubble">Hi, I'm Maria — need help picking an actor?</span>
      <span class="maria-intro-avatar" aria-hidden="true">
        <img src="js/OIP.jpg" alt="">
      </span>
    </button>

    <button class="maria-fab" type="button" id="mariaFab" aria-expanded="false"
            aria-controls="mariaPanel" aria-label="Ask Maria which actor to use">
      <span class="maria-fab-avatar" aria-hidden="true">
        <img src="js/OIP.jpg" alt="">
      </span>
      <span class="maria-fab-label">Ask Maria</span>
    </button>`;
  document.body.appendChild(root);

  const panel = root.querySelector('#mariaPanel');
  const fab = root.querySelector('#mariaFab');
  const body = root.querySelector('#mariaBody');

  const greet = () => {
    body.innerHTML = `
      <div class="maria-msg">Hi, I'm Maria — your HexCoded assistant. What kind of brand are you?</div>
      <div class="maria-chips">
        ${CATEGORIES.map(c => `<button class="maria-chip" type="button" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>`;
  };

  const answer = (category) => {
    const { conf, html } = reply(category);
    body.innerHTML = `
      <div class="maria-msg maria-msg--you">${esc(category)}</div>
      <div class="maria-msg">
        ${html}
        <div class="maria-conf"><span class="conf-pill ${conf.cls}">${esc(conf.label)}</span></div>
      </div>
      <div class="maria-msg">Either way, the real answer comes from running it against your actual
        product image — that's what Fit Check does.</div>
      <div class="maria-actions">
        <a class="btn btn-primary btn-sm" href="#flow" id="mariaGo">Run a full Fit Check →</a>
        <button class="maria-again" type="button" id="mariaAgain">Ask about another category</button>
      </div>`;
  };

  body.addEventListener('click', (e) => {
    const chip = e.target.closest('.maria-chip');
    if (chip) { answer(chip.dataset.cat); return; }
    if (e.target.closest('#mariaAgain')) { greet(); return; }
    if (e.target.closest('#mariaGo')) {
      close();
      // hand off to the existing flow rather than duplicating it
      document.getElementById('flow')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  function open() {
    greet();                              // always start fresh — no history kept
    panel.hidden = false;
    root.classList.add('is-open');
    fab.setAttribute('aria-expanded', 'true');
  }
  function close() {
    panel.hidden = true;
    root.classList.remove('is-open');
    fab.setAttribute('aria-expanded', 'false');
  }
  function toggle() { panel.hidden ? open() : close(); }

  fab.addEventListener('click', toggle);
  root.querySelector('#mariaClose').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });

  /* ── (i) disclosure: hover/focus is CSS; this handles tap ──────────── */
  const info = root.querySelector('#mariaInfo');
  info.addEventListener('click', (e) => {
    e.stopPropagation();
    info.setAttribute('aria-expanded', info.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.maria-info-wrap')) info.setAttribute('aria-expanded', 'false');
  });

  /* ── first-load introduction ───────────────────────────────────────
     Shows the large card, then collapses it to the persistent pill. The
     pill is the CSS default, so if these timers never run for any reason
     the widget still ends up in its normal state. */
  const intro = root.querySelector('#mariaIntro');
  let holdTimer = null;

  function collapseIntro() {
    clearTimeout(holdTimer);
    if (!root.classList.contains('is-intro')) return;
    root.classList.remove('is-intro');
    root.classList.add('is-collapsing');          // keeps the card mounted while it shrinks
    setTimeout(() => root.classList.remove('is-collapsing'), COLLAPSE_MS);
  }

  // clicking the card (bubble or avatar) opens the panel instead of collapsing
  intro.addEventListener('click', () => { collapseIntro(); open(); });

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!reduced.matches) {
    setTimeout(() => {
      if (!panel.hidden) return;                  // already engaged — don't interrupt
      root.classList.add('is-intro');
      holdTimer = setTimeout(collapseIntro, INTRO_HOLD_MS);
    }, INTRO_DELAY_MS);
  }
  // reduced motion: no intro at all — the pill is already there, no movement
}

mount();
