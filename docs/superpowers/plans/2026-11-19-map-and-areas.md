# Map of spots and areas on the home list: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/map` page showing every spot on an OpenFreeMap street map. On the home list, spots outside walking range are grouped by area once more than one area exists.

**Architecture:**
- **Areas:** each spot's `place` is its area, with display names in a new `AREAS` record. `buildHomeModel` returns a list of groups instead of one "others" section.
- **Map logic:** pure functions in `mapModel.ts`, tested on their own.
- **Map page:** `mapPage.ts` draws the page and talks to a small `MapEngine` interface. Its tests use a fake engine.
- **MapLibre:** used only inside `mapEngine.ts`, which loads `maplibre-gl` with a dynamic `import()` so the main bundle doesn't grow.
- **Wiring:** `main.ts` gains a `'map'` screen, with history handling like the ticket page's.

**Tech Stack:** Vite 7, plain TypeScript, Vitest with jsdom, `maplibre-gl@6.16.0` (exact version), OpenFreeMap styles.

**Spec:** `docs/superpowers/specs/2026-11-19-map-and-areas-design.md`

## Global Constraints

- Plain TypeScript and CSS; no framework.
- British English, "spot" not "viewpoint" in copy, no exclamation marks.
- Tap targets at least 44 px. Light and dark mode, using the tokens in `src/styles.css`. Works at 320 px wide.
- No technical or privacy detail on screens. The map's compact attribution control is the one exception.
- Any new third party is listed in `public/privacy.html`.
- URLs `/<place>/<slug>` and `localStorage` keys don't change. The location setting stays `wtt_walking_enabled`.
- Nothing invented goes into `VIEWPOINTS`. Test areas use fake spots built in the tests with `defineViewpoint`.
- The map code (`maplibre-gl`) is never in the main bundle.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Don't push, open a PR or merge without Ben's explicit yes.
- Light style: `https://tiles.openfreemap.org/styles/positron`. Dark style: `https://tiles.openfreemap.org/styles/dark` (both returned 200 on 2026-11-19).
- `doc-links` is also being changed by the feedback-form session. Keep the footer a flat list of links separated by `·`, and rebase if theirs lands first. See the note `map-and-areas.md` in the shared session notes folder.

## Review Focus

1. **A favourite that is also near.** It shows only under "Your favourites", never again in "Near you" or its area (Task 2 test).
2. **Location on but no fix yet** (`locating`, `denied`, `no-signal`). Home groups as if location were off, and the map fits to all spots with no dot (Tasks 2 and 4 tests).
3. **The map style fails or the phone is offline.** The page shows "The map can't load right now." and a link back to the list, and nothing throws (Task 5 test).
4. **Back from a spot opened from the map, and reloading `/map`.** Back lands on `/map` at the saved camera. A fresh load of `/map` with no `from` sends the back link home (Task 6 test).
5. **Rows past the 8-stop cap.** They show no countdown and no "…" (Task 2 and Task 3 tests).

---

### Task 1: Areas data

**Files:**
- Modify: `src/viewpoints.ts`
- Test: `tests/viewpoints.test.ts`

**Interfaces:**
- Produces:
  - `export const AREAS: Readonly<Record<string, { name: string }>>`, with `walthamstow: { name: 'Walthamstow' }`.
  - `export function areaName(place: string): string`.
  - `defineViewpoint` throws `Viewpoint ${id}: place "${place}" is not in AREAS` for an unknown place.

- [ ] **Step 1: Write failing tests.**
  - `'every live spot's place is a known area'`: every `VIEWPOINTS` place is in `AREAS`.
  - `'areaName gives the display name'`: `areaName('walthamstow') === 'Walthamstow'`.
  - `'an unknown place throws'`: `defineViewpoint({...eastAveRecord, id: 'x', place: 'nowhere'})` throws a message containing `not in AREAS`. Build the record inline in the test.
