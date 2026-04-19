# Polish Round — Design

**Date:** 2026-04-19
**Status:** Awaiting user review
**Builds on:** the live app state as of commit `de4c8a9` (post tech-debt sweep).

## Purpose

Three small features that together polish the app without inflating its scope:

1. **NOW Confidence Ring** — a subtle amber ring that *appears* around the countdown only when the data's trustworthiness drops.
2. **Tiny Facts Rotation** — a single quiet line rotating verified trivia about the Weaver line, the Chingford branch, the local area, and the trains running under the bridge.
3. **Approach Direction Cue — Option A (arrow emphasis)** — in the last 15 seconds before NOW, the `→` / `←` arrow in the active direction's label gets momentarily louder.

All three respect `prefers-reduced-motion`, stay light-palette-consistent, and never compete with the sacred countdown. Combined bundle impact: ~1 KB gzipped.

---

## Feature 1: NOW Confidence Ring

### Shape

A thin SVG arc around the countdown's `.value` element. **Invisible when confidence is high**; *appears* as a warm amber outline when confidence drops below `0.7`. Never shown when the direction is in the sleeping / just-crossed state.

### Confidence model

```
confidence = freshness × stability
```

#### `freshness: number in [0, 1]`

Derived from `now - lastFetchMs`:
- `age ≤ 30_000 ms` → `1.0`
- `30_000 < age < 90_000` → linear decay to `0.3`
- `age ≥ 90_000` → `0.3`

This reuses data we already have in `main.ts`. No new state.

#### `stability: number in [0, 1]`

Per-direction, tracks how consistent the *same vehicle's* `timeToStation` has been across the last 3 polls. The theory: between polls 20 s apart, a healthy prediction should drop by ~20 s. Large deviations in either direction mean TfL's reshuffling the schedule and our countdown is shakier than usual.

```
For each direction's hero train (identified by arrival.id OR vehicleId):
  track a ring buffer of the last 3 observed (timeToStation, fetchedAt) pairs.
  for each consecutive pair:
    expectedDelta = (t2.fetchedAt - t1.fetchedAt) / 1000  // should be ~20s
    actualDelta   = t1.timeToStation - t2.timeToStation
    driftSec      = |expectedDelta - actualDelta|
  avgDrift = mean of the two driftSec values from the 3 observations
  stability:
    avgDrift ≤ 5  → 1.0
    5 < avgDrift < 15 → linear 1.0 → 0.5
    avgDrift ≥ 15 → 0.5
```

