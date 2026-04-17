# Weaver Strip — Design

**Date:** 2026-04-17
**Status:** Awaiting user review
**Builds on:** [2026-04-17-walthamstow-train-tracker-design.md](./2026-04-17-walthamstow-train-tracker-design.md)

## Purpose

Add a single horizontal strip to the live Walthamstow Train Tracker PWA showing where each "next train" currently sits along the Chingford branch of the Weaver line. The strip runs below the two existing countdowns and above the footer. Intent: turn the app into something a toddler can watch, not just a number Ben glances at.

## Scope

### In scope

- Horizontal strip showing **all 9 stops** of the Chingford branch (Liverpool Street → Chingford), labelled with 3-letter abbreviations.
- **East Avenue bridge** shown as its own landmark on the line, sitting *between* Walthamstow Central (index 5) and Wood Street (index 6) — this is the emotional focal point of the strip and the whole point of the app.
- **Two cartoon SVG trains** — one for the single next northbound arrival, one for the single next southbound arrival. No multi-train clutter.
- Train position estimated from the `timeToStation` field already in the TfL response, using a hardcoded inter-station travel-time table (see *Estimating train position* below) — zero new network calls.
- **Smooth glide** animation: every second, we re-estimate position against a locally-decremented timeToStation so the train appears to move continuously rather than jumping every 20s.
- **Subtle smoke animation** from the train's smokestack.
- **Subtle bridge jiggle** when a tracked direction's countdown transitions into the "NOW" state.
- Gracefully hide a train when its direction has no imminent arrival or the estimate falls outside the modelled range.

### Out of scope

- Multi-train display (2nd/3rd upcoming arrivals).
- Geographic map view.
- Vertical list layout.
- Tappable stops (no detail-on-tap UX).
- Showing stops beyond the Chingford branch.
- Dark/light theme toggle — the strip uses the existing dark palette unchanged.

## Domain background

### Chingford-branch stops

Ordered southbound-to-northbound, with 3-letter abbreviations used on the strip:

| # | Full name | Abbrev |
|---|---|---|
| 0 | Liverpool Street | **Liv** |
| 1 | Bethnal Green | **Bth** |
| 2 | Hackney Downs | **Hck** |
| 3 | Clapton | **Clp** |
| 4 | St James Street | **StJ** |
| 5 | **Walthamstow Central** | **WC** |
| 6 | Wood Street | **Wds** |
| 7 | Highams Park | **Hig** |
| 8 | Chingford | **Chg** |

Walthamstow Central sits at index 5. East Avenue bridge lies between index 5 and index 6 — rendered as its own standalone landmark on the line visually placed **halfway between the WC and Wds pips** (CSS `left: calc((100% / 8) * 5.5)` if using the same positioning formula as trains). The bridge is *not* a model position — the train-position math stays on integer stop indices `0–8`. The bridge is a pure visual element. It's drawn as a small arch-bridge SVG sitting on the line with an "East Av" caption below, filled in `var(--accent)` to match the trains, while stations are outlined circles in `var(--dim)`.

**Why the bridge isn't a model position:** a northbound train's tracked countdown ends at `timeToStation = 0` (arrival at WC platform), but its bridge-crossing happens ~90s *after* that (when `timeToStation` is already negative and the train has filtered out of our `pickNextPerDirection` selection once `bridgeTimeSeconds < -30`). Modelling post-WC travel would require extra complexity for minimal toddler benefit. We accept that:

- **Southbound trains** visibly glide past the bridge's CSS position as they approach WC (position decreases from >5.5 toward 5).
- **Northbound trains** visibly reach WC (position 5) and disappear; the bridge celebration still fires when the countdown hits NOW, even though no train is on the strip at that moment.

The bridge's emotional role is to mark "home" and to celebrate crossings via the jiggle — it doesn't need a train sitting on it at the moment of celebration.

### Train direction and position

- **Northbound** trains (destination Chingford) travel from lower index → higher index. Their cartoon faces right (`→`).
- **Southbound** trains travel from higher index → lower index. Their cartoon faces left (`←`).
- A train's position on the strip is a floating-point index in `[0, 8]`. Integer values sit on a station pip; half-integer values sit mid-way between stations.