- [ ] **Step 2:** Run `npx vitest run tests/viewpoints.test.ts`. Expected: FAIL, because `AREAS` isn't exported.
- [ ] **Step 3:** Add `AREAS` and `areaName`, and add the check in `defineViewpoint` next to the `anchorStop` check.
- [ ] **Step 4:** Run `npx vitest run tests/viewpoints.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: areas for spots, keyed by place`.

### Task 2: Home model groups

**Files:**
- Modify: `src/homeModel.ts`
- Test: `tests/homeModel.test.ts`

**Interfaces:**
- Consumes: `areaName`, `AREAS` (Task 1); `stopsToPoll`, `HOME_MAX_STOPS` (`src/homeArrivals.ts`).
- Produces:
  - `HomeInput` gains `areas: Readonly<Record<string, { name: string }>>`, so tests can pass fake areas.
  - `HomeModel.others` and `othersTitle` are replaced by `groups: HomeGroup[]`, where `export interface HomeGroup { key: string; title: string; rows: HomeRow[] }`.
  - `key` is `'near'` with title `'Near you'`, or `'all'` with title `'All spots'`, or the place with the area's display name as title.
  - `HomeRow.countdown` becomes `HomeRow['countdown'] | null`. It's `null` when the row's stop isn't among `stopsToPoll(homeRowOrder(...))`.
  - `export const NEAR_YOU_SECONDS = 1800`.
  - `homeRowOrder(viewpoints, favouriteIds, position)` keeps its signature and returns rows in the same order as the groups.

- [ ] **Step 1: Write failing tests.** Build fake spots with `defineViewpoint`, placing a `camden` area about 8 km from `HERE`, and pass `areas: { walthamstow: {name:'Walthamstow'}, camden: {name:'Camden'}, hampstead: {name:'Hampstead'} }`.
  - `'one area: same sections as today'`: with `VIEWPOINTS` and location off, `groups` is `[{key:'all', title:'All spots'}]`, with rows by name. With a fix, it's `[{key:'near', title:'Near you'}]`, nearest first. Update the existing tests from `others`/`othersTitle` to `groups[0]`.
  - `'several areas, location on'`: groups are `['near', 'camden', 'hampstead']`, where Camden's nearest spot is closer than Hampstead's. "Near you" holds only spots with walking seconds ≤ 1800.
  - `'several areas, location off'`: groups are the areas in alphabetical order of display name, with rows by name.
  - `'no fix yet groups as location off'`: for each of `locating`, `denied` and `no-signal` with `position: null`, the result matches location off.
  - `'a favourite appears once'`: a starred near spot is in `favourites` only.
  - `'an area with nothing left has no heading'`: star every Camden spot, and no `camden` group remains.
  - `'empty Near you is left out'`: with location on far from every spot, there's no `'near'` group.
  - `'rows past the poll cap have no countdown'`: with more than 8 distinct fake stops, the rows after the eighth stop have `countdown === null`, and the rows before it don't.
