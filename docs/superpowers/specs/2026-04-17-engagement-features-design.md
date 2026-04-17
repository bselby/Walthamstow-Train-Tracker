# Engagement features — Design

**Date:** 2026-04-17
**Status:** Awaiting user review
**Builds on:** [2026-04-17-walthamstow-train-tracker-design.md](./2026-04-17-walthamstow-train-tracker-design.md) and [2026-04-17-weaver-strip-design.md](./2026-04-17-weaver-strip-design.md)

## Purpose

Layer four complementary mini-features on top of the existing Walthamstow Train Tracker PWA:

1. **Walking time to bridge** — practical, helps Ben plan whether he'll make the next train.
2. **Tap-to-toot** — delight: tap a train, hear a gentle synth honk.
3. **Seasonal train overlays** — year-round calendar of small SVG dressings.
4. **Next-3-trains ticker** — small live row below each strip showing upcoming trains so the app becomes "planning my next 10 minutes" rather than just "next train."

All four are frontend-only (no new network calls except the browser's built-in Geolocation API for feature #1). No tests will be removed; net bundle cost ≈ 4–5 KB gzipped.

## Scope

### In scope

- A header row under "Weaver Line" that optionally shows walking-time + distance to the East Avenue bridge using `navigator.geolocation`.
- A tap handler on each train SVG that triggers a Web Audio API synth honk (two-oscillator major fourth, ~350ms) with a brief visual wobble.
- An 11-theme year-round calendar that dresses the trains with context-appropriate SVG overlays.
- A small ticker row below each direction's strip showing the minute-counts of the next 3 upcoming trains (i.e. trains #2, #3, #4 in the queue; the hero is #1).
- All new animations respect `prefers-reduced-motion`.
- All persistent preferences (walking-time enabled/disabled, custom bridge pin if ever added) go in `localStorage`.

### Out of scope

- "Will I make it?" logic that compares walking-time to countdown.
- Real audio file for the toot (we synth it).
- Exact date calculations for Easter / World Book Day (broad date ranges used instead).
- Bonfire-Night firework animation (v1 is a static SVG; animation is a later polish).
- Theme stacking — only one theme active at a time; date-range priority resolves overlaps.
- User-overrideable themes or locations (nothing configurable in v1).

---

## Feature 1: Walking time to bridge

### Placement

A single row sits between the "Weaver Line" header and the first direction row:

```
Weaver Line
📍 4 MIN WALK · 380 M
→ Chingford         6 MIN
…
```

Small type — `Big Shoulders Text 500`, `0.875rem`, uppercase, tracking `0.08em`. The 📍 is a compact SVG pin (not emoji) in `--overground`. Distance and time in `--ink` navy.

### Opt-in flow

First load: row reads `📍 ENABLE WALKING TIME` (same small type, tappable).

On tap:
1. Call `navigator.geolocation.watchPosition(...)`.
2. Browser shows its native permission prompt.
3. On success: store `walkingTimeEnabled: true` in `localStorage`, begin updating position. On every subsequent load, auto-enable without prompting.
4. On permission denial: flash `📍 LOCATION UNAVAILABLE` for 4 seconds, then revert the row to `📍 ENABLE WALKING TIME`. No retry loop — user taps again when they want to.
5. If the browser doesn't support `geolocation` at all: hide the row entirely (no element rendered).

### Bridge coordinates

Hardcoded in `src/constants.ts`:

```ts
export const EAST_AVE_BRIDGE = {
  lat: 51.58775,
  lng: -0.01645,
} as const;
```

Noted as an initial best-guess pin; if Ben finds it's off by more than ~20 m in practice, we can update the constant (or add a "tap-to-set" flow as a later feature — out of scope here).

### Distance and time math

Pure functions in `src/walkingTime.ts`:

```ts
// Great-circle distance in metres.
export function haversineMetres(a: LatLng, b: LatLng): number { … }

// Walking speed fixed at 1.4 m/s (≈ 5 km/h, a brisk but sustainable pace).
export const WALKING_SPEED_MPS = 1.4;

// Returns a pair: { metres, seconds } from the user's current position to the bridge.
export function walkingEstimate(userPos: LatLng, bridge: LatLng): { metres: number; seconds: number };

// Formats as "4 MIN WALK · 380 M" or the special "AT THE BRIDGE" state when < 50 m.
export function formatWalkingLabel(estimate: { metres: number; seconds: number }): string;
```

### Display rules

| Metres to bridge | Shown |
|---|---|
| < 50 | `📍 AT THE BRIDGE` |
| 50 – 999 | `📍 <sec→ceil-min> MIN WALK · <round to nearest 10m> M` |
| ≥ 1000 | `📍 <ceil-min> MIN WALK · <round to one decimal km> KM` |

- Time rounds up (`Math.ceil(seconds / 60)`) — better to overestimate than tell the user they have time when they don't.
- Distance rounded to nearest 10 m under 1 km; to 0.1 km above.

### Polling strategy

- `navigator.geolocation.watchPosition` with `enableHighAccuracy: false`, `maximumAge: 20_000`, `timeout: 15_000`. We don't need sub-10m precision for a walking estimate.
- Paused when `document.visibilityState !== 'visible'` — clear the watch, restart on visibility return. Matches the existing TfL-poller pattern.
- No special battery mode when "at the bridge" — a walk is rarely more than 30 minutes, battery cost is negligible. Simpler = fewer bugs.

### Edge cases

| Case | Behaviour |
|---|---|
| Permission prompt dismissed (not granted, not denied) | Treat as not-yet-enabled; keep the opt-in label |
| Location read fails (GPS fix timeout) | Keep last-known display; if no prior reading, show `📍 LOCATING…` |
| User moves so fast position never settles | Normal — the updating display covers it |
| User is indoors with no GPS | Same as "fix timeout" — keep `📍 LOCATING…` |
| localStorage disabled / private browsing | Feature still works for the session but re-asks permission next load. Not a blocker. |

---

## Feature 2: Tap-to-toot

### Approach

No audio file. We synthesise a gentle two-tone honk at runtime via the **Web Audio API**. Zero bytes added to the bundle.

### Sound design

- Two `OscillatorNode`s playing simultaneously: **220 Hz** and **293 Hz** (a perfect fourth — classic two-tone honk, similar to a real EMU horn).
- Wave type: `triangle` (warmer, less harsh than sine or square).
- Envelope (via `GainNode`): 10 ms attack → hold at peak 150 ms → 200 ms exponential release. Total ~360 ms.
- Master volume capped at `0.25` so it's polite in a quiet environment.
- Phones on silent mode will mute the output automatically; no app-side mute needed.

### Module

`src/toot.ts`:

```ts
let ctx: AudioContext | null = null;

export function toot(): void {
  // Create AudioContext lazily on first user gesture — browsers require it.
  if (!ctx) {
    const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtor) return; // older browser — silently no-op
    ctx = new AudioCtor();
  }
  // Resume if suspended (Safari sometimes suspends after hidden)
  if (ctx.state === 'suspended') ctx.resume();

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.01);   // 10ms attack
  gain.gain.setValueAtTime(0.25, now + 0.16);             // hold 150ms
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36); // 200ms release
  gain.connect(ctx.destination);

  for (const freq of [220, 293]) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.36);
  }
}
```

### Interaction

- Each `.strip-train` gets a click/tap listener wired in `buildSkeleton()` in `src/strip.ts`.
- Handler calls `toot()` and adds a short `.tooting` class removed after 250ms via CSS animation auto-cleanup (using `animationend` event or `setTimeout`).
- Visual feedback: CSS keyframe briefly scales the train 1 → 1.1 → 1 on a 250ms ease-out-quart. Separate from the glide transition on `left`.

### No rate limiting

Toddlers will spam the train. That's fine — the Web Audio API handles overlapping voices, and the sound is short enough that rapid taps just produce cheerful chorus. If this becomes annoying in practice, we can add a debounce in a later pass.

---

## Feature 3: Seasonal train overlays

### The calendar

| Date range (approx) | Theme | Train overlay |
|---|---|---|
| Jan 1 – Feb 28 | **Winter ski** | Knitted beanie on the chimney + short skis tucked beneath the bogies |
| Mar 1 – Mar 10 | **World Book Day** | Small stack of books balanced on top of the train |
| Mar 11 – Apr 15 | **Easter** | Bunny ears rising from the cab roof |
| Apr 16 – Jun 20 | **Spring** | Cherry-blossom sprig on the front cab |
| Jun 21 – Sep 21 | **Summer** | Sunglasses over the cab window |
| Sep 22 – Oct 23 | **Autumn** | Orange leaf resting on the roof |
| Oct 24 – Oct 31 | **Halloween** | Tiny carved pumpkin riding on top |
| Nov 1 – Nov 10 | **Bonfire Night** | Static firework burst above the train (spiky sparks) |
| Nov 11 – Nov 30 | **Late autumn** | Same leaf overlay as Sep-Oct |
| Dec 1 – Dec 30 | **Christmas** | Red Santa hat with white bobble on the chimney |
| Dec 31 | **New Year** | Party hat with sparkle dots |

### Theme selection

`src/season.ts`:

```ts
export type Theme =
  | 'winter-ski'
  | 'world-book-day'
  | 'easter'
  | 'spring'
  | 'summer'
  | 'autumn'
  | 'halloween'
  | 'bonfire'
  | 'christmas'
  | 'new-year'
  | null;

// Returns the theme active on the given date. Order matters — specific windows
// (Halloween, Bonfire, New Year, World Book Day) are checked before broader
// seasons so they take priority inside overlapping ranges.
export function currentTheme(date: Date): Theme { … }
```

Pure, date-only (no timezone subtleties — uses local date for the user's device, which is fine for London-based usage).

### Overlay rendering

Each theme has a small SVG `<g>` defined in `src/strip.ts` as a constant. When a theme is active, the strip renderer appends the theme's `<g>` inside the train SVG at build time.

Overlays are positioned in the train SVG's coordinate space (viewBox 52×22). Each overlay anchors relative to the chimney region (top-centre of the train body). The southbound mirror (`scaleX(-1)`) is applied to the outer train SVG — overlays inside will mirror along with it, which is aesthetically fine (a mirrored Santa hat still looks like a Santa hat).

For asymmetric overlays (bunny ears, sunglasses) we accept the mirror; if any specific theme reads weirdly flipped in practice, we can add a compensating inner `scaleX(-1)` on just that overlay for the southbound strip.

### Trigger timing

Theme is re-evaluated **every time `buildSkeleton` runs** — which is once per strip on first render. The theme does not change while the app is open (rare edge case: user is watching trains at midnight on Dec 31 → Jan 1; the theme change happens on next page reload, not live).

### Accessibility

Each overlay has `aria-hidden="true"` — it's decoration, not information. Screen readers hear only the station-position aria-label already on the strip.

---

## Feature 4: Next-3-trains ticker

### Placement

One small row below each direction's strip:

```
→ Chingford            6 MIN
[strip with train + bridge]
THEN  14 · 28 · 42 MIN

← Walthamstow Central  7 MIN
[strip with train + bridge]
THEN  19 · 33 · 47 MIN
```

### Styling

- `Big Shoulders Text 700`, `0.875rem`, uppercase, tracking `0.08em`.
- Centred horizontally within the row.
- `THEN` in `--overground` orange (800 weight).
- Minute values in `--ink` navy with `font-variant-numeric: tabular-nums`.
- Bullets `·` between values in `--overground`.
- `MIN` suffix only on the last value, to avoid `MIN · MIN · MIN` noise.

### Data source

Extend `src/bridge.ts` with a new function:

```ts
export function pickNextNPerDirection(
  arrivals: Arrival[],
  n: number
): { north: BridgeEvent[]; south: BridgeEvent[] };
```

Same filtering / sorting rules as the current `pickNextPerDirection`, but returns up to `n` entries per direction.

Existing `pickNextPerDirection` stays as a thin wrapper:

```ts
export function pickNextPerDirection(arrivals: Arrival[]): { north?: BridgeEvent; south?: BridgeEvent } {
  const nexts = pickNextNPerDirection(arrivals, 1);
  return { north: nexts.north[0], south: nexts.south[0] };
}
```

No callers need to change.

### State in main.ts

`DirectionSnapshot` becomes a list (renamed `DirectionSnapshots`, plural):

```ts
interface DirectionSnapshots {
  events: BridgeEvent[];       // hero is [0], ticker entries are [1..3]
  snapshottedAtMs: number;     // shared fetch timestamp for all entries
}

let snapshots: Partial<Record<Direction, DirectionSnapshots>> = {};
```

Per tick we fetch, call `pickNextNPerDirection(arrivals, 4)`, store the full array under one shared timestamp. The `liveEvent(snapshot, now)` and `livePosition(snapshot, now)` helpers are rewritten to take `(snapshot: DirectionSnapshots, index: number, now: number)` so they can address any entry. The hero uses index 0; the ticker iterates 1..3.

The existing `previousKind` tracking for bridge-celebrate edge detection continues to watch only the hero (index 0) — ticker entries don't participate in celebrate events.

### Live ticking

Every 1-second rerender:

- For each direction: decrement each snapshot event's `bridgeTimeSeconds` by elapsed seconds (same pattern as the hero countdown already uses).
- The hero is `events[0]`. Ticker entries are `events[1..3]`.
- When `events[0].bridgeTimeSeconds` drops below the filter threshold (−30 for south, −120 for north per `pickNextPerDirection` semantics) we shift the array left in memory — but in practice this happens only on a fresh poll, so the array just naturally shrinks over time and repopulates on the next 20-second fetch.

### Edge cases

| Case | Behaviour |
|---|---|
| Fewer than 4 trains in scope (late evening) | Render only the entries that exist — e.g. `THEN 14 · 28 MIN` |
| Only the hero (no further trains) | Hide the ticker row entirely |
| Direction sleeping (no hero) | Hide ticker row (same condition as hero's sleeping state) |
| An entry's live bridge-time ticks under 0 between polls | Drop that entry from the ticker view-model (filter `bridgeTimeSeconds >= 0` at the view-model layer). Ticker shrinks; next poll repopulates. |

### View-model extension

`ViewModel` in `src/render.ts` gains:

```ts
northTicker: BridgeEvent[]; // 0-3 entries
southTicker: BridgeEvent[];
```

`main.ts` populates these from `events[1..3]` of each snapshot after applying the live decrement.

---

## Architecture summary

### New modules

- `src/walkingTime.ts` — haversine + estimate formatter (pure functions)
- `src/toot.ts` — Web Audio API synth honk (impure — holds a lazy `AudioContext`)
- `src/season.ts` — date → theme (pure)
- `src/geolocation.ts` — thin wrapper over `navigator.geolocation` that integrates with our visibility-aware polling pattern; emits `(userPos, error, status)` to subscribers

### Modified modules

- `src/bridge.ts` — add `pickNextNPerDirection`, keep `pickNextPerDirection` as a wrapper
- `src/main.ts` — store per-direction snapshot arrays; wire geolocation into the view model; wire season prop
- `src/render.ts` — add header walking-time row; render ticker under each strip; extend `ViewModel`
- `src/strip.ts` — conditionally append theme overlays in each train SVG; attach tap handlers for `toot()`; add `.tooting` class management
- `src/styles.css` — walking-time row styles; ticker styles; `.tooting` wobble keyframe; overlay positioning
- `src/constants.ts` — add `EAST_AVE_BRIDGE` lat/lng and `WALKING_SPEED_MPS`

### Testing

**Unit tests (additions):**

- `tests/walkingTime.test.ts` — haversine known-good values (London pairs with published distances); edge cases at 0 m, 50 m boundary, 999 m / 1000 m boundary; `formatWalkingLabel` cases for "AT THE BRIDGE", metres, kilometres
- `tests/season.test.ts` — boundary dates between themes; New Year (Dec 31 → Jan 1); exactly Halloween (Oct 31) vs Bonfire (Nov 1); leap-year safety on Feb 28 / 29
- `tests/bridge.test.ts` — extend with `pickNextNPerDirection` cases: n=4 with 5 arrivals, n=4 with 1 arrival, empty input, mixed directions

No unit tests for `toot.ts` (Web Audio API is not meaningfully testable in jsdom — smoke test only). No unit tests for `geolocation.ts` (ditto the browser API).

All 56 existing tests must continue to pass.

**Manual verification:**

- Walking time enable/disable cycle, permission denial, "AT THE BRIDGE" trigger by walking to the bridge
- Tap a train on device → honk
- Seasonal theme: manually edit system clock to each boundary date to eyeball the overlays
- Ticker live-tick decrement; handover when hero arrives

## Deployment

Frontend-only. Push to `main`, Netlify auto-deploys. No infra changes.

## Open questions for implementation

1. The Jun 21 – Sep 21 "summer" range is astronomically correct (solstice to equinox) but means September is autumn by Sep 22. If Ben wants a warmer September to feel more "late summer," we shift the boundary — small tweak, not spec-critical.
2. The bridge coords are eyeballed. If the walking-time feature ships and the "AT THE BRIDGE" threshold fires at the wrong place, we update the constant. Acceptable.
3. If audio synthesis doesn't fire on some exotic browser, the feature silently no-ops. Visual wobble still plays. No user-facing error — this is delight, not critical path.