### Estimating train position from `timeToStation`

TfL's Arrivals response for Weaver-line (National Rail) services returns `currentLocation` as an empty string — that field is only populated for Tube services. Verified empirically against the live endpoint on 2026-04-17: 0/15 arrivals had a non-empty value. Any design that depends on `currentLocation` is dead-on-arrival.

Instead, we **estimate** position by working backwards from `timeToStation` using a table of approximate inter-station travel times. A southbound train arriving at WC in 6 minutes is probably ~6 minutes of travel north of WC — which, given the table, places it somewhere between Highams Park and Chingford. This isn't GPS-accurate but it's believable to a toddler and requires no new API calls.

**Travel-time table (seconds, direction-neutral):**

| From | To | Seconds |
|---|---|---|
| Liverpool Street (0) | Bethnal Green (1) | 120 |
| Bethnal Green (1) | Hackney Downs (2) | 180 |
| Hackney Downs (2) | Clapton (3) | 120 |
| Clapton (3) | St James Street (4) | 180 |
| St James Street (4) | Walthamstow Central (5) | 120 |
| Walthamstow Central (5) | Wood Street (6) | 120 |
| Wood Street (6) | Highams Park (7) | 120 |
| Highams Park (7) | Chingford (8) | 180 |

Total Liverpool Street → Chingford ≈ 19 minutes (matches the published timetable). These are pure travel-time segments; we deliberately ignore dwell time at intermediate stations (~30s each) because (a) the imprecision is hidden by the glide animation and (b) dwell counts aren't in the API anyway.

**Algorithm (direction-aware):**

```
estimatePosition(timeToStationSeconds, direction) → number | null
  if timeToStationSeconds < 0 OR timeToStationSeconds > MAX_REASONABLE (say 30 min)
    return null  // don't extrapolate beyond our table

  segments = (direction === 'south')
    ? segmentsNorthOfWC      // WC↔Wds, Wds↔Hig, Hig↔Chg
    : segmentsSouthOfWC      // WC↔StJ, StJ↔Clp, Clp↔Hck, Hck↔Bth, Bth↔Liv

  accumulated = 0
  for each (nearIndex, farIndex, seconds) in segments:
    if timeToStationSeconds <= accumulated + seconds:
      progress = (timeToStationSeconds - accumulated) / seconds  // 0..1
      return nearIndex + progress * (farIndex - nearIndex)
    accumulated += seconds

  // Train is further than our furthest modelled station — pin to terminus
  // For a southbound train (coming from the north): far end is Chingford (index 8)
  // For a northbound train (coming from the south): far end is Liverpool Street (index 0)
  return (direction === 'south') ? 8 : 0
```

Concretely: a southbound train with `timeToStation = 300s` (5 min):
- Check WC↔Wds (120s): 300 > 120, skip. accumulated = 120.
- Check Wds↔Hig (120s): 300 > 240, skip. accumulated = 240.
- Check Hig↔Chg (180s): 300 ≤ 420. progress = (300-240)/180 = 0.33 → position = 7 + 0.33*(8-7) = **7.33**.

That places the train one-third of the way from Highams Park to Chingford. Reasonable.

## Architecture

### New modules

- `src/stops.ts` — pure module exporting the canonical ordered list of `{fullName, abbrev, index}` objects, plus the travel-time segments table, plus lookup helpers.
- `src/trainPosition.ts` — pure function `estimatePosition(timeToStationSeconds: number, direction: Direction): number | null`. Returns a floating-point index in `[0, 8]` or `null` when the prediction is outside our modelled range (negative, or > 30 min).
- `src/strip.ts` — DOM builder exporting `renderStrip(root: HTMLElement, model: StripModel): void` where `StripModel = { northPos: number | null; southPos: number | null; celebrate: { direction: Direction } | null }`. Updates existing DOM in place so CSS transitions work; does NOT use `innerHTML = ''`.

### Existing module changes