- [ ] **Step 2:** Run `npx vitest run tests/homeModel.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement it.** Replace `split` with `arrange(viewpoints, favouriteIds, position, areas): { favourites: Viewpoint[]; groups: { key; title; spots: Viewpoint[] }[] }`, shared by `homeRowOrder` and `buildHomeModel`.
  - The single-area rule is that every input viewpoint shares one `place`.
  - The location-on path is used only when `position` isn't null.
  - Area order with location on is the minimum `haversineMetres` from the parent to any of the area's remaining spots.
- [ ] **Step 4:** Run `npx vitest run tests/homeModel.test.ts`. Expected: PASS. Then `npx tsc --noEmit` fails only in `home.ts` and `main.ts`; Task 3 fixes those.
- [ ] **Step 5:** Commit: `feat: home groups spots by area beyond walking range`.

### Task 3: Home and spot screens: groups, no-countdown rows, map links

**Files:**
- Modify: `src/home.ts`, `src/render.ts`, `src/spotHeader.ts`, `src/main.ts` (pass `areas: AREAS` and the new callbacks only), `src/styles.css`
- Test: `tests/home.test.ts`, `tests/render.test.ts`, `tests/spotHeader.test.ts`

**Interfaces:**
- Consumes: `HomeGroup` and nullable `countdown` (Task 2).
- Produces:
  - `HomeOptions.onOpenMap: () => void`.
  - `RenderOptions.onOpenMap: () => void`.
  - `SpotHeaderModel.backTo: 'home' | 'map'`, passed through `ViewModel.backTo`.
  - Footer links, in this order: `Map` (`href="/map"`, class `doc-map`), About, Privacy, Terms.
  - The home button is `.home-map` with the text `See them on a map`.

- [ ] **Step 1: Write failing tests.**
  - home:
    - `'draws one section per group, in order, with its title'`.
    - `'a row moving from Near you to an area keeps its element'`: render twice and check `li` identity.
    - `'the location control sits after favourites, before the first group'`.
    - `'a row with no countdown has no countdown element text'`: `.home-row-countdown` is empty and has no `loading` class.
    - `'See them on a map comes after the groups and calls onOpenMap'`.
    - `'the footer lists Map, About, Privacy, Terms'`: hrefs are `['/map','/about.html','/privacy.html','/terms.html']`. A plain left click on Map calls `onOpenMap` and prevents the default; a ctrl-click doesn't.
  - render: update the test at `tests/render.test.ts:768` so the expected hrefs start with `'/map'`. Add `'the footer Map link calls onOpenMap'`.
  - spotHeader: `'backTo map reads Map and links /map'` and `'backTo home reads All spots and links /'`.
- [ ] **Step 2:** Run `npx vitest run tests/home.test.ts tests/render.test.ts tests/spotHeader.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
  - In `renderHome`, replace the single `home-others` section with one `section(root, \`home-group-${key}\`, title, rows)` per group.
  - Make `existingRows` collect rows across all groups, as it already does across sections.
  - Share one footer builder between home and spot (export `createDocLinks(onOpenMap)` from `home.ts` and use it in `render.ts`), with the click rule from `createRow`.
  - In `spotHeader`, the back link's label and href follow `backTo`.
  - Style `.home-map` like `.home-locate`, at a minimum height of 44 px. Light and dark come from the existing tokens.
- [ ] **Step 4:** Run `npm test` and `npx tsc --noEmit`. Expected: all PASS (`main.ts` passes `onOpenMap: () => {}` and `backTo: 'home'` for now).
- [ ] **Step 5:** Commit: `feat: area sections on home, and map links on home and spot screens`.

### Task 4: Map model

**Files:**
- Create: `src/mapModel.ts`
- Test: `tests/mapModel.test.ts`

**Interfaces:**
- Consumes: `viewpointPath`, `walkingEstimate`, `formatWalkShort`, `haversineMetres`, `LatLng`.
- Produces:
  - `export interface MapPin { id: string; name: string; lineName: string; lineClass: string; href: string; coords: LatLng; walk: string | null }`, where `lineClass` is `` `line-${lineName.toLowerCase()}` ``.
  - `export type Bounds = [[number, number], [number, number]]`, in `[[west, south], [east, north]]` order, as MapLibre takes it.
  - `export interface Camera { lng: number; lat: number; zoom: number }`.
  - `export function mapPins(viewpoints: readonly Viewpoint[], position: LatLng | null): MapPin[]`, sorted by name.
  - `export function firstView(viewpoints: readonly Viewpoint[], position: LatLng | null): Bounds`. With a position, it's the bounds of the parent and the nearest spot; without one, the bounds of all spots.
  - `export function parseCamera(value: unknown): Camera | null`. It accepts only finite numbers, with lat in [-90, 90] and zoom in [0, 22].

- [ ] **Step 1: Write failing tests.**
  - `mapPins` gives name, line, `href` `/walthamstow/east-avenue-bridge`, and `walk: null` without a position or `'… min walk'` with one.
  - `firstView` with no position encloses all three spots' coordinates. With `HERE` (from `tests/homeModel.test.ts`), it's the box around `HERE` and Queens Road.
  - `parseCamera` rejects `null`, strings, `NaN` and lat 120, and accepts `{lng:-0.02, lat:51.58, zoom:14}`.
