/**
 * storage.js
 * -----------------------------------------------------------------------
 * Local persistence for the "flywheel" — real logged outcomes accumulate
 * per browser via localStorage. Deliberately NOT shared/global, so a
 * live demo can't get its data mixed by a second person opening the
 * same link mid-presentation. In production this would be a real
 * database keyed by org, not a browser-local store.
 *
 * The blending function uses a Bayesian shrinkage estimate: the
 * heuristic score acts as a "prior" with a fixed virtual weight, and
 * real logged outcomes pull the estimate toward themselves as more
 * accumulate. This is a genuine, named statistical technique — not
 * a naive running average, and not a fake hash.
 * -----------------------------------------------------------------------
 */

const KEY = 'hexcoded-elite-flywheel-v1';
const PRIOR_WEIGHT = 2; // heuristic counts as ~2 "virtual" observations

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function getEntry(comboKey) {
  return load()[comboKey] || null;
}

export function logOutcome(comboKey, label, score) {
  const data = load();
  if (!data[comboKey]) data[comboKey] = { sum: 0, count: 0, label };
  data[comboKey].sum += score;
  data[comboKey].count += 1;
  data[comboKey].label = label;
  save(data);
}

/**
 * Blends the heuristic score with any real logged outcomes for this
 * combo using Bayesian shrinkage. Confidence is reported separately
 * so the UI never claims certainty it doesn't have.
 */
export function blendedScore(comboKey, heuristicScore) {
  const entry = getEntry(comboKey);
  const n = entry ? entry.count : 0;
  const loggedSum = entry ? entry.sum : 0;
  const blended = (heuristicScore * PRIOR_WEIGHT + loggedSum) / (PRIOR_WEIGHT + n);
  return { score: +blended.toFixed(1), n };
}

export function confidenceFor(n) {
  if (n === 0) return { label: 'heuristic only', cls: 'none' };
  if (n === 1) return { label: 'low confidence', cls: 'low' };
  if (n <= 4) return { label: 'medium confidence', cls: 'med' };
  return { label: 'high confidence', cls: 'high' };
}

export function allEntries() {
  return load();
}

export function resetAll() {
  localStorage.removeItem(KEY);
}
