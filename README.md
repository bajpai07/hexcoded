# Fit Check — Conversion Intelligence for HexCoded

A working prototype that scores an actor × product pairing before a render
spends credits, then learns from real logged outcomes over time.

Live demo: https://hexcoded.vercel.app/

## The problem

HexCoded already refunds credits when a render fails technically. That's the
easy case — it's already solved.

The expensive case is the one nobody's pricing model catches: a render that
completes cleanly but pairs the wrong actor with the wrong product. The system
calls that a success — it bills the full ~2,000 credits for a finished 15s ad —
even though the ad itself was doomed the moment the wrong actor was cast.

Usage-based actor rankings make this worse: the actors who get picked most are
the ones who get picked most, regardless of whether they actually convert for
the category they're being used in. Volume rewards volume, not fit.

There's already a hint of the fix living inside HexCoded today — informal,
hand-written tags on the casting site ("great for skincare ads"). That signal
exists in the product's vocabulary. It's just never been measured, scored, or
fed back into a ranking.

## The insight

Two things HexCoded already has, that nobody's connected yet:

1. **Free failed renders** — proof that wasted spend is already treated as a
   problem worth solving. Just not this kind of waste.
2. **Informal per-actor fit tags** — proof that actor-category fit is already
   part of how the team thinks about casting. Just not quantified.

Fit Check is the connective tissue: a pre-flight score, computed before
Creative Studio spends anything, that turns "great for skincare ads" from a
hunch into a number — and gets sharper every time a real outcome is logged
against it.

It's not a new product. It's a checkpoint that sits in front of the tools that
already exist (URL → Ad, Custom video, Talking actors, Creative Studio) and an
API access point that Team/Scale plans already expose.

## How the score is actually computed

Two real signals, blended, then corrected by real data:

```
score = 4 + [ (colorHarmony × 0.55) + (categoryAffinity × 0.45) ] × 6
```

1. **Color harmony (real, computed live)** — the uploaded product image is
   downsampled and read pixel-by-pixel via Canvas `getImageData`, averaged into
   an HSL value, and compared against the selected actor's defined brand-tone
   hue. Complementary and analogous hues score highest. This is genuine pixel
   math on the actual upload — not a hash, not a placeholder.
2. **Category × actor-type affinity (hand-set stand-in)** — a small curated
   table mapping product category to actor type (AI actor / licensed actor /
   your AI twin). This is the one piece explicitly not real: in production it's
   the same code path, but the numbers come from aggregated render-outcome data
   instead of being hand-set.
3. **Bayesian shrinkage toward logged outcomes** — the heuristic above acts as
   a prior with a fixed virtual weight (2 observations). Every time a user logs
   what actually happened (Low / Average / High), that real outcome is blended
   in — `(heuristic × priorWeight + Σoutcomes) / (priorWeight + n)` — so the
   score's confidence visibly shifts from "heuristic only" → "low" → "medium" →
   "high" as real data accumulates.

This is the actual data-flywheel: the more it's used, the less it depends on
the hand-set table and the more it depends on what really converted.

That's the whole pitch made mechanical instead of asserted: today, actor
casting runs on a usage-rank ("who gets picked most") that's self-reinforcing.
Fit Check adds a second ladder — a fit-rank ("who actually converts for this
category") — that a well-matched but rarely-used actor can win without first
winning on volume.

## Architecture

```
index.html            — markup only, zero inline logic
style.css             — design system, tokenised colors, light/dark themes
js/scoring.js         — score computation (pure functions, no DOM, unit-testable)
js/storage.js         — persistence + Bayesian blending (pure functions, no DOM)
js/main.js            — DOM wiring: reads input, calls scoring/storage, updates UI
js/library.js         — actor-library view (usage rank vs. measured fit score)
js/render-preview.js  — illustrative Creative Studio hand-off modal
js/theme.js           — light/dark toggle (presentational only)
```

Deliberate separation: scoring and storage never touch the DOM.
`computeFitScore()` and `blendedScore()` are plain, testable functions —
swapping the hand-set `AFFINITY` table for a real trained-model API call means
changing one function, not rewiring the UI.

`library.js`, `render-preview.js`, and `theme.js` are strictly additive — they
read through the same public helpers and never write scoring state, so removing
any of them leaves the core Fit Check flow completely unaffected. That's the
same modularity a real feature rollout would need: ship the pre-flight check
first, layer the surrounding UI after, without a rewrite.

No build step. No framework. Plain ES modules — `python3 -m http.server` or
`npx serve .` and it runs, which is deliberate: reviewing a prototype shouldn't
require an `npm install` to even see it work.

## Run it locally

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

## What's real vs. what's a stand-in

Being upfront about this matters more than pretending it's finished.

**Real:**
- **Pixel-level color extraction** — genuine `getImageData` computation on the
  actual upload.
- **Bayesian outcome blending** — a named statistical technique, not a naive
  average.
- **Persistence** — `localStorage`, survives a page refresh.

**Stand-in:**
- **The affinity table & hue-harmony rule** — hand-set for the demo; same
  architecture would take trained weights in production.
- **Actor avatars** — generic placeholders, not real photos, since using real
  people's likenesses without confirmed consent would conflict with HexCoded's
  own licensed-actor model.
- **Hero composition & vendor marks** — original CSS/SVG, no real product
  footage or logo files.
- **Usage ranks in the actor library** — static placeholders standing in for
  the real volume-based ranking; the fit scores beside them are not — those are
  live.

## Why this shape, not a bigger fake demo

It would have been easy to hardcode an impressive-looking number and call it
"AI-powered." The point here is the opposite: every number on screen is either
genuinely computed from real input, or clearly labeled as a stand-in for what a
trained model would replace it with — so a technical review holds up instead of
collapsing on the first "how does this actually work?"

## Not affiliated

Built as a prototype for an internship application. Not affiliated with or
endorsed by HexCoded; all product references are based on publicly available
information on hexcoded.ai.
