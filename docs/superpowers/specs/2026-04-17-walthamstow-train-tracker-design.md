# Walthamstow Train Tracker — Design

**Date:** 2026-04-17
**Status:** Approved for implementation planning

## Purpose

A single-purpose PWA that tells Ben whether a train is about to cross the East Avenue bridge in Walthamstow, in either direction, while walking with his toddler. Opens fast, refreshes itself, works on a phone home screen icon.

## Scope

### In scope (MVP)

- Two-direction live countdown to the next train crossing East Avenue bridge:
  - *To Chingford* (northbound, departing Walthamstow Central)
  - *To Walthamstow Central* (southbound, arriving at Walthamstow Central from Wood Street)
- Auto-refresh every 20 seconds
- Visible "updated Xs ago" freshness indicator
- Installable as a PWA (home screen icon, fullscreen, offline shell)
- Graceful states for: no trains imminent, stale/failed data, out of service hours

### Out of scope (future iterations)

- Traffic-light "YES / NO — train coming" glanceable view
- Timeline of next 2-3 trains per direction
- Service status / disruption banner
- Multiple locations or user-selectable stations
- Push notifications
- Dark/light theme toggle (may ship in MVP if trivial; not required)

## Domain background

East Avenue in Walthamstow crosses the Weaver line track between Walthamstow Central and Wood Street stations. Every Weaver-line train passing through Walthamstow Central crosses the East Avenue bridge either just before or just after the station stop:

- **Northbound (→ Chingford):** train stops at Walthamstow Central, then crosses the bridge **90 seconds after** departing the station. Destination name from TfL: `Chingford`.
- **Southbound (→ Walthamstow Central and onward):** train crosses the bridge **20 seconds before** arriving at Walthamstow Central. Destination name from TfL: typically `Liverpool Street` (or whatever the service terminus is south of Walthamstow Central).

The Weaver line is the branding introduced by TfL in 2024 for what was formerly the Overground Chingford branch. It's a single line through Walthamstow Central, so no other lines need filtering at this stop.

## Architecture

### Tech stack

- **Vite + TypeScript** (no framework — UI is two numbers, React is overkill and increases bundle size)
- **vite-plugin-pwa** for manifest, service worker, home screen install
- **Netlify** static hosting, deployed from GitHub on push to `main`
- **TfL Unified API** called directly from the browser (no proxy for MVP — TfL CORS headers permit this, and we don't need an API key at our polling rate)

### Data flow

```
Browser (PWA)
  └─ every 20s: fetch https://api.tfl.gov.uk/StopPoint/{id}/Arrivals
      └─ parse → split by destination → compute bridge time with offsets
          └─ render two countdowns + freshness timestamp
```

### Station ID

The TfL StopPoint ID for the Weaver line platforms at Walthamstow Central must be resolved during implementation. The Underground-only ID (`940GZZLUWHC`) will not return Weaver-line arrivals. The implementation plan must include a step to query `StopPoint/Search?query=Walthamstow Central&modes=overground` (or the equivalent hub/NaPTAN lookup) and verify the returned arrivals include Chingford-bound services before hardcoding the ID.

### Direction classification

For each arrival in the API response:

- If `destinationName` contains `Chingford` → **northbound**
- Else → **southbound** (Liverpool Street, Clapton, or any other south-of-WC terminus)

Pick the arrival with the smallest non-negative `bridgeTime` in each direction.

### Bridge time calculation

```
northbound bridge time = timeToStation + 90    // seconds
southbound bridge time = timeToStation - 20    // seconds
```

`timeToStation` comes directly from the TfL response (already in seconds).

### Display rules

- Round `bridgeTime` to whole seconds for < 60s, whole minutes for ≥ 60s
- If `bridgeTime < 0` and `> -30s` (for southbound, train just crossed): show "just crossed" for 30s then advance to next arrival
- If `bridgeTime ≤ 10s`: show "NOW" with animation to catch the eye
- If no arrival in next 30 min for a direction: show sleeping state for that direction only
- If no arrivals for either direction (e.g. night / disruption): show "No trains right now — check TfL" with a tap-through link

### Refresh and freshness

- Poll every 20 seconds while the tab is visible (use `document.visibilityState`)
- Pause polling when hidden; refresh immediately on return to visible
- Track `lastSuccessfulFetch` timestamp
- Display "updated Xs ago" label, updating every second locally
- If `lastSuccessfulFetch` is older than 60s: add a visible stale warning (amber indicator), keep showing last-known data
- If fetch fails: retry on next interval, don't alert the user unless data is already stale

### PWA config

- `manifest.json`: name "Walthamstow Trains", short_name "Trains", display `fullscreen`, theme color matching the UI, two icon sizes (192, 512)
- Service worker: cache app shell (HTML, JS, CSS, icons) — **do not** cache API responses (always live)

## UI sketch

```
┌──────────────────────────┐
│                          │
│    → Chingford           │
│      2 min               │
│                          │
│    ← Walthamstow Central │
│      7 min               │
│                          │
│   updated 8s ago         │
│                          │
└──────────────────────────┘
```

Large readable numbers. Arrows indicate direction. No clutter. Designed for a one-handed glance while pushing a buggy.

## Error handling

| Condition | Behaviour |
|-----------|-----------|
| First load, no network | Show "Can't reach TfL — check connection" |
| Subsequent fetch fails | Keep last good data, show stale indicator after 60s |
| TfL returns empty arrivals | Show sleeping state ("No trains for a while 💤") |
| TfL returns malformed data | Log to console, treat as empty |
| Service worker update available | Silently activate on next launch |

## Testing

- **Unit:** bridge time calculation, direction classification, stale detection logic
- **Integration:** mock TfL response fixtures covering happy path, empty, malformed, trains already at platform (`timeToStation = 0`), negative `timeToStation`
- **Manual:** real device install to iPhone home screen, confirm fullscreen launch, confirm polling pauses when screen locked

## Deployment

This is a greenfield project — no existing repo or site. Full setup chain:

1. **Local**: `git init` in the project directory, `.gitignore` for `node_modules` / `dist` / `.env*`, initial commit
2. **GitHub**: create a new public or private repo (e.g. `walthamstow-train-tracker`) via `gh repo create` if the CLI is available and authenticated, otherwise via the web UI. Push `main`.
3. **Netlify**: connect the GitHub repo to a new Netlify site — either via `netlify init` / `netlify link` CLI, or via the Netlify web UI ("Add new site → Import from Git"). The CLI is preferable if authenticated; the implementation plan should check and fall back to manual steps with clear instructions.
4. **Netlify build config**:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Node version: 20 (pin via `.nvmrc` or `netlify.toml`)
5. **URL**: default Netlify staging URL (e.g. `walthamstow-trains.netlify.app`) — no custom domain needed. User will bookmark / add-to-home-screen directly.
6. **Auto-deploy**: every push to `main` triggers a Netlify build and deploy.

The implementation plan must not assume `gh` or `netlify` CLIs are installed and authenticated — it should check and, where they aren't, give the user clear copy-pasteable manual steps instead of failing.

## Open questions for implementation

1. Confirm correct StopPoint ID for Weaver-line Walthamstow Central (likely starts with `910G` for National Rail or similar hub ID — must verify empirically)
2. Confirm that all southbound trains pass through Wood Street → i.e. that the 20s-before-station offset holds for all southbound services (no non-stopping variants)
