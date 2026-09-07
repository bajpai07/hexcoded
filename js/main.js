import { extractDominantColor, computeFitScore, deliveryLabel } from './scoring.js';
import { blendedScore, confidenceFor, logOutcome, allEntries, resetAll } from './storage.js';

/* ---------- actor personas ---------- */
/* actorHue is a defined brand-tone hue (0-360) used directly in the real
   hue-harmony calculation in scoring.js — not decorative. */
export const actors = [
  { name: 'Aanya', tag: 'AI actor', grad: ['#22c55e', '#0d9488'], actorHue: 152 },
  { name: 'Rohan', tag: 'AI actor', grad: ['#3b82f6', '#1e3a8a'], actorHue: 217 },
  { name: 'Meera', tag: 'Licensed actor', grad: ['#f59e0b', '#b45309'], actorHue: 38 },
  { name: 'Kabir', tag: 'Your AI twin', grad: ['#ef4444', '#7f1d1d'], actorHue: 0 },
  { name: 'Isha', tag: 'AI actor', grad: ['#a855f7', '#581c87'], actorHue: 272 },
  { name: 'Dev', tag: 'Licensed actor', grad: ['#10b981', '#065f46'], actorHue: 160 },
];

let productImageEl = null;   // real <img> element, used for pixel extraction
let productHsl = null;
let productCategory = null;
let selectedActor = null;
let currentKey = null;
let currentLabel = null;
let lastHeuristic = null;

/* ---------- avatar rendering (professional placeholder, honestly labeled) ---------- */
function avatarSVG(a) {
  return `
  <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g-${a.name}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${a.grad[0]}"/>
        <stop offset="100%" stop-color="${a.grad[1]}"/>
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="32" fill="url(#g-${a.name})"/>
    <circle cx="32" cy="25" r="10.5" fill="#ffffff" fill-opacity="0.92"/>
    <path d="M10 60 C10 44 19.5 36 32 36 C44.5 36 54 44 54 60 Z" fill="#ffffff" fill-opacity="0.92"/>
  </svg>`;
}

function renderActorGrid() {
  const grid = document.getElementById('actorGrid');
  grid.innerHTML = '';
  actors.forEach((a, i) => {
    const card = document.createElement('div');
    card.className = 'actor-card';
    card.innerHTML = `
      <div class="actor-avatar">${avatarSVG(a)}</div>
      <div class="actor-name">${a.name}</div>
      <div class="actor-tag">${a.tag}</div>
      <div class="actor-delivery">${deliveryLabel(a.name)}</div>
    `;
    card.addEventListener('click', () => selectActor(i, card));
    grid.appendChild(card);
  });
}

function selectActor(i, el) {
  document.querySelectorAll('.actor-card').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
  selectedActor = actors[i];
  document.getElementById('toStep3').disabled = false;
}

/* ---------- step navigation ---------- */
function goStep(n) {
  [1, 2, 3].forEach(i => {
    const panel = document.getElementById('step' + i);
    if (i === n) {
      panel.style.display = 'block';
      panel.style.animation = 'none';
      panel.offsetHeight; // force reflow
      panel.style.animation = 'scaleIn .4s ease-out both';
    } else {
      panel.style.display = 'none';
    }
    document.getElementById('dot' + i).classList.toggle('active', i === n);
    document.getElementById('dot' + i).classList.toggle('done', i < n);
    document.getElementById('lab' + i).classList.toggle('on', i <= n);
  });
  // Smooth scroll to top of panel
  document.querySelector('.rail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- upload handling ---------- */
const uploadErr = document.getElementById('uploadErr');
function showUploadError(msg) {
  uploadErr.textContent = msg;
  uploadErr.classList.add('show');
}
function clearUploadError() {
  uploadErr.classList.remove('show');
  uploadErr.textContent = '';
}

/* #dropSub reflects the COMBINED state, not whichever handler ran last —
   otherwise uploading first and picking a category second leaves the caption
   still saying "upload an image above" after the image is already there. */
const DROP_SUB_DEFAULT = 'JPG or PNG · local upload only';
function updateDropSub() {
  const sub = document.getElementById('dropSub');
  if (!productCategory) {
    sub.textContent = DROP_SUB_DEFAULT;
  } else if (!productImageEl) {
    sub.textContent = 'Category set to: ' + productCategory + ' — upload an image above to continue';
  } else {
    sub.textContent = 'Category set to: ' + productCategory + ' — ready to continue';
  }
}

document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  clearUploadError();
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      productImageEl = img;
      try {
        productHsl = extractDominantColor(img);
      } catch (err) {
        showUploadError(err.message);
        productHsl = null;
      }
      const drop = document.getElementById('dropZone');
      drop.classList.add('filled');
      // Keep the <input> alive (don't wipe it via innerHTML) so re-clicking still opens the file picker
      drop.querySelectorAll('.preview-img').forEach(el => el.remove());
      drop.querySelector('svg').style.display = 'none';
      const preview = document.createElement('img');
      preview.className = 'preview-img';
      preview.src = ev.target.result;
      drop.insertBefore(preview, document.getElementById('dropTitle'));
      document.getElementById('dropTitle').textContent = 'Click to change product photo';
      updateDropSub();
      document.getElementById('toStep2').disabled = !productCategory;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

document.querySelectorAll('.sample-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.sample-chip').forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
    productCategory = chip.dataset.cat;
    updateDropSub();
    document.getElementById('toStep2').disabled = !productImageEl;
  });
});