- [ ] **Step 2:** Run `npx vitest run tests/mapModel.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `npx vitest run tests/mapModel.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: map pins and first view`.

### Task 5: Map page and MapLibre engine

**Files:**
- Create: `src/mapPage.ts`, `src/mapEngine.ts`
- Modify: `package.json` (`"maplibre-gl": "6.16.0"` in `dependencies`, then `npm install`), `src/styles.css`
- Test: `tests/mapPage.test.ts`

**Interfaces:**
- Consumes: `MapPin`, `Bounds`, `Camera` (Task 4).
- Produces:
  - In `src/mapPage.ts`:
    ```ts
    export interface MapEngine {
      setPins(pins: MapPin[], onPick: (id: string) => void): void;
      setYou(position: LatLng | null): void;
      fit(bounds: Bounds): void;
      setCamera(camera: Camera): void;
      onMove(fn: (camera: Camera) => void): void;
      setScheme(scheme: 'light' | 'dark'): void;
      destroy(): void;
    }
    export type CreateEngine = (container: HTMLElement, scheme: 'light' | 'dark', onFail: () => void) => Promise<MapEngine>;
    export interface MapPageModel { pins: MapPin[]; firstView: Bounds; camera: Camera | null; you: LatLng | null; locationOff: boolean }
    export interface MapPageOptions { onBack: () => void; onOpen: (id: string) => void; onUseLocation: () => void; onMove: (c: Camera) => void; createEngine: CreateEngine }
    export function renderMapPage(root: HTMLElement, model: MapPageModel, options: MapPageOptions): void
    export function updateMapPage(root: HTMLElement, model: MapPageModel): void
    export function leaveMapPage(): void
    ```
    - `renderMapPage` builds the page once.
    - `updateMapPage` only moves the parent's dot and refreshes the pins' walking times. `main.ts` calls it on every rerender.
    - `leaveMapPage` destroys the engine.
  - `src/mapEngine.ts`: `export const createMapLibreEngine: CreateEngine`. It runs `await import('maplibre-gl')` and `import('maplibre-gl/dist/maplibre-gl.css')`.

- [ ] **Step 1: Write failing tests** with a fake engine that records calls.
  - `'draws a back button, the title Map, the map container and a hidden list of spot links'`.
  - `'fits to the first view when there is no camera, and uses the camera when there is one'`.
  - `'picking a pin opens a card with name, line, walk and Open'`.
    - Tapping "Open" calls `onOpen(id)`.
    - Picking another pin replaces the card.
    - The card has a close control at least 44 px, and Escape closes it.
  - `'Use my location shows only when location is off and calls onUseLocation'`.
  - `'when the engine fails, it says the map can't load and links to the list'`. Make `createEngine` reject, and separately call `onFail`. The text is exactly `The map can't load right now.`, and the link `See the list` calls `onBack`.
  - `'no exclamation marks on the map page'`.
- [ ] **Step 2:** Run `npx vitest run tests/mapPage.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `mapPage.ts`.**
  - The header matches the ticket page: an `.info-back` button and an `h1.info-title` reading `Map`.
  - The map container fills the remaining height of the viewport.
  - The card is a bottom sheet using the card tokens. Its "Open" button is full width and at least 44 px tall.
  - The scheme comes from `matchMedia('(prefers-color-scheme: dark)')`, and a change listener calls `setScheme`.
  - Reduced motion: no card slide.
- [ ] **Step 4: Implement `mapEngine.ts`.**
  - Pins are `maplibregl.Marker` instances with a `<button>` element: the `PIN` SVG from `home.ts` (export it), a 44 × 44 px hit area, and `aria-label` of `` `${name}, ${lineName} line` ``.
  - Use `AttributionControl({ compact: true })`.
  - `map.on('error')` before the first `load` calls `onFail`.
  - The parent's dot is a Marker using `--pin`.
  - `setScheme` calls `setStyle` and keeps the markers.