- `src/render.ts` — `ViewModel` gains optional `northPos`, `southPos`, `celebrate` fields. `render()` calls `renderStrip()` into a persistent `<section class="strip">` element between the direction rows and the footer.
- `src/main.ts` — `tick()` now runs `estimatePosition()` against the two tracked arrivals' live `timeToStation` values and stuffs the results into view-model state. `rerender()` includes them. Between polls, `rerender()` also re-runs `estimatePosition()` against a locally-decremented `timeToStation` so the train appears to glide smoothly even when the network data is stale.
- A `celebrate` flag is set for one second whenever a tracked direction's countdown `kind` (from `formatCountdown()`) transitions from not-`'now'` to `'now'`. Detect the edge by remembering the previous kind across renders.
- `src/bridge.ts` — `BridgeEvent` already carries the full `Arrival`, so `timeToStation` is already available. No type changes needed.

### Data flow

```
tick() (every 20s, when visible)
  └─ fetchArrivals → pickNextPerDirection → {north?, south?} BridgeEvents
      └─ snapshot each event's timeToStation + timestamp-of-fetch
          └─ rerender()

rerender() (every 1s)
  └─ for each tracked direction:
       currentTTS = snapshotted_tts - (nowMs - fetchedAtMs) / 1000
       pos = estimatePosition(currentTTS, direction)
  └─ detect 'now' edge → set celebrate for 1s
  └─ build ViewModel including northPos, southPos, celebrate
      └─ render() → renderStrip() updates train x-positions via CSS custom property
```

This means the train glides *continuously* between polls, not just in jumps. Feels more alive.

The **renderer must not rebuild** the strip each second. On first render, `renderStrip()` creates the static markup (9 station pips, the East Ave bridge landmark, and 2 train SVGs) and appends it. On subsequent renders, it only updates the two trains' CSS custom properties (`--pos` as a number 0-8), visibility, and the bridge's `celebrate` class. This preserves CSS transitions so the trains glide smoothly rather than jump.

## Visuals

### Stop pips

Small outlined circles on a thin horizontal line, one per station. Station abbreviations sit below the pips in `var(--dim)`, small. Walthamstow Central is the same size and weight as the other stations — it's just a stop on the line; the bridge carries the emotional weight, not WC.

### East Avenue bridge landmark

A small SVG arch-bridge shape sitting directly on the line visually centred between the WC and Wds pips (CSS-positioned at the 5.5 mark using the same formula as trains: `left: calc((100% / 8) * 5.5)`). Filled in `var(--accent)` cyan so it pops against the dim station pips. Caption "East Av" directly below in accent colour. Slightly larger than a station pip so the eye lands on it first. This is where the user's attention should go — it's where the drama happens.

### Train cartoon (SVG)

Simple shape, one per direction:
- Rectangular body with rounded ends (cyan `var(--accent)`)
- Small chimney on top
- Two visible wheels (dark, contrasting)
- One window with a smiley face (dots + curve)
- Roughly 32×20 logical px, scales responsively

Northbound version is the same SVG mirrored via CSS `transform: scaleX(-1)` — we only author one.

### Animations

- **Glide:** trains transition `left` (or `transform: translateX`) on a 1.5s ease when their position changes. Driven entirely by CSS — JS just updates the `--pos` custom property.
- **Smoke:** three tiny circles above the chimney, each with a CSS `@keyframes` animation offsetting by 0 / 0.6 / 1.2s, rising and fading out over 2s on loop. The whole group `animation-play-state` pauses when the tab is hidden (already handled by browser defaults for most engines, but we add `prefers-reduced-motion: reduce` media query to disable animation for users who prefer it).
- **Bridge jiggle:** a one-second keyframe wobble (rotate ±3°) applied when `celebrate` is set; the CSS animation starts and ends automatically via class toggle.

### Layout

The strip is a flex container, width `100%`, centred:

