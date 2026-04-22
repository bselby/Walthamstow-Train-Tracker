# Multiple E17 Viewpoints — Design

**Date:** 2026-04-22
**Status:** Awaiting user review
**Builds on:** the live app state as of commit `4da467a` (post Cloudflare analytics).

## Purpose

Extend the app from a single hard-coded East Avenue bridge viewpoint to a small curated set of E17 train-spotting viewpoints, each with its own line, station, stops, and bridge-time offsets. Users pick a favourite that opens on every visit; a switcher lets them temporarily view a different spot. The app stays single-purpose — watching trains with a toddler — but works from anywhere in E17.

Two viewpoints in v1. Extensible to 3–5 via a single-array append. The app's brand and domain (`eastavetrains.co.uk`) do not change; East Ave bridge stays the star spot.

---

## Scope

**In scope:**
- Data-driven viewpoint config (replaces hard-coded `WALTHAMSTOW_CENTRAL_STOPPOINT_ID`, `EAST_AVE_BRIDGE`, `+90s`/`-20s` offsets)
- Tappable switcher header with inline expand-down sheet
- Star-to-favourite per viewpoint, persisted in `localStorage`
- Per-line theming on the trains + header (burgundy Weaver, green Suffragette)
- Walking-time re-targets the active viewpoint's coords
- Second viewpoint on the Suffragette line at Walthamstow Queens Road station
- Viewpoint-aware `<title>` element

