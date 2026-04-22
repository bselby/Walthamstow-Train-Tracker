# Suffragette Freight — Design

**Date:** 2026-04-22
**Status:** Awaiting user review
**Builds on:** [2026-04-22-multiple-viewpoints-design.md](./2026-04-22-multiple-viewpoints-design.md)
**Depends on:** The multi-viewpoints plan lands fully, including the Suffragette viewpoint at Walthamstow Queens Road. At time of writing, Tasks 1–8 of that plan have landed; Task 9 (final QA + deploy) is still open. A latent bug in `src/tfl.ts` (it hard-codes `data.filter((a) => a.lineId === 'weaver')`) will block Queens Road passenger data until fixed — that fix is a prerequisite for this feature and is noted below.

## Purpose

The Suffragette line (Gospel Oak → Barking Riverside) shares metals with freight. From Queens Road platform you'll see Class 66s hauling aggregate hoppers, intermodals climbing up from Tilbury, and the occasional light-loco move. The TfL feed only covers passenger Overground; add a freight feed alongside it and differentiate the two clearly enough that a toddler points and says "that's a big one".

Scope is tight: only the Suffragette viewpoint gets freight (East Ave doesn't get meaningful freight traffic — the Chingford branch is passenger-only today).

## Scope

### In scope

- A second arrivals feed, polled only when the active viewpoint is Queens Road, returning freight movements passing through Walthamstow Queens Road.
- A single `Arrival.category` field distinguishing `'passenger'` from `'freight'`. No tagged-union or parallel types.
- Visual differentiation on the strip (different cartoon SVG), hero row (category tag), and ticker (small `FR` marker).
- A Netlify Function proxying the freight feed — mandatory because (a) API credentials must stay server-side, (b) upstream CORS is unknown / probably blocked, (c) the likely upstream licence (Realtime Trains, non-commercial) disallows embedding credentials in a public client.
- Graceful degradation: freight feed failures never interrupt passenger rendering.

### Out of scope

- Freight on East Ave / Weaver (no real freight traffic there).
- Differentiating freight operators in the UI (DB Cargo vs Freightliner vs GBRf) — all freight treated uniformly.
- Wagon-type rendering (containers, tankers, hoppers, car-carriers).
- Cancellation history / delay prediction for freight.
- A multi-train strip (still one train per direction on the strip; ticker carries the rest).
- A third "freight-only" viewpoint or a settings toggle to hide freight — freight is always on when the viewpoint qualifies.

## Domain background

### Why freight runs on the Suffragette line

The Gospel Oak to Barking Riverside route (locals call it "the GOBLIN") is a working cross-London freight artery. Aggregates from the Mendips come into Willesden Brent sidings and then snake east across to London Gateway / Tilbury via Barking. Intermodals do the reverse. Queens Road sits in the middle of that corridor, so the platform sees multiple freight movements per hour on a typical weekday.

TfL's public Arrivals API only returns passenger Overground services. Freight doesn't appear. So we need a second feed.

### Feeds considered

| Feed | Covers | Browser-consumable? | Freight? | Verdict |
|---|---|---|---|---|
| **TfL Unified API** | Overground, Tube, bus | Yes (CORS, unauth) | No | Already used for passenger. Keep. |
| **Network Rail Open Data** (datafeeds.networkrail.co.uk) | National rail — TRUST, TD, Schedule, VSTP | No — STOMP message queue, long-lived TCP | Yes | Rules itself out for a static-hosted app. Needs a persistent backend. |
| **Darwin** (National Rail Enquiries) | National passenger rail | Pull via SOAP + REST | No — passenger only | Doesn't solve this. |
| **Realtime Trains Pull API** (`api-portal.rtt.io`) | National rail, derived from NR feeds | Yes — JSON over HTTPS | Yes | Usable. Basic Auth; rate-limited free non-commercial tier. Requires a proxy for both credential + CORS reasons. |

Realtime Trains is the pragmatic choice. Its Pull API is a thin HTTP wrapper over the Network Rail feeds, returns JSON, is free for non-commercial use, and is documented at `https://realtimetrains.github.io/api-specification`. Registration is at `api-portal.rtt.io`. Rate limits aren't published on the portal landing page but are widely understood to be generous for hobby projects (to confirm once registered).

### Auth and proxying

Realtime Trains uses **HTTP Basic Auth** — username + token as `Authorization: Basic …`.

Two implications:

1. **Credentials must not ship to the client.** Embedding them in built JS is equivalent to publishing them — and the non-commercial terms imply "one user, one key", which a public-site key would violate in spirit.
2. **CORS behaviour is unknown** but probably blocked. Even if it weren't, the credential problem alone forces a proxy.

Solution: a single Netlify Function between the browser and `api.rtt.io`, holding credentials in env vars. The browser hits `/.netlify/functions/freight?station=WMW`. The function calls rtt.io with Basic Auth, filters to freight, and returns a slim JSON payload. Netlify's free tier gives 125k function invocations/month — plenty for a single-user personal app polling at 45 s when the Suffragette viewpoint is active (≈1,440 req/day).

Side benefit: the function also normalises the rtt.io response so the client doesn't carry knowledge of upstream field names, and absorbs upstream changes without forcing a client deploy.

The current privacy page says "There is no server running app logic." That becomes technically misleading once the function exists. Soften to: "There is no application logic tracking you — a single stateless function proxies requests to the freight data provider and forwards their response back to your browser unchanged."

### How freight appears in the data

Based on the public Realtime Trains API spec (exact field names to verify against a live response during implementation — see plan Task 1):

- `serviceType` — string. Passenger rows are typically `'train'`; freight rows are `'freight'`. Primary discriminant when present.
- `atocCode` — two-letter operator code. Freight carriers: `DB` (DB Cargo), `FL` (Freightliner), `GB` (GB Railfreight), `DR` (DRS), `CW` (Colas Rail), `EH` (Eurotunnel), `VR` (Victa Rail). Occasionally absent on private / spot-hire services.
- `trainIdentity` (or `headcode`) — four-character code. Its **first digit** is the canonical UK-rail service-class discriminant:
  - `1`, `2`, `9` → passenger (express / stopping / charter)
  - `3` → empty coaching stock (treat as passenger for our purposes — it's a passenger train with nobody in it)
  - `0` → light locomotive (treat as freight — it's a freight-pattern working, no passengers)
  - `4`, `5`, `6`, `7`, `8` → freight (intermodal, timed, trainload, engineer's, etc.)
- Freight rows typically publish **pass times**, not arrival times (freight doesn't stop at passenger stations). Expected fields: `gbttBookedPass` + `realtimePass` alongside the passenger-oriented `gbttBookedArrival` + `realtimeArrival`. The proxy picks whichever is populated.
- Cancellation flags: `isPassengerCancelled` is known; freight cancellations may use a separate field. Inspect during Task 1.

**Our freight filter in the proxy:** accept a row if EITHER `serviceType === 'freight'` OR the first char of the headcode is in `{'0','4','5','6','7','8'}`. The OR catches rows where `serviceType` is missing or wrong (it has been known to happen during upstream TD outages).

### Merging passenger + freight

Two independent feeds, merged client-side. Polling cadences:

- **Passenger** (TfL, existing): 20 s
- **Freight** (rtt.io via proxy, new): **45 s** — slower because freight ETAs don't churn as much as passenger and because we want generous headroom under whatever rate cap rtt.io enforces. 45 s × 3,600 s / 45 s = 80 polls/hour × ~18 active hours/day ≈ 1,440 req/day.

Two independent freshness states: `passengerFreshness` (existing, shown in footer) and `freightFreshness` (new, surfaced only as visual dimming on the strip's freight glyph when `>3 min` old — no new footer row).

In `buildViewModel()`, the two arrival arrays concatenate, then feed through the existing `pickNextNPerDirection(combined, TICKER_SIZE, viewpoint)`. Downstream code — hero selection, ticker, strip positioning — stays unchanged. Sorting by `bridgeTimeSeconds` naturally handles interleaved categories.

**Why independent polls over one merged poll:**

- Cadences differ (20 s vs 45 s).
- Failures are independent: a rtt.io outage shouldn't take down TfL-backed passenger data.
- The proxy is optional infrastructure — if the function isn't deployed or its env vars aren't set, the app must still work with passenger-only. A merged poll would couple the two.

### Freight has patchy coverage of the passenger line

The strip assumes the active train traverses the full passenger stop list and terminates at a line terminus. Both assumptions break for freight:

**Strip position becomes unreliable beyond ~5 min.** `estimatePosition()` walks back from the anchor station using the viewpoint's segment travel-time table, which was measured off passenger running times. At short `timeToStation` values (within ~5 min of passing Queens Road) the freight is genuinely close to the anchor and on the GOBLIN, so the estimate — even if it's off by a segment — places the glyph in a plausible region. At longer horizons, two things go wrong:

- Freight runs slower than passenger EMUs by a non-trivial margin (often 60 mph vs 90 mph line speed, and slower still for heavy trainload workings). Using passenger seconds puts the glyph too close to the anchor — the freight appears to "jump forward" as the estimate catches up with reality on the next poll.
- Freight may not be on our modelled stops yet. A freight joining the GOBLIN from the Gospel Oak chord or from Barking Junction at 8 min out is, at that moment, off-line from the strip's point of view. Any position we draw is a lie.

**Solution: hide the freight glyph on the strip when its live `timeToStation > 300 s` (5 min).** The hero row and ticker still show the countdown — the parent reads "freight in 7 min" and the toddler hears "a big one is coming" — but the strip leaves the train off until it's close enough to place honestly. As the countdown crosses 5 min, the glyph pops in at the far edge and glides through in the usual way. Clean, and matches what we actually know.

Implementation is a two-line clamp in `main.ts`'s per-direction merge: if the chosen hero is freight and its live `currentTts > 300`, set `positions[dir] = null`. The existing `pos: null → visibility: hidden` path in `strip.ts` does the rest.

**Freight destinations don't match line termini.** The `→ Barking Riverside` / `← Gospel Oak` labels are correct as compass direction but wrong as destinations for a freight going to Willesden Euroterminal or Felixstowe North. Three ways to handle this:

1. Ignore it. The label is a compass — user doesn't need the actual destination for toddler-watching.
2. Replace the terminus name with the freight's destination when the hero is freight.
3. Keep the direction label; add a small subtitle below the countdown with the actual journey.

Going with (3). The direction label stays as a stable compass cue across both categories; the freight-only subtitle adds detail without restructuring the row. Format: `Tilbury → Willesden`. Hidden when hero is passenger. Hidden when hero is freight but origin/destination are missing from the feed.

Data-model implication: `Arrival` gains `origin?: string`. The freight proxy already surfaces origin in its DTO; we just need to preserve it.

## Architecture

### New modules

- `netlify/functions/freight.ts` — serverless function. Holds RTT credentials in env vars, fetches rtt.io, filters to freight, returns `{ arrivals: FreightArrivalDTO[], fetchedAt: string }`. Emits permissive CORS headers.
- `src/freight.ts` — client-side wrapper. `fetchFreight(stationCode: string, viewpoint: Viewpoint): Promise<Arrival[]>`. Wraps `fetch('/.netlify/functions/freight?station=…')` and maps DTOs to `Arrival[]` with `category: 'freight'` set. Also exports `isFreightByHeadcode(headcode: string): boolean` as a pure helper.
- `src/freightSvg.ts` — the freight-locomotive SVG string as a constant export, separate from `strip.ts` to avoid bloating the latter with another wall of SVG.

### Modified modules

- `src/tfl.ts`
  - Extend `Arrival` interface with `category?: 'passenger' | 'freight'`, `operatorCode?: string`, `headcode?: string`.
  - **Prerequisite fix:** the current `data.filter((a) => a.lineId === 'weaver')` must generalise to filter by the active viewpoint's `lineId`. Change the signature to `fetchArrivals(stopPointId: string, lineId: string): Promise<Arrival[]>` and thread through from `main.ts`. This is a latent bug in the multi-viewpoints work that will surface when Queens Road is actually exercised against live data — it must land before this plan starts. Either as part of finishing the multi-viewpoints plan's Task 9, or as a one-line hotfix in the first commit of this plan.
- `src/viewpoints.ts` — add optional `freightStationCode?: string` to `Viewpoint`. Queens Road: `'WMW'` (to verify). East Ave: omitted.
- `src/main.ts` — add a second poller (`startPoller(freightTick, FREIGHT_POLL_INTERVAL_MS)`) that only fires when `activeViewpoint.freightStationCode !== undefined`. Maintain a second snapshot bucket (`freightSnapshots`) that's merged into the passenger snapshot before `pickNextNPerDirection` runs. On viewpoint switch, clear both buckets and stop/start the freight poller based on the new viewpoint's config.
- `src/bridge.ts` — no signature change; `BridgeEvent` carries the full `Arrival` so `category` rides along for free. Event sorting already by `bridgeTimeSeconds`, category-blind.
- `src/render.ts` — when the hero's `category === 'freight'`, emit a small `FREIGHT` pill in the row. Pass `isFreight` into the strip model. Freight entries in the ticker get a `ticker-value-freight` class and an `ᶠʳ` marker.
- `src/strip.ts` — `StripModel` gains `isFreight: boolean`. When true, the train element swaps its inner SVG for the freight loco and toggles a `.freight` class. The outer `.strip-train` element is reused across category flips so CSS transitions stay alive.
- `src/styles.css` — `--freight-color` token, `.strip-train.freight` + inner SVG rules, `.freight-tag` pill style, `.ticker-value-freight` micro-marker, `.strip-train.freight.stale` dim state.
- `public/about.html` — one sentence mentioning freight data and Realtime Trains attribution.
- `public/privacy.html` — soften the "no server" language; describe the freight proxy narrowly; the `wtt_*` localStorage list stays the same (no new keys).
- `netlify.toml` — declare the functions directory.

### Data flow

```
tick() every 20s                             (passenger — all viewpoints)
  └─ fetchArrivals(activeViewpoint.stopPointId, activeViewpoint.lineId)
      └─ passengerSnapshots[direction] = picked events
          └─ rerender()

freightTick() every 45s                      (only when freightStationCode set)
  └─ fetchFreight(activeViewpoint.freightStationCode, activeViewpoint)
      └─ normalise DTOs → Arrival[] with category='freight'
          └─ pickNextNPerDirection + freightSnapshots[direction]
              └─ rerender()

rerender() every 1s
  └─ combined = passengerSnapshots[dir].events.concat(freightSnapshots[dir].events)
      └─ re-sort live by bridgeTimeSeconds
          └─ hero = combined[0], ticker = combined[1..TICKER_SIZE-1]
              └─ ViewModel (category on each event) → render()
```

Freight events compute `bridgeTimeSeconds` with `offsetSeconds = 0` — Queens Road's viewpoint already has `offsetSeconds: 0` for both directions, so freight passes straight through `computeBridgeTime` untransformed.

## Data model

### `Arrival` additions (src/tfl.ts)

```ts
export type ServiceCategory = 'passenger' | 'freight';

export interface Arrival {
  // ...existing fields unchanged...

  /** Category of service. Undefined → passenger (all TfL rows). */
  category?: ServiceCategory;

  /** ATOC code (two letters): 'DB' | 'FL' | 'GB' | 'DR' | 'CW' | … Freight only. */
  operatorCode?: string;

  /** Four-character headcode like '6M23' or '0Z72'. Freight only. */
  headcode?: string;

  /** Free-text origin location, typically a yard or depot for freight.
   *  e.g. 'Tilbury Riverside Yard', 'Felixstowe North'. Freight only;
   *  rendered as part of the hero-row 'origin → destination' subtitle. */
  origin?: string;
}
```

Optional-not-required because the TfL response doesn't carry these fields and we'd rather keep a single type than fork passenger / freight. Downstream code reads `arrival.category ?? 'passenger'`.

### `Viewpoint` additions (src/viewpoints.ts)

```ts
export interface Viewpoint {
  // ...existing fields unchanged...

  /** Realtime Trains station CRS code. When set, the app polls freight from
   *  this station. Undefined → no freight poll for this viewpoint. */
  freightStationCode?: string;
}
```

Queens Road: `freightStationCode: 'WMW'` (verify). East Ave: field absent.

### Netlify Function contract

```ts
// GET /.netlify/functions/freight?station=WMW
// 200 → FreightResponse
// 429 → { error: 'rate_limited' }  (pass Retry-After through)
// 500 → { error: 'not_configured' } (env vars missing)
// 502 → { error: 'upstream_auth' | 'upstream_shape' | 'upstream_net' }

interface FreightResponse {
  arrivals: FreightArrivalDTO[];
  fetchedAt: string;   // ISO 8601
}

interface FreightArrivalDTO {
  id: string;              // rtt.io serviceUid — stable per day
  headcode: string;        // e.g. '6M23'
  operatorCode: string;    // e.g. 'DB'
  operatorName: string;    // e.g. 'DB Cargo' (for attribution tooltip, not display)
  origin: string;          // free-text — 'Tilbury Riverside Yard'
  destination: string;     // free-text — 'Willesden Euroterminal'
  timeToStation: number;   // seconds until pass (server-computed from realtimePass)
  expectedPass: string;    // ISO 8601
  direction: 'outbound' | 'inbound';   // inferred from origin/dest position along the line
  category: 'freight';     // always — the function filters
}
```

Response shape TBD against the first live capture (plan Task 1). The function absorbs upstream schema quirks so the client can treat this as a stable contract.

## Visual differentiation

Three options considered.

### Option A — different glyph + category tag (recommended)

- **Strip:** when the hero in a direction is freight, the train SVG swaps to a Class 66-style loco silhouette with one wagon behind, in freight-brown `--freight-color: oklch(45% 0.06 30)`. No seasonal theme overlays (freight is a working train, not a toddler mascot). Same `--pos` positioning, same glide transition. Hidden entirely when the live `timeToStation > 300 s` (see "Freight has patchy coverage of the passenger line" above) — the hero countdown + ticker still show the arrival, just no strip glyph until the train is close.
- **Hero row:** a small `FREIGHT` pill appears to the right of the direction label (`→ Barking Riverside   [FREIGHT]`). Freight-brown outlined; hidden when hero is passenger (the default). Below the countdown value, when hero is freight and both origin + destination are present in the feed, a small secondary line shows the actual journey: `Tilbury → Willesden`. Freight-brown, small weight, stays out of the way.
- **Ticker:** each freight entry gets a superscript `ᶠʳ` next to the minutes, e.g. `Then · 5 · 8ᶠʳ · 12 min`. Visually light — doesn't shout. No journey subtitle in the ticker — keeps that row tidy.

**Pros**
- Strongest cue for toddler-glance: different train **shape**.
- Factually aligned with real-world railway.
- Muted colour keeps passenger data visually primary.

**Cons**
- New SVG to author (~30 min of work).
- `--freight-color` intentionally doesn't theme seasonally — reads slightly drab next to an Easter-eared passenger Aventra.

### Option B — same glyph, muted colour + tag

- Reuse the existing Aventra SVG. Override `color: var(--freight-color)` on `.strip-train.freight`. Same `FREIGHT` tag + `ᶠʳ` markers as Option A.

**Pros**: zero new SVG work; tag still disambiguates the countdown row.
**Cons**: same silhouette is a weak cue at a glance; the Aventra SVG literally depicts a passenger EMU, so using it for freight is factually wrong.

### Option C — second sub-track on the strip

- Duplicate the horizontal line. Passenger trains on the top track; freight trains on the bottom. Station pips straddle both.

**Pros**: explicit spatial separation; "two kinds of train" reads unmistakably.
**Cons**: doubles strip height; forces layout rework; changes "next train" to "next passenger train" (different mental model); freight is rare enough that its track is often empty — visually wasteful.

**Recommendation: Option A.** Strong toddler-legible cue, modest authoring cost, minimal layout risk. Pick A unless Ben has a different preference.

### Exact visual spec for Option A

Strip freight train (`.strip-train.freight > .strip-train-inner`):
- SVG viewBox `0 0 62 22` (10 px wider than passenger to fit loco + wagon).
- Loco: flat-top rectangle body, angled radiator at the front, two visible bogies, one roof exhaust stack, no passenger windows.
- Wagon: single trailing container silhouette (one wagon only — keeps it visually simple for a toddler).
- Fill: `currentColor` where the passenger SVG uses `currentColor`; `.strip-train.freight { color: var(--freight-color); }` overrides the per-viewpoint `--line-color`.
- Mirror behaviour identical to passenger: `.strip-south .strip-freight-svg { transform: scaleX(-1); }`.
- Seasonal theme overlays skipped (the `themedTrainSvg` branch on `model.isFreight` returns the base freight SVG unconditionally).
- Tap-to-toot: honours the existing `.tooting` handler — freight locos honk too.

Hero-row tag (`.freight-tag`):
- Placement: inline after the direction label, separated by a single space.
- Style: `font-size: 0.7rem; font-weight: 800; letter-spacing: 0.1em; color: var(--freight-color); padding: 2px 6px; border: 1px solid currentColor; border-radius: 3px; text-transform: uppercase;`.
- Text: `FREIGHT`.
- Not animated on enter (the row's existing `.ticking` handles fade-in).

Hero-row journey subtitle (`.freight-journey`):
- Rendered only when hero is freight AND `arrival.origin` + `arrival.destinationName` are both populated.
- Placement: a sibling `<div>` immediately after `.value-wrap`, under the countdown.
- Style: `font-family: 'Big Shoulders Text'; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.04em; color: var(--freight-color); text-transform: none; opacity: 0.85; margin-top: 0.1rem;`.
- Content: `{origin}{optional region chip} → {destination}{optional region chip}` (see "Delight: the postcard effect" below).
- Destination for freight is the yard/depot as given by the feed (e.g. "Willesden Euroterminal"), not the line terminus. If either end is missing, the subtitle is hidden (no half-rendered arrow).

### Delight: the postcard effect

The passenger-side of this app repeats — "next train to Barking Riverside" over and over. Freight doesn't: a train from Tilbury, then Felixstowe, then Mossend in Scotland, then Merehead quarry in Somerset. Every freight arrival is a small postcard from somewhere. We lean into that with two small touches that compound over a session.

**Region chips on the journey subtitle.** Each yard name maps to a rough region bucket via a static lookup (`src/freightRegions.ts`): `Scotland`, `Wales`, `The North`, `Midlands`, `West Country`, `East Anglia`, `Kent`, `Thames Estuary`, `Home` (London + immediate surrounds), `Elsewhere` (fallback). A small chip appears next to the origin and (only if different) next to the destination:

```
Tilbury Riverside Yard · Thames Estuary → Willesden Euroterminal · Home
Mossend · Scotland → Felixstowe · East Anglia
```

Chip styling: same freight-brown as the subtitle, `0.6 rem`, `font-weight: 700`, `letter-spacing: 0.08 em`, title-cased (not uppercase — uppercase would shout). Visually a faint dot-separated continuation of the location name, not a second layer of UI.

When origin and destination share a region (e.g. two London yards, or two Midlands yards), only the origin chip renders — saves repetition, keeps the subtitle short for the common local-move case.

**First-sighting shimmer.** On the first time a given region appears in a session, the region chip briefly shimmers — a 1.2 s gold-to-freight-brown gradient pass across the text, once only. "You haven't seen one of these today." Tracked in `sessionStorage` (not `localStorage` — fresh excitement each session, not a permanent novelty-drain).

- Key: `wtt_seen_freight_regions` — JSON array of region strings seen this session
- On render: if `chipRegion` is not in the stored set, emit `.region-chip.new-this-session` class → CSS animation plays once
- After animation completes (`animationend`), the set is updated and saved
- Refreshing the tab = wiping sessionStorage = next Scottish arrival shimmers again. Good. Don't over-reward.

No shimmer on `Home` or `Elsewhere` regions — those are the non-events. Only the evocative ones get the treatment.

**What this is NOT.** Not a progress tracker ("5 regions seen today!"), not a gamification layer, not persisted across sessions. It's a single gentle noticing per session per region. The opposite of a Duolingo streak.

**Other delight options considered** (documented so we don't re-invent later):

- *Regional decals on the loco SVG* (parallel to the existing `THEME_OVERLAYS`): a Welsh dragon, Scottish thistle, Mendip quarry silhouette etc. painted on the cab door, matched to origin region. Beautiful but heavy — 8–10 bespoke SVG snippets, careful placement, reads tiny at strip scale. Flagged as a future delight; not in v1.
- *Document-title shout* for imminent far-region freight (`🚂 Train from Wales — 2 min`): one-liner, teases the user when the tab is in the background. Optional; low cost. Spec calls this out as an open question — ship if it feels right during implementation, skip if it fights the existing `document.title` patterns.

Ticker marker:
- `.ticker-value-freight` on each freight entry.
- `::after` content: `ᶠʳ` (superscript lowercase "fr"), `font-size: 0.7em; color: var(--freight-color); margin-left: 0.1em;`.
- Not animated.

Stale state (`.strip-train.freight.stale`):
- `opacity: 0.45;`
- No colour change (drab-on-drab is fine).
- Triggered when `freightFreshness.state === 'stale'`.

## Edge cases

| Case | Behaviour |
|---|---|
| Viewpoint has no `freightStationCode` | No freight poller started; no freight UI. Identical behaviour to pre-change. |
| Viewpoint switches from Queens Road to East Ave mid-session | `switchToViewpoint` clears `freightSnapshots`, calls `stopFreightPoller()`. Strip rebuilds (stops change); no freight visible. |
| Viewpoint switches from East Ave to Queens Road | `startFreightPoller()` fires; freight appears on the next tick. |
| Proxy returns 5xx | `freightFreshness` → stale; passenger keeps rendering. Freight glyph on strip drops to dim state. No error banner (freight is bonus content). |
| Proxy returns 429 | Client backs off to a 5-minute freight poll until the next successful response. Logged to console. |
| Proxy function not deployed at all | Client `fetch` gets `404`; same path as 5xx — stale state, passenger unaffected. |
| Adblocker blocks `/.netlify/functions/*` | Same as not-deployed. Acceptable degradation. |
| Freight-only time window (late evening) | Hero row shows freight with `FREIGHT` tag + freight SVG. Sleeping state only fires when neither feed has an event within the modelled window. |
| Mixed hero — next train freight, ticker mixed | Hero row shows `FREIGHT`; strip shows loco (if live tts ≤ 5 min, else hidden); ticker shows each entry with its own marker. |
| Freight hero with `timeToStation > 300 s` | Hero countdown + ticker show the arrival; strip glyph is hidden (`pos: null`). As the tts drops under 300, glyph pops in at the far edge with the normal glide-in transition. |
| Freight hero with only one of origin / destination populated | Hero row renders without the journey subtitle — half-rendered `→ Willesden` or `Tilbury →` would read as broken. Both required, or neither shown. |
| Passenger hero directly after freight hero (freight arrived / ticker shifts) | Strip smoothly swaps glyphs (in-place SVG swap preserves the `.strip-train` node and its `--pos` transition); journey subtitle disappears; `FREIGHT` pill disappears. No rebuild flicker. |
| Yard name not in the region lookup | Falls back to `Elsewhere`. Chip still renders (with "Elsewhere" text) — no shimmer. If enough "Elsewhere" cases pile up in production, add them to the map. |
| Origin and destination share the same region | Only the origin's region chip renders; destination's is suppressed to keep the subtitle compact. |
| `sessionStorage` unavailable (Safari private / hardened browser) | Fall back to an in-memory Set — every region triggers a shimmer exactly once per page-load instead of per session. Acceptable degradation. |
| Freight service cancelled mid-journey | Proxy filters cancellations out (via `isPassengerCancelled` / equivalent). No cancelled-freight UI. |
| Freight with missing `realtimePass` (TD lag) | Proxy falls back to `gbttBookedPass` (booked timetable). v1 doesn't distinguish timetable-vs-realtime confidence. |
| Adjacent-line traffic (freight on the up-relief not calling at WQR) | rtt.io station-board returns only services passing or calling AT the station. Adjacent-line moves filter out upstream. Verify empirically during Task 12. |
| `prefers-reduced-motion: reduce` | Freight glide + toot get the same treatment as passenger — no animation. |
| Tab hidden | Existing `visibilitychange` handler extends to stop/start the freight poller. On un-hide, freight polls once immediately. |
| Service worker cache shows old bundle post-deploy | Existing SW refresh behaviour applies. One hard refresh gets the new bundle. Not freight-specific. |
| User's `freightStationCode` is wrong / unknown to rtt.io | Proxy returns 502 (`upstream_shape`); client treats as stale. Verification check in Task 1 should have caught this pre-deploy. |

## Testing

### Unit (Vitest)

**`tests/freight.test.ts`**
- `parseFreightResponse(sampleDto)` maps freight DTOs to `Arrival[]` with `category: 'freight'`, `operatorCode`, `headcode`, `timeToStation`, `expectedArrival` (mapped from `expectedPass`).
- Empty `arrivals: []` → `[]`.
- Malformed DTO (missing `timeToStation`) → skipped, not thrown.
- Direction mapping: `'outbound'` → `'north'`, `'inbound'` → `'south'` (via the active viewpoint's tflDirection mapping).

**`tests/freight.test.ts` — headcode helper**
- `isFreightByHeadcode('6M23')` → true
- `isFreightByHeadcode('0Z72')` → true (light loco)
- `isFreightByHeadcode('4L85')` → true
- `isFreightByHeadcode('2H05')` → false (passenger)
- `isFreightByHeadcode('9C71')` → false (class-9 passenger)
- `isFreightByHeadcode('3S17')` → false (ECS — treat as passenger for the binary split)
- `isFreightByHeadcode('')` / `undefined` → false (safe default)

**`tests/bridge.test.ts` regression**
- `pickNextPerDirection(mixedArrivals, queensRoadViewpoint)` returns hero + tail sorted purely by `bridgeTimeSeconds`, category-blind.
- A mixed list `[passenger@120, freight@60, passenger@180]` yields hero = freight.
- A mixed list with freight cancellations stripped upstream → hero = passenger.

**`tests/render.test.ts`** (new file; there is no render test today — introduce the smallest one that covers the new branches)
- Hero passenger → no `.freight-tag` in the row.
- Hero freight → exactly one `.freight-tag` with text "FREIGHT".
- Hero freight with origin + destination → `.freight-journey` rendered with text `${origin} → ${destination}`.
- Hero freight with origin missing (or destination missing) → no `.freight-journey` at all.
- Ticker with freight entries → each freight entry gets `.ticker-value-freight`.
- Ticker entries never render `.freight-journey` (subtitle is hero-only).

**`tests/main.test.ts` (or equivalent)** — freight strip-position clamp:
- Hero freight with live `timeToStation > 300 s` → `northPos` / `southPos` is `null` on the view model (strip glyph hidden).
- Hero freight with live `timeToStation ≤ 300 s` → position estimated normally via `estimatePosition`.
- Hero passenger with any `timeToStation` → position behaviour unchanged from existing tests.

**`tests/freightRegions.test.ts`** — region lookup + session-novelty helper:
- `regionFor('Tilbury Riverside Yard')` → `'Thames Estuary'`
- `regionFor('Mossend')` → `'Scotland'`
- `regionFor('Merehead')` → `'West Country'`
- `regionFor('Willesden Euroterminal')` → `'Home'`
- `regionFor('  ')` / empty string → `'Elsewhere'`
- `regionFor('Some Unknown Yard')` → `'Elsewhere'`
- `isNewRegionThisSession('Scotland')` returns `true` first call, `false` after
- `isNewRegionThisSession('Home')` / `'Elsewhere'` always `false` (no shimmer for the non-events)
- Session-storage unavailability (mock `window.sessionStorage` throwing) → helper still works, first-call-true semantics preserved via in-memory fallback

**`tests/strip.test.ts`** (extend if it exists, otherwise new)
- `renderDirectionStrip` with `model.isFreight: true` → `.strip-train.freight` class present; inner SVG contains the freight viewBox.
- Toggling `isFreight: true → false → true` within one viewpoint → no DOM rebuild of pips/line; only the train inner swaps. (Verified via asserting the same `.strip-line` node reference survives.)

### Proxy tests (Vitest with fetch mock)

**`tests/netlify-freight.test.ts`**
- Env vars present + rtt.io returns mixed passenger+freight → response contains only freight rows.
- Env vars missing → 500 `{ error: 'not_configured' }`.
- rtt.io returns 401 → proxy returns 502 `{ error: 'upstream_auth' }`.
- rtt.io returns 429 with `Retry-After: 300` → proxy returns 429 with the same header.
- Every response has `Access-Control-Allow-Origin: *` and the route-under-test method.

### Integration (manual, post-deploy)

1. Register at `api-portal.rtt.io`, request a non-commercial Pull API token.
2. Set `RTT_USERNAME` + `RTT_TOKEN` (or equivalent — depends on the portal's final scheme) in Netlify's environment variables UI for the production site.
3. Deploy to a Netlify preview first. Open the preview on a weekday afternoon (13:00–17:00 GMT is the GOBLIN's freight-busy window).
4. Switch to Queens Road. Watch for a freight arrival. Confirm: loco SVG on the strip, `FREIGHT` tag on the hero row, `ᶠʳ` marker in any ticker freight entry.
5. Cross-check against rtt.io's own website for the same station — minutes should match within ±30 s.
6. Switch to East Ave. Confirm via DevTools Network tab: zero `/.netlify/functions/freight` calls fire after the switch.
7. Break the proxy deliberately (temporarily set the env var wrong) → confirm passenger data keeps rendering; freight glyph fades to dim; no error banner.
8. Restore env vars; hard-refresh; confirm freight returns within 45 s.
9. Promote to production.

### Regression

All existing tests pass. `npm run build` budget:

- JS: +3.5 KB raw / +1.4 KB gz for freight code + SVG + region map.
- CSS: +1.2 KB raw / +0.4 KB gz for freight styles + region chip + shimmer keyframes.
- Netlify Function: its own bundle (not counted in the client budget).
- If client-side actuals exceed +2.5 KB gz total, investigate before shipping — the region lookup is the likely culprit; trim to fewer yards if needed.

## Deployment

- Register at `api-portal.rtt.io`; generate a non-commercial token.
- Set `RTT_USERNAME` / `RTT_TOKEN` in Netlify's UI (production + preview contexts).
- Push to `main`; Netlify picks up the new `netlify.toml` `[functions]` stanza + the `netlify/functions/freight.ts` source and deploys the function alongside the static site.
- No DNS or CDN changes.

**Attribution (licence compliance):**
- About page gains "Freight data via Realtime Trains (© A.P. Limited, non-commercial use)".
- Privacy page replaces "no server" language with a narrow description of the freight proxy.
- Both pages link the Realtime Trains terms.

## Open questions for implementation

1. **Realtime Trains exact API shape** — the public Swagger UI was unreachable during spec drafting. Task 1 of the plan captures one live response via `curl` and locks the DTO mapping.
2. **Walthamstow Queens Road CRS** — spec assumes `WMW`. Verify by resolving via the rtt.io search endpoint after registering.
3. **Rate limit of the free tier** — unpublished on the portal. The 45 s cadence is a guess. Tune up if headroom is roomier, down if tighter; log 429s.
4. **rtt.io CORS policy** — if it does serve permissive CORS, the proxy is still required for credentials. A future iteration could simplify if CORS later becomes moot. Document the observed header in Task 1.
5. **Direction mapping for freight** — rtt.io's `origin` / `destination` are free-text station names, not TfL's `'outbound'` / `'inbound'`. We'll infer direction from the relative order of the service's `locations[]` list (which stop precedes Queens Road, which follows). Edge cases — reversals at Barking, crossover moves — may misclassify; v1 accepts "approximately right direction" as good enough for toddler-watching.
6. **Cancellation semantics** — rtt.io uses `isPassengerCancelled` for passenger; inspect whether freight uses a parallel `isOperationalCancelled` / `cancelReasonCode`. Decide during Task 1.
7. **Multi-train strip** — when the next passenger and next freight are both inside the modelled window, the strip still shows only the hero. A toddler could miss half the action. Deferred — "two trains per direction" is a meaningful strip rework, not a freight-specific concern.
8. **Paid-tier upgrade path** — if the site ever outgrows personal non-commercial use, rtt.io's commercial terms kick in. Current plan: personal-only; revisit only if traffic changes.
9. **Should ECS (class 3) count as freight?** — spec says no (treat as passenger). ECS moves are interesting spots, but they're still passenger stock. Revisit only if Ben feels like ECS should be included.
10. **Document-title shout for imminent far-region freight** — optional extra delight. When the hero is freight, < 2 min out, and origin region is one of `Scotland | Wales | The North | West Country | East Anglia | Kent` (not `Home`, `Elsewhere`, `Thames Estuary`, `Midlands`), update `document.title` to `🚂 Train from {Region} — {N} min`. Revert to the normal `East Ave Trains — {viewpoint name}` title when the freight passes. ~20 lines of code, lives in `main.ts`'s `buildViewModel` or `rerender` path. Skipped in the v1 plan; ship in a follow-up if it feels wanted during QA.
11. **Region lookup coverage** — the seed list of ~50 yards covers the common freight destinations through Queens Road, but the GOBLIN sees long-tail moves (holiday trains, engineering spoil trains, cement moves to Hope in the Peak District, etc.). Expect to add keywords over the first month of real-world use based on actual `Elsewhere` hits in the console. Keep a small log.
