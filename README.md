# HexCoded — Fit Check + Conversion Intelligence (prototype)

A working prototype for a pre-render "fit check" that scores an actor × product
combination, then learns from real logged outcomes over time.

## Run it locally

No build step, no npm install required — plain ES modules.

```bash
git clone https://github.com/bajpai07/hexcoded.git
cd hexcoded
python3 -m http.server 8000
# open http://localhost:8000
```

Or, if you have Node:

```bash
npx serve .
```

## Architecture

```
index.html      — markup only, no inline logic
style.css       — design system + light/dark themes, all colors tokenised
js/scoring.js   — the actual score computation (pure functions, no DOM)
js/storage.js   — local persistence + Bayesian blending (pure functions, no DOM)
js/main.js      — DOM wiring: reads user input, calls scoring/storage, updates UI
js/library.js   — actor-library section: usage rank vs. measured fit score
js/theme.js     — light/dark toggle (presentational only)
```

Scoring and storage are separated from DOM code on purpose — they're plain
functions you could unit-test or swap out (e.g. replace `computeFitScore`
with a real API call to a trained model) without touching `main.js`'s wiring.

`library.js` and `theme.js` are strictly additive: they read through the same
public helpers and never write scoring state, so the Fit Check flow behaves
identically with or without them. The theme toggle is pure presentation —
one attribute on `<html>` plus a `localStorage` key, with an inline script in
`<head>` so a saved theme never flashes the wrong way on load.

## Page structure

Hero → credit economics → toolset → models strip → actor library →
languages → the working Fit Check flow → what's real vs. stand-in.

The actor library is the one worth looking at: it shows usage rank (a
placeholder for how actors are ranked today) beside a fit score pulled live
from whatever you have logged in that browser — which is the whole argument
for the feature, made concrete rather than asserted.

## What's real vs. what's a stand-in

Being upfront about this matters more than pretending it's finished.

**Real, inspectable computation:**
- `extractDominantColor()` actually reads pixel data from your uploaded
  image via Canvas `getImageData` and averages it into an HSL color. Not a
  hash, not a random number.
- `blendedScore()` uses a Bayesian shrinkage estimate — the heuristic acts
  as a prior with a fixed virtual weight, and real logged outcomes pull the
  score toward themselves as they accumulate. This is a named statistical
  technique, not a naive running average.
- Persistence is real (`localStorage`) — refresh the page and logged data
  is still there.

**Explicit stand-ins (would change in production):**
- `AFFINITY` in `scoring.js` is a hand-set category × actor-type table.
  In production this table (or a proper learned model) would come from
  real aggregated render-outcome data — same code path, trained weights
  instead of hand-set ones.
- The hue-harmony rule (`hueHarmony`) is a simple, explainable heuristic
  for "do these colors work together" — a real version would likely use
  embedding similarity (e.g. CLIP-style) instead of raw color math.
- Actor avatars are gradient + generic person-icon placeholders (no real
  photos), specifically because using real people's photos without
  confirmed consent would conflict with HexCoded's own licensed-actor
  model — in production this pulls from the real actor library.
- The hero composition and the model-strip vendor marks are original
  CSS/SVG — no real product footage and no real vendor logo files. The
  hero's front card is a pure-CSS animated placeholder, labeled as
  illustrative rather than presented as a live render.
- Usage ranks in the actor library are static placeholders. The fit scores
  beside them are not — those are read from real logged outcomes.

## Not affiliated

Built as a prototype for an internship application. Not affiliated with or
endorsed by HexCoded; all product references are based on publicly available
information on hexcoded.ai.

## Why this shape, not a bigger fake demo

It would have been easy to hardcode a bigger, more impressive-looking
number and call it "AI-powered." The point of this prototype is the
opposite: every number on screen is either genuinely computed from real
input, or clearly labeled as a placeholder for what a real model would
replace it with — so a technical review holds up instead of falling apart
on the first "how does this actually work?" question.
