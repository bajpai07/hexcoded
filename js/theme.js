/**
 * theme.js
 * -----------------------------------------------------------------------
 * Light/dark toggle. Purely presentational — it sets one attribute on
 * <html> and writes one localStorage key. It never touches scoring,
 * storage, or any Fit Check state, so toggling mid-flow is a no-op as
 * far as the working prototype is concerned.
 *
 * The attribute is applied by a tiny inline script in <head> BEFORE this
 * module loads, so there is no flash of the wrong theme on refresh.
 * This file only wires up the button and keeps the two in sync.
 * -----------------------------------------------------------------------
 */
const KEY = 'hexcoded-theme';

function current() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function apply(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  const btn = document.getElementById('themeToggle');
  if (btn) {
    // the button offers the theme you would switch TO
    const next = theme === 'light' ? 'dark' : 'light';
    btn.setAttribute('aria-label', `Switch to ${next} theme`);
    btn.setAttribute('title', `Switch to ${next} theme`);
    btn.setAttribute('aria-pressed', String(theme === 'light'));
  }
}

function save(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* private mode — fine, session-only */ }
}

const btn = document.getElementById('themeToggle');
if (btn) {
  btn.addEventListener('click', () => {
    const next = current() === 'light' ? 'dark' : 'light';
    apply(next);
    save(next);
  });
}

// sync the label/state with whatever the inline head script already applied
apply(current());