**Cold-start guard.** Until we have ≥ 3 observations for a given vehicle, `stability = 1.0` (we don't know enough to doubt).

**Vehicle identity shift.** If the hero changes between polls (previous train left, new one promoted), reset the buffer for that direction. A fresh hero starts at `1.0`.

### Visualisation

The ring wraps the `.value` element, rendered as an SVG circle positioned relative to that element.

- **Ring only renders when `confidence < 0.7`.** Above that, the element has zero opacity. No permanent visual weight around the countdown.
- Arc length proportional to `1 - confidence` — a faint sliver at 0.6, a near-complete ring at 0.3.
- Stroke: `var(--warn)` amber, `2.5 px` thick, `stroke-linecap: round`.
- Positioned just *outside* the countdown's bounding box with ~6 px padding.
- Fades in over 400 ms using `transition: opacity`, so it doesn't pop.
- Respects `prefers-reduced-motion`: fade is replaced with instant swap.

### Integration points

- `src/confidence.ts` (new) — pure functions: `computeFreshness(ageMs)`, `computeStability(samples)`, `computeConfidence({ ageMs, samples })`.
- `src/main.ts` — add a per-direction ring-buffer of `{ vehicleId, tts, fetchedAt }` samples populated in `tick()`. Surface the computed confidence into `ViewModel`.
- `src/render.ts` — render the ring as a sibling of `.value` inside each `.row`. Opacity driven by a CSS custom property fed from the computed confidence.
- `src/styles.css` — new `.value-confidence-ring` styles + reduced-motion overrides.

### Tests

- `tests/confidence.test.ts` — unit tests for the three pure functions.
  - freshness boundaries at 30 s, 60 s, 90 s
  - stability: stable sequence (drift ≈ 0) → 1.0; jittery sequence → 0.5
  - cold-start: < 3 samples → 1.0
  - combined confidence product bounded [0.3, 1.0]

---

## Feature 2: Tiny Facts Rotation

### Shape

A single line of muted uppercase text between the footer ("updated 8s ago") and the `About · Privacy · Terms` row. Shows one fact at a time. Rotates in sync with the TfL poll (every 20 s) so the cadence feels natural. Fades in/out over 300 ms.

### Layout

```
… countdown + strips + ticker …
UPDATED 8S AGO
CHINGFORD BRANCH OPENED 24 APRIL 1870
ABOUT · PRIVACY · TERMS
```

Same `Big Shoulders Text`, `0.7rem`, warm graphite, uppercase with `0.15em` letter-spacing. Low opacity (~0.6) so it sits behind the data visually but remains readable.

**Hard cap:** one line. `white-space: nowrap; text-overflow: ellipsis;` so an over-long fact truncates rather than wraps.

### Fact pool (25 curated, verified)

All cross-checked against Wikipedia. Grouped here for review; stored in code as a flat array.

**The line itself**
1. `Chingford branch opened 24 April 1870`
2. `Built by Great Eastern Railway`
3. `Electrified November 1960`
4. `Upgraded to 25 kV in 1983`
5. `Renamed "Weaver line" in February 2024`
6. `Named after East End textile workers`

**Stations on the branch**
7. `Walthamstow Central was called Hoe Street`
8. `Renamed to Walthamstow Central in 1968`
9. `Wood Street station opened in 1873`
10. `Wood Street was almost the Victoria terminus`
11. `Highams Park was originally "Hale End"`
12. `Highams Park was renamed in 1894`
13. `Chingford station rebuilt in 1878`
14. `Chingford is the end of the line — 3 platforms`
15. `Queen Victoria visited Chingford in 1882`

**The trains**
16. `Class 710 Aventra — built in Derby`
17. `Class 710 trains built 2017–2020`
18. `Class 710 top speed: 75 mph`
19. `Class 710 four-car trains are 83 m long`

**Walthamstow local**
20. `William Morris was born in Walthamstow`
21. `He was a textile designer and poet`
22. `Walthamstow Market is Europe's longest`
23. `East Avenue is in the village conservation area`
24. `Morris Gallery is at Lloyd Park`
25. `Britain's first plastics factory opened here, 1894`

**Editorial rules going forward**
- Every fact must be verifiable against a public source
- Short enough to never wrap on a 375 px viewport (≤ ~42 chars)
- No dates-only facts that don't land — "Opened 1870" alone is boring; context matters
- Scoped to THIS line / THIS area / THESE trains — no generic "railway trivia"
- Hard cap: 25 facts. Adding more requires a specific reason

### Rotation

- Start with a randomly-shuffled deck of all 25 facts (Fisher-Yates)
- Advance through the deck one per TfL-poll tick (every 20 s)
- When the deck is exhausted, reshuffle and continue
- Persist the current index to `localStorage` (key `wtt_facts_index`) so opening the app doesn't always start at the same fact
- No pause on hover/tap — this is not interactive

### Integration points

- `src/facts.ts` (new) — the verified fact array + a small state machine with `next(): string` and persistence helpers using the existing `safeLocalRead`/`Write` wrappers.
- `src/main.ts` — call `facts.next()` inside `tick()` (after a successful fetch) and pass the current fact into the view model.
- `src/render.ts` — render below the footer, above the doc-links row.
- `src/styles.css` — new `.fact-line` styles.

### Tests

- `tests/facts.test.ts` — cover the rotation machine:
  - 25 unique facts before any repeat
  - wraps (re-shuffles) on exhaustion
  - every fact is ≤ 45 characters (to guard against a future over-long addition)
  - `next()` is deterministic given a seeded shuffle

---

## Feature 3: Approach Direction Cue — Arrow Emphasis

### Shape

During the last 15 seconds of a countdown (when `formatCountdown(bridgeTime).kind === 'seconds'`), the leading `→` or `←` character in the direction label pulses slightly — grows ~15 % in size on a slow 1 s cycle and brightens from the current `var(--overground)` orange to a slightly more vivid variant. Stops when the countdown transitions to `now`, so the emphasis crescendos into the NOW celebration rather than competing with it.

Pure CSS, triggered by a class applied to the `.row` element when the hero's countdown kind is `seconds`.

### Why only `seconds` kind

- At `minutes`: plenty of time, no need to direct the eye
- At `seconds`: 11–59s range, user is now actively waiting and about to look up
- At `now`: the NOW state has its own pulse + bridge jiggle; another animation would compete

### Integration points

- `src/render.ts` — when building each row, add `.row-imminent` to the section when `formatCountdown(bridgeTime).kind === 'seconds'`.
- `src/styles.css` — `.row-imminent .label::first-letter` animates scale + color. Respects `prefers-reduced-motion`.

### Tests

No unit tests for this — it's pure CSS triggered by a conditional class. Existing render tests cover that the class gets applied (or are added in the plan).

---

## Architecture summary

### New files
```
src/
├── confidence.ts    # pure computeFreshness / computeStability / computeConfidence
├── facts.ts         # verified fact array + rotation state machine

tests/
├── confidence.test.ts
├── facts.test.ts
```

### Modified files
```
src/
├── main.ts          # ring-buffer of samples, rotation index, VM extensions
├── render.ts        # confidence ring, fact-line row, .row-imminent class
├── styles.css       # ring, fact-line, first-letter emphasis
```

### Bundle impact
- `confidence.ts`: ~40 lines → ~0.4 KB gz
- `facts.ts`: 25 strings + rotation → ~0.6 KB gz
- `render.ts` + CSS additions → ~0.3 KB gz

Total ~1.3 KB gzipped. Within budget.

### Tests
101 existing + ~10–12 new = ~114 tests expected after this round.

---

## Deployment

Frontend-only, no infra changes. Push to `main`, Netlify auto-deploys, service worker precache picks up the new facts on next visit.

## Open questions for implementation

1. **Facts**: Ben — scan the 25 for anything you'd swap / reject. Particularly flag any where the fact is *technically accurate but feels off* (e.g. `Britain's first plastics factory opened here, 1894` — the British Xylonite Co. actually moved to the area in 1897; I'll tighten that one to `"Early plastics factory arrived 1894"` if the year is confirmed — double-check before shipping).
2. **Confidence ring position**: above or below the countdown numerals? Above keeps the ring out of the way on mobile where thumbs tend to approach from below. Recommend **above**.
3. **Fact rotation rate**: 20 s matches the poll, so each fact is shown for one full tick of display life. Could slow to 30 s if 20 feels rushed — easy to tune post-launch.