- [ ] **Step 5:** Run `npm test` and `npm run build`. Expected: PASS. In `dist/assets`, `maplibre` appears only in a separate chunk, not the entry chunk. Check with `grep -l maplibre dist/assets/*.js` and compare against the entry named in `dist/index.html`.
- [ ] **Step 6:** Commit: `feat: map page with MapLibre and OpenFreeMap`.

### Task 6: `/map` route and main wiring

**Files:**
- Modify: `src/routes.ts`, `src/landing.ts`, `src/main.ts`
- Test: `tests/routes.test.ts`, `tests/landing.test.ts`, `tests/main.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `Route` gains `{ kind: 'map' }`, and `MAP_PATH = '/map'`.
  - `landingFor` returns `{ screen: 'map' }` for it.

- [ ] **Step 1: Write failing tests.**
  - routes: `'/map'` and `'/Map/'` are the map.
  - landing: the map route lands on the map, even with one favourite.
  - main, following the existing `tests/main.test.ts` patterns:
    - opening the map from home pushes `/map` with `{ from: '/' }`, and the home poller stops;
    - opening a spot from the map pushes the spot with `{ from: '/map' }`, and its header link reads `Map`;
    - popstate back to `/map` restores the camera saved in `history.state.camera`;
    - the map's back link with no `from` goes home.
- [ ] **Step 2:** Run `npx vitest run tests/routes.test.ts tests/landing.test.ts tests/main.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
  - `screen` gains `'map'`, with title `E17 Trains — Map`.
  - `openMap()` pushes `{ from: location.pathname }`.
  - `showMap()` stops both pollers, calls `renderMapPage` once per visit (keyed via `root.dataset.info = 'map'`), and calls `updateMapPage` on rerender.
  - `onMove` writes the camera into the current entry: `history.replaceState({ ...history.state, camera }, '')`, throttled to `moveend`.
  - The map's back works like `backFromInfo`.
  - `openViewpoint` called from the map screen pushes `{ from: '/map' }`.
  - The spot's `onHome` calls `history.back()` when `history.state?.from === '/map'`, and `goHome()` otherwise. `backTo` follows the same rule.
  - Leaving the map, by any route, calls `leaveMapPage()`.
  - Popstate handles `'map'`.
  - Wire `onOpenMap: openMap` into home and render, and `onUseLocation: enableLocation` into the map page.
- [ ] **Step 4:** Run `npm test` and `npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: /map route, with back to wherever it was opened from`.

### Task 7: Privacy page, and checks in the browser

**Files:**
- Modify: `public/privacy.html`
- Test: `tests/` has no privacy test. Check by hand in the browser.

- [ ] **Step 1: Add the OpenFreeMap entry** to the third-party list next to Google Fonts, in the same markup.
  - **OpenFreeMap** (`tiles.openfreemap.org`) draws the map, and only when the map page is opened.
  - It sees your IP address and which part of the map you're looking at, and may be delivered through Cloudflare.
  - Your location is never sent to it; the pins and your dot are drawn on your phone.
  - Link [its privacy policy](https://openfreemap.org/privacy/).
  - Map data © OpenStreetMap contributors.
  - Also update the line "No third-party scripts beyond…" if the map's code counts. It doesn't: it's served from e17trains.uk. Only the map data comes from OpenFreeMap, so add it as a data source, not a script.
- [ ] **Step 2: Check in the browser** with `npm run dev` via `.claude/launch.json` and the preview tools.
  - `/map` at 320 × 568, in light and dark.
  - Location on and off.
  - Tap a pin, Open, back to the map at the same view.
  - The Map links in the home and spot footers.
  - Offline (DevTools), which shows the failure message.
  - The home screen otherwise unchanged with today's spots.
  - Take screenshots for Ben.
- [ ] **Step 3:** Run `npm test` and `npm run build`. Expected: PASS.
- [ ] **Step 4:** Commit: `docs: privacy page lists OpenFreeMap for the map`.