```
┌────────────────────────────────────────────────────────────┐
│ ─── ● ─── ● ─── ● ─── ● ─── ● ─── ● ─🌉─ ● ─── ● ─── ● ─── │
│     Liv   Bth   Hck   Clp   StJ   WC     Wds   Hig   Chg   │
│                                    East Av                 │
│                              ▲                   ▲         │
│                              🚂 (N, pos ≈ 4.2)   🚂 (S, pos ≈ 7.3) │
└────────────────────────────────────────────────────────────┘
           ↑ trains and bridge positioned absolute, trains have CSS transitions
```

Trains sit in an absolutely-positioned layer above the line. `left: calc(var(--pos) * (100% / 8))` positions index 0 at the left edge and index 8 at the right edge.

On narrow screens (< 360px), the abbreviations remain readable but the pips shrink. No horizontal scroll.

## Edge cases

| Case | Behaviour |
|---|---|
| Direction has no imminent arrival (sleeping state) | Corresponding train SVG has `visibility: hidden`; no smoke |
| `estimatePosition()` returns `null` (timeToStation < 0 or > 30 min) | Same as above — hide train rather than guess |
| Tracked train is at Walthamstow Central platform (`timeToStation` ≈ 0) | Train sits at WC pip (index 5); if the direction's countdown is "NOW" the bridge jiggles |
| Tracked train switches vehicle between polls (TfL reassigns the predicted vehicle) | Position updates to the new vehicle's location with the normal glide animation. No special handling. |
| `prefers-reduced-motion: reduce` | All animations (glide, smoke, jiggle) disabled. Trains jump to new positions. |
| Tab hidden | Existing poller pauses fetching; on return to visible, next tick updates positions with animation. Intermediate smoke animation paused by CSS when tab hidden via `page-visibility` CSS (no JS change needed). |

## Testing

### Unit (Vitest)

- `tests/trainPosition.test.ts` — `estimatePosition(timeToStationSeconds, direction)`:
  - `timeToStation = 0` → position = 5 (WC) regardless of direction
  - Southbound with `tts = 120` → position = 6 (Wood Street — exactly one segment north)
  - Southbound with `tts = 180` → position = 6.5 (midway between Wds and Hig)
  - Southbound with `tts = 300` → position ≈ 7.33 (one-third into Hig↔Chg segment)
  - Southbound with `tts = 420` → position = 8 (Chingford, end of modelled range)
  - Southbound with `tts = 600` → position = 8 (clamped to terminus)
  - Northbound with `tts = 120` → position = 4 (St James Street — one segment south of WC)
  - Northbound with `tts = 300` → position = 3 (Clapton — exactly at station)
  - Northbound with `tts = 510` → position = 1.5 (halfway between Bethnal Green and Hackney Downs)
  - Northbound with `tts = 680` → position ≈ 0.33 (two-thirds of the way from Liverpool Street toward Bethnal Green)
  - Northbound with `tts = 1000` → position = 0 (clamped to Liverpool Street — beyond modelled segments but within 30 min)
  - `tts < 0` → `null`
  - `tts > 30 * 60` → `null`

### Integration (manual)

- Open live site, confirm strip renders with correct station order.
- With a live train between stations, confirm it sits at half-integer position.
- Force a poll update and confirm the train glides rather than teleports.
- Toggle `prefers-reduced-motion: reduce` in DevTools and confirm animations disappear.

### Regression

All 30 existing tests must continue to pass. `npm run build` and `dist/` size must not balloon (target: < 20KB gzipped after strip additions).

## Deployment

No infrastructure changes. Changes are frontend-only; push to `main`, Netlify auto-deploys.

## Open questions for implementation

1. The travel-time table is eyeballed from published timetables; actual real-time running varies. The train on the strip will drift a bit from its true position. Acceptable for toddler-glance quality, but worth tuning if it feels obviously wrong on a first walk.
2. If TfL adds or renames Chingford-branch stops in the future, the `stops.ts` list becomes wrong. Acceptable — this is a personal project; we'll fix it if it happens.
3. If `currentLocation` starts being populated by TfL for Weaver services, the design should switch to using it (it's ground truth, not an estimate). `estimatePosition()` becomes the fallback rather than the primary source. Out of scope for this iteration.