document.getElementById('toStep2').addEventListener('click', () => goStep(2));
document.getElementById('backTo1').addEventListener('click', () => goStep(1));
document.getElementById('backTo2').addEventListener('click', () => goStep(2));

/* ---------- fit check ---------- */
function comboKey(cat, actorName, actorTag) { return `${cat}__${actorTag}__${actorName}`; }
function comboLabel(cat, actorName, actorTag) { return `${cat} · ${actorTag} · ${actorName}`; }

document.getElementById('toStep3').addEventListener('click', () => {
  goStep(3);
  runFitCheck();
});

/* The heuristic main.js last computed. lastHeuristic was already tracked but
   unread; exposing it lets the sparkline use the authoritative value instead of
   rebuilding it from the rounded swatch colour, which drifts the hue slightly. */
export function currentHeuristic() { return lastHeuristic; }

function runFitCheck() {
  currentKey = comboKey(productCategory, selectedActor.name, selectedActor.tag);
  currentLabel = comboLabel(productCategory, selectedActor.name, selectedActor.tag);

  const heuristic = computeFitScore({
    productHsl,
    actorHueDeg: selectedActor.actorHue,
    category: productCategory,
    actorTag: selectedActor.tag,
    actorName: selectedActor.name,
  });
  lastHeuristic = heuristic;

  const { score, n } = blendedScore(currentKey, heuristic.score);
  const conf = confidenceFor(n);

  // evidence panel — real values, not decoration
  document.getElementById('swatchActor').style.background =
    `hsl(${selectedActor.actorHue}, 65%, 50%)`;
  document.getElementById('swatchProduct').style.background = productHsl
    ? `hsl(${productHsl.h.toFixed(0)}, ${(productHsl.s * 100).toFixed(0)}%, ${(productHsl.l * 100).toFixed(0)}%)`
    : '#333';
  document.getElementById('evColor').textContent = (heuristic.colorComponent * 100).toFixed(0) + '%';
  document.getElementById('evAffinity').textContent = (heuristic.affinity * 100).toFixed(0) + '%';
  document.getElementById('evDelivery').textContent = (heuristic.delivery * 100).toFixed(0) + '%';

  // Animated score counter
  const scoreEl = document.getElementById('scoreNum');
  scoreEl.classList.remove('pulse');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('pulse');
  const targetScore = score;
  let current = 0;
  const duration = 800;
  const startTime = performance.now();
  function animateScore(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    current = (targetScore * eased).toFixed(1);
    scoreEl.textContent = current;
    if (progress < 1) requestAnimationFrame(animateScore);
  }
  requestAnimationFrame(animateScore);

  document.getElementById('confPill').textContent = conf.label;
  document.getElementById('confPill').className = 'conf-pill ' + conf.cls;

  const verdict = document.getElementById('verdictBox');
  if (n === 0) {
    verdict.className = 'verdict cold';
    verdict.innerHTML = `No logged outcomes yet for <b>${currentLabel}</b> — this is a heuristic-only estimate from real color analysis, not yet backed by real render data.`;
  } else {
    verdict.className = 'verdict warm';
    verdict.innerHTML = `Blended from <b>${n}</b> logged outcome${n > 1 ? 's' : ''} for <b>${currentLabel}</b> — the heuristic's influence shrinks as real data grows.`;
  }

  document.getElementById('resultDesc').textContent =
    `${selectedActor.name} × ${productCategory} — scored from your actual uploaded image, before any video credits spent.`;

  renderFlywheel();
}

document.getElementById('logBtns').addEventListener('click', (e) => {
  const btn = e.target.closest('.logBtn');
  if (!btn || !currentKey) return;
  const score = parseFloat(btn.dataset.score);
  logOutcome(currentKey, currentLabel, score);

  document.getElementById('logBtns').style.display = 'none';
  document.getElementById('logPrompt').style.display = 'none';
  document.getElementById('loggedTag').classList.add('show');
  showToast('Outcome logged — score re-blended');

  runFitCheck();

  setTimeout(() => {
    document.getElementById('logBtns').style.display = 'flex';
    document.getElementById('logPrompt').style.display = 'block';
    document.getElementById('loggedTag').classList.remove('show');
  }, 900);
});

document.getElementById('fullRenderBtn').addEventListener('click', () => {
  showToast('In production: this hands off to Creative Studio for the full render →');
});

/* ---------- flywheel ---------- */
function renderFlywheel() {
  const data = allEntries();
  const keys = Object.keys(data);
  const totalPoints = keys.reduce((s, k) => s + data[k].count, 0);
  document.getElementById('statCombos').textContent = keys.length;
  document.getElementById('statPoints').textContent = totalPoints;

  const lb = document.getElementById('leaderboard');
  if (keys.length === 0) {
    lb.innerHTML = '<div class="lb-empty">No data logged yet — be the first.</div>';
    return;
  }
  const ranked = keys
    .map(k => ({ label: data[k].label || k, avg: +(data[k].sum / data[k].count).toFixed(1), count: data[k].count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  lb.innerHTML = ranked.map(r => `
    <div class="lb-item">
      <div><div>${r.label}</div><div class="lb-meta">${r.count} outcome${r.count > 1 ? 's' : ''} logged</div></div>
      <div class="lb-score">${r.avg}</div>
    </div>
  `).join('');
}

document.getElementById('resetBtn').addEventListener('click', () => {
  resetAll();
  showToast('Local demo data reset');
  renderFlywheel();
  if (currentKey) runFitCheck();
});

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1600);
}

/* ---------- init ---------- */
renderActorGrid();
renderFlywheel();