**Out of scope (explicitly):**
- User-submitted viewpoints / remote viewpoint config — hand-curated only
- Rebranding away from "East Ave Trains" or changing the domain
- Changing the PWA manifest `name` (already installed on homescreens; don't trigger reinstall)
- Analytics events for switcher interactions (Cloudflare Web Analytics stays purely pageview-based)

---

## Architecture overview

Today, the app has a single hard-coded viewpoint. All the bits that define that viewpoint are scattered:

- `WALTHAMSTOW_CENTRAL_STOPPOINT_ID` in `constants.ts`
- `EAST_AVE_BRIDGE` lat/lng in `constants.ts`
- `BRIDGE_OFFSET_NORTH_SECONDS = +90`, `BRIDGE_OFFSET_SOUTH_SECONDS = -20` in `constants.ts`
- The 9 Chingford-branch stops in `stops.ts`
- The `classifyDirection` / destination parsing in `direction.ts`
- The `'Weaver Line'` header in `index.html`

The central change: introduce `src/viewpoints.ts` exporting a readonly array of `Viewpoint` records. `main.ts` holds an `activeViewpointId` in state; everywhere that currently reads a hard-coded constant now reads the corresponding field on the active viewpoint.

State lives in `main.ts`, same pattern as `walkingEnabled`:
- `activeViewpointId: string` — currently-selected viewpoint (not persisted across reloads)
- `favouriteViewpointId: string` — persisted to `localStorage`, read on boot

A switcher component (new) lives at the top of the page in place of the static `<header class="page-header">`. Tapping it expands a sheet inline (not a modal overlay).

No other architectural shifts — rendering is still vanilla DOM, polling still runs at the same cadence, service worker still precaches the same bundle.

---

## Data model

```ts
// src/viewpoints.ts

export type LineId = 'weaver' | 'suffragette';

export interface ViewpointDirection {
  /** Short label shown above the countdown — "→ Chingford", "← Walthamstow Central". */
  label: string;
  /** TfL direction for classification. 'outbound' or 'inbound' per TfL convention. */
  tflDirection: 'outbound' | 'inbound';
  /** Plain-English terminus for aria-labels + the viewpoint-agnostic copy. */
  terminusName: string;
  /** Seconds to add to the arrival's timeToStation before rendering. +ve means the
   *  train passes the viewpoint AFTER arriving at the station; -ve means BEFORE.
   *  0 for on-platform viewpoints like Queens Road. */
  offsetSeconds: number;
}

export interface Viewpoint {
  /** Stable slug — used as localStorage key + in analytics-free URL fragments. */
  id: string;
  /** Short display label — 'East Ave bridge', 'Queens Road'. */
  name: string;
  /** Longer copy for screen readers + the sheet subtitle. */
  description: string;
  /** TfL line id — used to filter arrivals from the StopPoint API response. */
  lineId: LineId;
  /** Display line name — 'Weaver', 'Suffragette'. */
  lineName: string;
  /** CSS colour (OKLCH string) for the header + train livery. */
  lineColor: string;
  /** TfL NaPTAN StopPoint — what the arrivals API is polled against. */
  stopPointId: string;
  /** Physical location of the viewpoint — used by the walking-time feature. */
  coords: { lat: number; lng: number };
  /** Ordered list of stops on the relevant branch (terminus A first, terminus B last).
   *  Rendered as the horizontal strip under the countdowns. */
  stops: readonly Stop[];
  /** Travel-time segments between adjacent stops, in seconds. Length = stops.length - 1.
   *  Used by trainPosition.ts to interpolate the cartoon train's position along the strip. */
  segmentSeconds: readonly number[];
  /** Two-direction config. Keys are the Direction enum from `direction.ts`. */
  directions: {
    north: ViewpointDirection;  // geographically north-ish — towards Chingford / Gospel Oak
    south: ViewpointDirection;  // geographically south-ish — towards Liverpool St / Barking
  };
}

export const VIEWPOINTS: readonly Viewpoint[] = [/* see v1 list below */];
```

### v1 viewpoint list

**1. `east-ave` — East Avenue bridge (Weaver line)**

| Field | Value |
|---|---|
| name | East Ave bridge |
| description | The road bridge over the Weaver line on East Avenue, Walthamstow |
| lineId | `weaver` |
| lineColor | TfL Weaver burgundy — `oklch(35% 0.12 10)` (final hex verified against TfL palette during implementation) |
| stopPointId | `910GWLTWCEN` (Walthamstow Central, already used) |
| coords | `{ lat: 51.583486, lng: -0.014564 }` — existing `EAST_AVE_BRIDGE` constant |
| stops | Existing 9 Chingford-branch stops from `stops.ts` |
| segmentSeconds | Existing `TRAVEL_SEGMENTS` from `stops.ts` |
| directions.north | `{ label: '→ Chingford', tflDirection: 'outbound', terminusName: 'Chingford', offsetSeconds: 90 }` |
| directions.south | `{ label: '← Walthamstow Central', tflDirection: 'inbound', terminusName: 'Liverpool Street', offsetSeconds: -20 }` |

**2. `queens-road` — Queens Road station (Suffragette line)**

| Field | Value |
|---|---|
| name | Queens Road |
| description | Walthamstow Queens Road station, platform view |
| lineId | `suffragette` |
| lineColor | TfL Suffragette green — `oklch(55% 0.15 155)` (final hex verified against TfL palette) |
| stopPointId | Walthamstow Queens Road NaPTAN — likely `910GWLTHQRD` (**verify during implementation** against `/StopPoint/Search` or TfL dev portal) |
| coords | `{ lat: 51.581539, lng: -0.023774 }` — from the Google Maps link Ben provided |
| stops | 13 Gospel Oak ↔ Barking Riverside stops (list below) |
| segmentSeconds | Derived from TfL journey planner during implementation (approximate is fine — this is for cartoon-train animation) |
| directions.north | `{ label: '→ Gospel Oak', tflDirection: 'inbound', terminusName: 'Gospel Oak', offsetSeconds: 0 }` |
| directions.south | `{ label: '← Barking Riverside', tflDirection: 'outbound', terminusName: 'Barking Riverside', offsetSeconds: 0 }` |

Note: on the Suffragette line, "outbound" from Gospel Oak is Barking-bound (south/east); "inbound" is Gospel Oak-bound. The `tflDirection` field maps each viewpoint-local direction to TfL's convention.

**Suffragette stops (Gospel Oak → Barking Riverside):**

1. GOS — Gospel Oak
2. UHO — Upper Holloway
3. CRH — Crouch Hill
4. HGL — Harringay Green Lanes
5. STH — South Tottenham
6. BHR — Blackhorse Road
7. **WQR — Walthamstow Queens Road** (this viewpoint)
8. LMR — Leyton Midland Road
9. LHR — Leytonstone High Road
10. WPK — Wanstead Park
11. WGP — Woodgrange Park
12. BKG — Barking
13. BRV — Barking Riverside

(Abbreviations to be reviewed once rendered — 13 on a 375px viewport is dense. Fallback plan documented in "Strip density" section.)

---

## Switcher UI

Replaces the static `<header class="page-header">Weaver Line</header>` with a tappable element that opens an inline sheet.

### Closed state

```
┌─────────────────────────────────────────┐
│       Weaver · East Ave bridge  ▾       │
└─────────────────────────────────────────┘
```

- Single line, centered
- Text colour: `var(--line-color)` (burgundy for Weaver, green for Suffragette)
- Chevron `▾` right of the text — signals "more here"
- Same typography as today's header (Big Shoulders Display)
- Press-feedback: scale to 0.97 on `:active`, 60ms transition (matches fact ticker)
- Hover: opacity 1 (from 0.95)
- Keyboard-focusable with `:focus-visible` outline in `var(--line-color)`, 2px + 3px offset

### Open state

Tapping the header expands a sheet inline (not a modal overlay). The sheet pushes the page content down; nothing is obscured.

```
┌─────────────────────────────────────────┐
│       Weaver · East Ave bridge  ▴       │  ← chevron rotates 180deg
├─────────────────────────────────────────┤
│                                         │
│  ●  East Ave bridge            ★        │  ← filled dot = selected
│     Weaver line                         │     filled star = favourite
│                                         │
│  ○  Queens Road                ☆        │  ← outline dot, outline star
│     Suffragette line                    │
│                                         │
└─────────────────────────────────────────┘
```

- Sheet is a `<div>` with `role="listbox"` (or equivalent — see accessibility below)
- Each row is a `<button role="option">` with the viewpoint's name + sub-line
- Left-side dot indicates the currently-active viewpoint
- Right-side star is a nested `<button>` — separate hit target — that toggles favourite
- Only one favourite can be filled at a time
- Line name (sub-line, smaller text) uses `var(--line-color)` for subtle identification
- Sheet animates with `grid-template-rows: 0fr → 1fr` + 220ms `cubic-bezier(0.25, 1, 0.5, 1)` — no height jank

### Interactions

| Input | Result |
|---|---|
| Tap the header row | Toggle sheet open / closed |
| Tap a viewpoint row | Switch to that viewpoint + close sheet (does NOT change favourite) |
| Tap a star | Toggle that viewpoint as favourite (does NOT switch). Star scale-bounces on activation. |
| Tap outside the sheet | Close without changing anything |
| Press Escape | Close sheet, return focus to the header button |
| Tab / Shift+Tab inside sheet | Focus cycles between rows and stars |

### Accessibility

- Header button: `aria-expanded="true|false"`, `aria-controls="viewpoint-sheet"`
- Sheet: `role="listbox"`, `aria-label="Choose a viewpoint"`
- Viewpoint rows: `role="option"`, `aria-selected` reflects active state
- Star buttons: `aria-label="Favourite: East Ave bridge"`, `aria-pressed` reflects favourite state
- Focus trap inside the sheet while open; returns focus to the header button on close
- `prefers-reduced-motion: reduce` — instant open/close, no grid-row transition

### Edge cases

- **First load, no favourite set** → default to the first viewpoint in `VIEWPOINTS` (East Ave). Write it to `localStorage` on first paint so the stored state stabilises.
- **Stored favourite points at a removed viewpoint** → fall back to the first viewpoint; rewrite storage with the new id.
- **Single viewpoint in the list** (hypothetical future regression) → render the header without chevron, without tap behaviour. Sheet code short-circuits.
- **Corrupt `localStorage` value** (e.g. string that isn't a valid id) → ignore, fall back to first viewpoint.

---

## Favouriting + persistence

Two `localStorage` keys, both accessed through the existing `safeLocalRead` / `safeLocalWrite` / `safeLocalRemove` wrappers (handles Safari private mode, storage full, etc.):

| Key | Type | Purpose | Default |
|---|---|---|---|
| `wtt_favourite_viewpoint` | string (viewpoint id) | The user's favourite. Loaded on boot; used as initial active viewpoint. | first entry in VIEWPOINTS |
| *(nothing else stored)* | | Current session viewpoint is **in-memory only** — no storage key for it. Closing the tab or refreshing returns to the favourite. | |

On boot:
1. Read `wtt_favourite_viewpoint` via `safeLocalRead`.
2. Validate that id exists in `VIEWPOINTS`; if not, fall back to `VIEWPOINTS[0].id`.
3. Set `activeViewpointId = favouriteViewpointId`.
4. Kick off the first poll against the active viewpoint's `stopPointId`.

On `setFavourite(id)`:
- Write `wtt_favourite_viewpoint = id` via `safeLocalWrite`.
- Update `favouriteViewpointId` state.
- Rerender so the star updates.
- Do NOT change the active viewpoint.

On `switchViewpoint(id)`:
- Set `activeViewpointId = id`.
- Do NOT update storage.
- Immediately replace `snapshots = {}` so the UI shows "Connecting to TfL…" while the next poll resolves.
- Trigger an immediate poll (don't wait for the 20s interval).
- Close the sheet.

---

## Per-line theming

A single CSS custom property drives the line-specific colour:

```css
:root { --line-color: oklch(35% 0.12 10); /* Weaver burgundy as default */ }
```

On viewpoint switch, `main.ts` sets `document.documentElement.style.setProperty('--line-color', viewpoint.lineColor)`.

Two places reference it:

1. **Switcher header text** — `.page-header { color: var(--line-color); }`
2. **Cartoon train on the strip** — the SVG currently has hard-coded `#EE7C0E` fill paths. Those switch to `currentColor`, and `.strip-train { color: var(--line-color); }` feeds it.

Everything else (direction arrows, NOW pulse, fact icon, confidence ring, walking-time pin, buttons, focus outlines) continues to use `var(--overground)` — the orange that's been the app's chrome colour since launch. Orange stays the "this is how the app speaks to you" accent; line colour is a secondary identifier.

### Seasonal theme overlays

The `strip.ts` seasonal system (santa hat, halloween ghost, etc.) renders overlay SVGs on top of the train. Those overlays use their own colours (red hat, black ghost, etc.) and are unaffected — they sit on top of whatever livery the train has underneath.

### CSS variable hierarchy

```
--overground            → orange. App chrome. Used everywhere EXCEPT header + train.
--line-color            → per-viewpoint. Used by .page-header + .strip-train.
--line-color-weaver     → burgundy. Source of truth for Weaver.
--line-color-suffragette→ green. Source of truth for Suffragette.
```

The `--line-color-*` constants live in `:root` in `styles.css`. The active `--line-color` is copied from the relevant constant on each switch (JavaScript does the copy so there's no layout-shift race).

---

## Strip density

The current strip renders 9 Chingford-branch stops evenly spaced across a phone viewport. With Suffragette's 13 stops, each stop gets ~69% of the horizontal real estate it currently has on a 375px screen — roughly 26px per stop instead of 38px. The cartoon train keeps its current size (~50×30px). Abbreviations (`WQR`, `BHR`, etc.) render in the existing typography.

**v1 approach:** render it as-is and see. The existing flex layout handles the denser packing mechanically. Abbreviations may overlap slightly on narrow phones — acceptable for v1.

**Fallback if density is a real problem on the live site:**
- Option 1: hide abbreviations on lines with >10 stops (keep just pips + cartoon train)
- Option 2: shorten to 2-letter abbreviations on long lines
- Option 3: only show ~7 stops around the active viewpoint (truncate with "…" at each end)

These are deferred to a follow-up iteration, not part of v1.

---

## Walking-time integration

The walking-time feature computes Haversine distance from the user's GPS coordinate to the bridge. Currently it's hard-coded against `EAST_AVE_BRIDGE`.

Change:
```ts
// Before
const est = walkingEstimate(position, EAST_AVE_BRIDGE);

// After
const est = walkingEstimate(position, activeViewpoint.coords);
```

When the user switches to Queens Road, the walking distance re-computes to Queens Road station. Opt-in, permission flow, storage, tab-visibility pause behaviour — all unchanged.

If GPS is enabled and the user is closer to a non-favourite viewpoint, we do NOT auto-suggest switching. Automatic behaviour is out of scope; the user explicitly chooses.

---

## Copy, title, meta

### Document title

```ts
// Before: static in index.html
<title>East Ave Trains — Live Weaver line tracker</title>

// After: updated on every viewpoint change in main.ts
document.title = `East Ave Trains — ${viewpoint.name}`;
// e.g. "East Ave Trains — East Ave bridge"
// e.g. "East Ave Trains — Queens Road"
```

### Meta tags (unchanged)

`canonical`, `og:*`, `twitter:*` all stay pointing at the brand. The app is "East Ave Trains" regardless of which viewpoint you happen to be on.

### PWA manifest

`vite.config.ts` `name: "Walthamstow Trains"` and `short_name: "Trains"` — do not change. Already installed on homescreens; renaming would trigger browsers to prompt re-install.

### About page

Add one sentence after the existing "About" paragraph:

> You can now watch trains from a couple of different spots around E17 — tap the line name at the top to switch between them.

### Privacy page

Add a line to the "What's stored on your device" list:

> A `wtt_favourite_viewpoint` flag remembering which viewpoint you've starred.

Bump the "Last updated" date.

### Terms page

No change.

---

## Tests

### New test files

**`tests/viewpoints.test.ts`**
- Every viewpoint has all required fields (id, name, lineId, lineColor, stopPointId, coords, stops, segmentSeconds, directions)
- All ids are unique
- `lineColor` parses as a valid CSS colour (regex or `CSS.supports`)
- `segmentSeconds.length === stops.length - 1`
- `coords.lat` in `[51.5, 51.7]` and `coords.lng` in `[-0.1, 0.1]` (E17 sanity range)
- `directions.north.offsetSeconds` and `.south.offsetSeconds` are finite numbers

**`tests/favourite.test.ts`**
- Reads favourite from `localStorage` on init
- Falls back to first viewpoint if no stored value
- Falls back to first viewpoint if stored value doesn't match any viewpoint id
- `setFavourite()` writes to `localStorage`
- `setFavourite()` does NOT change `activeViewpointId`
- Mock localStorage throws → no crash (matches existing `safeLocal*` behaviour)

**`tests/switcher.test.ts`** (render/integration — may live in existing `render.test.ts`)
- Header renders with active viewpoint's name
- Clicking header expands sheet
- Clicking viewpoint row invokes `onSwitchViewpoint` with the right id
- Clicking star invokes `onSetFavourite` with the right id
- Clicking star does NOT invoke `onSwitchViewpoint`
- Escape key closes sheet
- Clicking outside sheet closes it

### Updated existing tests

- `tests/bridge.test.ts` — factory currently hard-codes direction via destination name. Extend to accept a viewpoint config so the +90 / -20 offsets aren't implicit.
- `tests/direction.test.ts` — uses viewpoint-agnostic destination-name parsing already; should pass with minor factory updates.
- `tests/trainPosition.test.ts` — uses `stops.ts` directly. Generalise to read from a passed-in `stops` + `segmentSeconds` rather than the module-level constants.
- `tests/walkingTime.test.ts` — drop the `EAST_AVE_BRIDGE` reference, pass coords explicitly.

Expected count: ~140 tests after this round (from 124 currently).

---

## Files affected

### New

```
src/viewpoints.ts              # Viewpoint type + VIEWPOINTS array
src/switcher.ts                # renderSwitcher + sheet DOM + open/close state
tests/viewpoints.test.ts
tests/favourite.test.ts
tests/switcher.test.ts         # or extend render.test.ts
```

### Modified

```
src/main.ts                    # activeViewpointId state, favourite load/save,
                               # tick() uses active viewpoint's stopPointId,
                               # buildViewModel passes viewpoint-aware fields
src/render.ts                  # renders switcher at top instead of static header,
                               # threads viewpoint into direction rows + strips
src/strip.ts                   # accepts stops + segmentSeconds as args;
                               # train livery uses var(--line-color)
src/trainPosition.ts           # takes stops + segmentSeconds as args
                               # (rather than reading from stops.ts directly)
src/constants.ts               # remove EAST_AVE_BRIDGE, WALTHAMSTOW_CENTRAL_STOPPOINT_ID,
                               # BRIDGE_OFFSET_*_SECONDS (move to viewpoints.ts data)
                               # keep POLL_INTERVAL_MS, STALE_THRESHOLD_MS etc.
src/bridge.ts                  # computeBridgeTime takes offsetSeconds as an arg
                               # rather than branching by direction internally
src/direction.ts               # classify now takes tflDirection mapping from viewpoint
src/stops.ts                   # Chingford stops + segments stay, but are imported
                               # by viewpoints.ts (one indirection)
src/styles.css                 # --line-color custom property,
                               # .page-header becomes button-styled,
                               # sheet layout + open/close animation,
                               # star button + press feedback
src/facts.ts                   # no change
index.html                     # remove static header text ("Weaver Line")
                               # (switcher renders into #app)
public/about.html              # one-sentence addition
public/privacy.html            # one-line bullet addition + updated date
vite.config.ts                 # no change
```

Existing tests updated as listed above. No file is deleted; `constants.ts` is slimmed, not removed.

---

## Rollout

Single feature branch → PR to `main` → Netlify auto-deploy picks it up. No feature flag; the switcher is visible from day one. Cloudflare Web Analytics already tracks pageviews, so we'll naturally see which viewpoints get used over time.

On first deploy:
- Existing users' `localStorage` has nothing for `wtt_favourite_viewpoint`. On first paint after the update, boot logic defaults to East Ave and writes it to storage. Zero user-visible impact for existing users — the app looks the same as before, just with a new tappable header.
- Users who switch to Queens Road and favourite it: new behaviour. Discoverable via the chevron affordance.

### Bundle impact (estimated)

- `viewpoints.ts` (types + 2 viewpoint records + 13 new stop entries + 12 segment values) → ~0.7 KB
- `switcher.ts` (DOM, open/close state, event wiring) → ~1.5 KB
- Favouriting in `main.ts` (storage wrappers already exist) → ~0.3 KB
- CSS additions (switcher layout, animation, star button) → ~0.4 KB

Total estimate: **+2.9 KB gzipped**. App still well under 15 KB gz, within historical budget.

---

## Open items to verify during implementation

None of these block the design — they're lookups that get done in the first task of the implementation plan:

1. **Walthamstow Queens Road NaPTAN stoppoint id** — likely `910GWLTHQRD`, confirm via the TfL StopPoint Search API or TfL dev portal before wiring.
2. **Suffragette `lineId` value** — likely `suffragette`, confirm against an actual `/StopPoint/{id}/Arrivals` response for Queens Road. Line IDs are lowercase slugs in TfL's API.
3. **TfL published hex for Weaver burgundy + Suffragette green** — the OKLCH approximations in this spec are placeholders. Final values lifted from TfL's brand palette (public CSS from `tfl.gov.uk`). If there's a noticeable mismatch, pick whichever reads better on the app's cream background.
4. **Suffragette `segmentSeconds` values** — approximate Gospel Oak → Barking Riverside inter-stop times from TfL journey planner. These drive the cartoon-train animation only; rough numbers are fine (±30 seconds per segment is fine for the purpose).
5. **Queens Road coords in the Suffragette-line context** — Ben's Google Maps link gave `51.581539, -0.023774`. Verify this makes sense as "the platform" vs "a viewing spot near the platform" when standing there; if it needs tweaking, it's a one-line change.

---

## Open questions for implementation (none blocking)

None. All design decisions are resolved:

- Scope: 3–5 viewpoints, curated, not user-submitted → resolved (Section 1, Q1)
- Shape: every viewpoint has the same data shape, offsets can be 0 → resolved (Section 1, Q2)
- Switcher UI: tappable header + inline expand-down sheet with chevron affordance → resolved (Section 2, Q3)
- Theming: orange = app chrome; line colour = header + train livery only → resolved (Section 3, Q4, revised)
- Favourite: explicit star toggle, persists, temp switches don't update → resolved (built into Section 2)
