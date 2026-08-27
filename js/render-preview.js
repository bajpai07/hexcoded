/**
 * render-preview.js
 * -----------------------------------------------------------------------
 * Opens an illustrative composite when "Proceed to full render" is clicked.
 *
 * Strictly additive. It attaches a SECOND listener to #fullRenderBtn rather
 * than modifying main.js's handler, so the existing toast still fires and no
 * scoring, storage or flow logic is touched.
 *
 * It deliberately reads its inputs from the live DOM at click time —
 * the uploaded image, the selected actor card, the displayed score — rather
 * than from main.js's module-local variables (which are not exported). That
 * keeps the coupling one-way AND means every open reflects the current combo,
 * never stale data from a previous one.
 *
 * Nothing here is a real render. The composite is CSS/HTML only and is
 * labeled as illustrative on the face of it.
 * -----------------------------------------------------------------------
 */
import { actors } from './main.js';

const FALLBACK_MODEL = 'Veo 3.1';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The actor whose card is currently selected, resolved to its full record. */
function currentActor() {
  const card = document.querySelector('#actorGrid .actor-card.sel');
  if (!card) return null;
  const name = card.querySelector('.actor-name')?.textContent.trim();
  const tag = card.querySelector('.actor-tag')?.textContent.trim();
  return actors.find(a => a.name === name && a.tag === tag) || null;
}

/** Pull the model names from the marquee so this never drifts from that list. */
function pickModel() {
  const names = [...new Set(
    [...document.querySelectorAll('.model-name')].map(e => e.textContent.trim()).filter(Boolean)
  )];
  if (!names.length) return FALLBACK_MODEL;
  return names[Math.floor(Math.random() * names.length)];
}

function avatarSVG(a) {
  const id = `rp-g-${a.name}`;
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

function build() {
  const dlg = $('renderPreview');
  if (!dlg) return false;

  const actor = currentActor();
  const img = document.querySelector('#dropZone .preview-img');
  const category = document.querySelector('.sample-chip.on')?.dataset.cat || '—';
  const score = $('scoreNum')?.textContent.trim() || '—';
  const conf = $('confPill')?.textContent.trim() || '';
  const confCls = $('confPill')?.className.replace('conf-pill', '').trim() || '';

  if (!actor || !img) return false;   // only reachable from step 3, but stay safe

  // brand-tone accent, same hue main.js feeds into the real scoring
  dlg.style.setProperty('--rp-tone', `hsl(${actor.actorHue}, 65%, 50%)`);

  $('rpTitle').textContent = `${actor.name} × ${category}`;
  $('rpSub').textContent = `${actor.tag} · brand tone ${actor.actorHue}°`;

  $('rpAvatar').innerHTML = avatarSVG(actor);
  $('rpActorName').textContent = actor.name;
  $('rpActorTag').textContent = actor.tag;

  // reuse the exact image the user uploaded in step 1
  const shot = $('rpProductImg');
  shot.src = img.src;
  shot.alt = '';
  $('rpProductCat').textContent = category;

  $('rpScore').textContent = score;
  const pill = $('rpConf');
  pill.textContent = conf;
  pill.className = 'conf-pill ' + confCls;
  pill.style.display = conf ? '' : 'none';

  $('rpModel').textContent = pickModel();
  return true;
}

function open() {
  const dlg = $('renderPreview');
  if (!dlg || !build()) return;
  if (dlg.open) return;
  // showModal gives focus trapping, Esc-to-close and an inert background
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
}

function close() {
  const dlg = $('renderPreview');
  if (!dlg) return;
  if (typeof dlg.close === 'function' && dlg.open) dlg.close();
  else dlg.removeAttribute('open');
}

const btn = $('fullRenderBtn');
if (btn) btn.addEventListener('click', open);          // added, not replacing

const dlg = $('renderPreview');
if (dlg) {
  dlg.querySelectorAll('[data-rp-close]').forEach(el => el.addEventListener('click', close));
  // click the backdrop (outside the panel) to dismiss
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
}
