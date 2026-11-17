# Home Screen (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A home screen at `/` listing "Your favourites" then "Near you", each row with the next train's countdown, one shared location consent, home polling grouped by TfL stop, and a countdown screen whose dropdown is replaced by a way back to home.

**Architecture:** `main.ts` gains a `screen` state (`'home' | 'countdown'`) and runs exactly one set of pollers at a time. The part of the countdown poll that turns TfL arrivals into per-direction snapshots is extracted into a pure module and reused by home, so a home row and its countdown screen agree by construction (including East Avenue's expected-arrival timing and held trains). Home's model and DOM are separate pure modules; the DOM updates rows in place so a press survives the one-second redraw.

**Tech Stack:** Vite 7, vanilla TypeScript 6, Vitest 4 (jsdom), vite-plugin-pwa, Netlify.

**Spec:** `docs/superpowers/specs/2026-11-17-viewpoint-discovery-design.md` (phase 2). Builds on `docs/superpowers/plans/2026-11-17-viewpoint-urls-favourites.md`, whose `routes.ts`, `favourites.ts` and `landing.ts` it uses unchanged.

## Global Constraints

- Branch `feat/home-screen` from `feat/viewpoint-urls` (or from `main` once phase 1 is merged), in a git worktree. No push to `main`, no merge, no deploy without the owner's go-ahead.
- Location is requested only after the user taps "Use my location" or "Enable walking time". Both write the existing `wtt_walking_enabled` flag, so anyone already opted in to walking time is opted in on home.
- Home rows use TfL arrivals plus the viewpoint offset only: no freight, no signalling steps. Home makes no request to `/.netlify/functions/freight`.
- Home polls every 30 s, at most 8 distinct TfL stops, only while home is showing and the tab is visible: at most 16 requests a minute. TfL's anonymous limit, confirmed on 2026-11-17 at api-portal.tfl.gov.uk/products, is 50 requests a minute ("Anonymous access to our API is limited to 50 requests a minute"); the page does not say whether that is per IP address. The countdown screen keeps its 20 s poll and does not run while home is showing.
- The countdown is sacred (`.impeccable.md`): on the countdown screen nothing new sits above or competes with the numbers. Cream background, navy text, Big Shoulders type, line-colour accents. `prefers-reduced-motion` respected. Tap targets at least 44 px.
- Nothing on home is for the child: no sounds, no toys, no animation beyond a state change (owner's standing rule: the child's experience stays screen-free).
- User-facing copy says "spot"; code says `Viewpoint`.
- The tap feature keeps working: `render()` still keeps tap slots, strips and the header attached across redraws; leaving a countdown clears passes, thank-yous and berth steps exactly as `switchToViewpoint` does today.
- Viewpoint ids never change. No new dependency, no new third-party request, no `netlify.toml` or service-worker config change.
- Tests first. `npx vitest run`, `npx tsc --noEmit`, `npm run build` pass at every commit. Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Calls made in this plan (for the owner)

1. A spot appears once on home: starred spots under "Your favourites" in the order you starred them, everything else under "Near you". If every spot is starred, "Near you" is not shown.
2. The landing rule is applied when the app is opened, not on every visit to home. With exactly one favourite, opening the app goes to its countdown; tapping "All spots" from there shows home and stays there.
3. The countdown screen's header becomes: "All spots" link, line name, spot name, and a star. The star moves here because the dropdown that held it is gone.
4. Opening a spot from home shows its numbers at once, using what home already fetched, instead of "Connecting to TfL…".
5. If TfL has not answered for 90 seconds, a home row shows a dash instead of a countdown that may be wrong.
6. Home shows a small "Using your location · off" line so location can be turned off there as well as on a countdown screen.
7. Home rows hold a train TfL has dropped at the station until it passes the spot (as the countdown screen does), so East Avenue's row does not jump to the next train two minutes early.

## Review Focus

1. Pressing a row or star while the list redraws each second, or re-sorts as GPS settles: the press must land on the row the finger is on. Test in Task 4 (row elements keep identity across renders and reorders).
2. Location on but denied, without signal, or still locating: the list must show at once as "All spots" by name, never an empty screen waiting for GPS. Test in Task 3.
3. TfL failing for one stop or all stops on home: other rows keep counting; no row shows a stale countdown past 90 s; nothing throws. Tests in Tasks 2 and 3.
4. Returning from home to the same spot just left: pollers restart, data is fresh or seeded, the tap pass does not survive. Manual check in Task 6 step 7 (main.ts has no unit tests).
5. Browser back and forward between home and spots, including the first entry after a start-up redirect: the screen always matches the address bar. Manual check in Task 6.

---

### Task 1: Extract the snapshot step shared by countdown and home

**Files:**
- Create: `src/snapshots.ts`
- Modify: `src/main.ts` (`tick()` uses it; `DirectionSnapshots` moves), `src/tfl.ts`
- Test: `tests/snapshots.test.ts`, `tests/tfl.test.ts`

**Interfaces:**
- Produces:
  - `interface DirectionSnapshot { events: BridgeEvent[]; snapshottedAtMs: number }`
  - `type ViewpointSnapshots = Partial<Record<Direction, DirectionSnapshot>>`
  - `snapshotViewpoint(previous: ViewpointSnapshots, lineArrivals: Arrival[], viewpoint: Viewpoint, nowMs: number, perDirection: number): ViewpointSnapshots`: exactly what `tick()` does today between the fetch and `snapshots = next`: `secondsToStation` per arrival (honouring `timeFromExpectedArrival`), `pickNextNPerDirection`, `holdDroppedTrains` per direction against `previous`, slice to `perDirection`, `undefined` for a direction with no events.
  - In `tfl.ts`: `fetchStopArrivals(stopPointId: string): Promise<Arrival[]>` (every line at the stop; throws `TfL API error: <status>`); `fetchArrivals(stopPointId, lineId)` becomes a filter over it, behaviour unchanged.

- [ ] **Step 1: Write failing tests** in `tests/snapshots.test.ts` using `getViewpointById('east-ave')` and `('queens-road')`:

```ts
it('station spot: bridge time is TfL timeToStation', () => {
  const s = snapshotViewpoint({}, [arr({ timeToStation: 120, direction: 'outbound' })], QR, NOW, 4);
  expect(s.north?.events[0].bridgeTimeSeconds).toBe(120);
  expect(s.north?.snapshottedAtMs).toBe(NOW);
  expect(s.south).toBeUndefined();
});
it('East Avenue counts from expected arrival plus its offset', () => {
  const a = arr({ lineId: 'weaver', direction: 'outbound', timeToStation: 999, expectedArrival: new Date(NOW + 60_000).toISOString() });
  expect(snapshotViewpoint({}, [a], EA, NOW, 4).north?.events[0].bridgeTimeSeconds).toBeCloseTo(60 + 142);
});
it('holds a northbound East Avenue train TfL has dropped until it passes the bridge', () => {
  const first = snapshotViewpoint({}, [arr({ lineId: 'weaver', direction: 'outbound', vehicleId: 'v1', expectedArrival: new Date(NOW + 5_000).toISOString() })], EA, NOW, 4);
  const second = snapshotViewpoint(first, [], EA, NOW + 20_000, 4);
  expect(second.north?.events[0].arrival.vehicleId).toBe('v1');
  expect(second.north?.events[0].bridgeTimeSeconds).toBeCloseTo(5 + 142 - 20);
});
it('caps each direction at perDirection', () => { /* 6 outbound arrivals, perDirection 4 → 4 events */ });
```

  and in `tests/tfl.test.ts`: `fetchStopArrivals` returns rows for every line; `fetchArrivals` still filters by line; a 500 rejects with `TfL API error: 500`.
- [ ] **Step 2: Run** `npx vitest run tests/snapshots.test.ts tests/tfl.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `snapshotViewpoint` by moving the body out of `tick()`; `tick()` calls `snapshotViewpoint(snapshots, fetched, activeViewpoint, now, TICKER_SIZE)`. Add `fetchStopArrivals`.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `refactor: one snapshot step for the countdown poll, ready for home to share`

### Task 2: Home arrivals, grouped by stop

**Files:**
- Create: `src/homeArrivals.ts`
- Test: `tests/homeArrivals.test.ts`

**Interfaces:**
- Consumes: `snapshotViewpoint`, `ViewpointSnapshots` (Task 1).
- Produces:
  - `HOME_POLL_INTERVAL_MS = 30_000`, `HOME_MAX_STOPS = 8`, `HOME_STALE_MS = 90_000`
  - `stopsToPoll(viewpoints: readonly Viewpoint[], max?: number): string[]`: distinct `stopPointId`s in the order given, capped at `max` (default 8).
  - `type HomeSnapshots = Record<string /* viewpoint id */, { snapshots: ViewpointSnapshots; fetchedAtMs: number }>`
  - `applyStopArrivals(current: HomeSnapshots, viewpoints: readonly Viewpoint[], stopPointId: string, arrivals: Arrival[], nowMs: number): HomeSnapshots`: for each viewpoint on that stop, filter arrivals to its `lineId`, run `snapshotViewpoint` against its previous snapshots with `perDirection` 2, stamp `fetchedAtMs`. Other viewpoints untouched. Returns a new object.
  - `type NextTrain = { state: 'loading' } | { state: 'stale' } | { state: 'none' } | { state: 'due'; seconds: number }`
  - `nextTrain(entry: HomeSnapshots[string] | undefined, nowMs: number): NextTrain`: `loading` with no entry; `stale` when `nowMs - fetchedAtMs > HOME_STALE_MS`; otherwise the smallest live `bridgeTimeSeconds - elapsed` that is `>= 0` across both directions (`due`), or `none`.
  - `pollHome(viewpoints: readonly Viewpoint[], current: HomeSnapshots, fetchStop: (stopPointId: string) => Promise<Arrival[]>, now: () => number): Promise<{ snapshots: HomeSnapshots; failed: number; polled: number }>`: `Promise.allSettled` over `stopsToPoll`; a failed stop leaves its viewpoints' entries as they were.

- [ ] **Step 1: Write failing tests**

```ts
it('polls each stop once though two spots share it', () => {
  expect(stopsToPoll(VIEWPOINTS)).toEqual(['910GWLTWCEN', '910GWLTHQRD']);
});
it('caps the stops polled, keeping the first rows', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ ...QR, id: `v${i}`, stopPointId: `S${i}` }));
  expect(stopsToPoll(many)).toEqual(['S0','S1','S2','S3','S4','S5','S6','S7']);
});
it('one stop fetch feeds both spots on it, each with its own offset', () => {
  const s = applyStopArrivals({}, VIEWPOINTS, '910GWLTHQRD', [arr({ direction: 'outbound', timeToStation: 300 })], NOW);
  expect(nextTrain(s['queens-road'], NOW)).toEqual({ state: 'due', seconds: 300 });
  expect(nextTrain(s['northcote-rd'], NOW)).toEqual({ state: 'due', seconds: 213 }); // 300 − 87
  expect(s['east-ave']).toBeUndefined();
});
it('ignores other lines at a shared stop', () => { /* arrival lineId 'victoria' → state 'none' */ });
it('takes the sooner of the two directions and counts down with the clock', () => {
  const s = applyStopArrivals({}, [QR], QR.stopPointId, [arr({ direction: 'outbound', timeToStation: 400 }), arr({ direction: 'inbound', timeToStation: 90 })], NOW);
  expect(nextTrain(s['queens-road'], NOW + 30_000)).toEqual({ state: 'due', seconds: 60 });
});
it('skips a train that has already passed and shows the one after', () => { /* 20 s and 500 s; at NOW+40 s → 460 */ });
it('loading before any data, none with no trains, stale after 90 s', () => {
  expect(nextTrain(undefined, NOW)).toEqual({ state: 'loading' });
  const s = applyStopArrivals({}, [QR], QR.stopPointId, [], NOW);
  expect(nextTrain(s['queens-road'], NOW)).toEqual({ state: 'none' });
  expect(nextTrain(s['queens-road'], NOW + 90_001)).toEqual({ state: 'stale' });
});
it('East Avenue row matches its countdown screen', () => {
  const a = arr({ lineId: 'weaver', direction: 'inbound', timeToStation: 999, expectedArrival: new Date(NOW + 100_000).toISOString() });
  const s = applyStopArrivals({}, [EA], EA.stopPointId, [a], NOW);
  expect(nextTrain(s['east-ave'], NOW)).toEqual({ state: 'due', seconds: 78 }); // 100 − 22
});
it('pollHome: a failing stop keeps its old data and is counted', async () => {
  const fetchStop = vi.fn((id: string) => id === '910GWLTWCEN' ? Promise.reject(new Error('x')) : Promise.resolve([arr({ direction: 'outbound', timeToStation: 60 })]));
  const r = await pollHome(VIEWPOINTS, {}, fetchStop, () => NOW);
  expect(fetchStop).toHaveBeenCalledTimes(2);
  expect(r.failed).toBe(1); expect(r.polled).toBe(2);
  expect(r.snapshots['east-ave']).toBeUndefined();
  expect(nextTrain(r.snapshots['queens-road'], NOW).state).toBe('due');
});
```

- [ ] **Step 2: Run.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: home arrivals fetched once per TfL stop`

### Task 3: Home model (sections, order, labels)

**Files:**
- Create: `src/homeModel.ts`
- Modify: `src/walkingTime.ts` (add `formatWalkShort`)
- Test: `tests/homeModel.test.ts`, `tests/walkingTime.test.ts`

**Interfaces:**
- Consumes: `nextTrain`, `HomeSnapshots` (Task 2); `viewpointPath` (phase 1); `GeolocationState`; `walkingEstimate`; `formatCountdown`.
- Produces:
  - `formatWalkShort(est: WalkingEstimate): string`: under 50 m `'You're here'`; else `'<n> min walk'` with minutes rounded up.
  - `interface HomeRow { id: string; name: string; lineName: string; lineColor: string; href: string; walk: string | null; countdown: { kind: 'loading' | 'stale' | 'none' | 'now' | 'seconds' | 'minutes'; text: string }; favourite: boolean }`. Texts: loading `'…'`, stale `'—'`, none `'No trains'`, otherwise `formatCountdown(seconds).text`.
  - `type HomeLocation = 'off' | 'locating' | 'on' | 'denied' | 'no-signal' | 'unavailable'`
  - `interface HomeModel { favourites: HomeRow[]; others: HomeRow[]; othersTitle: 'Near you' | 'All spots'; location: HomeLocation; notice: string | null }`
  - `buildHomeModel(input: { viewpoints: readonly Viewpoint[]; favouriteIds: readonly string[]; locationEnabled: boolean; geo: GeolocationState; snapshots: HomeSnapshots; lastPollFailed: boolean; nowMs: number }): HomeModel`
  - `homeRowOrder(viewpoints, favouriteIds, position: LatLng | null): Viewpoint[]`: favourites in saved order, then the rest by distance (with a position) or by name. Used by the poller so the 8-stop cap follows what is on screen.

Rules: `location` is `'off'` when not enabled; `'unavailable'` when the API is missing (treated as off, button hidden); `'on'` whenever a position is held (even while the watch is idle); otherwise `'locating'`, `'denied'` or `'no-signal'` from the status. `othersTitle` is `'Near you'` only when a position is held. `walk` is set on every row only when a position is held. `notice` is `"Can't reach TfL. Trying again."` when `lastPollFailed` and any row is `loading` or `stale`; else null.

- [ ] **Step 1: Write failing tests**

```ts
const HERE = { lat: 51.5816, lng: -0.0240 }; // ~20 m from Queens Road station; Northcote ~620 m, East Avenue ~680 m
it('no location: all spots by name, no walking labels', () => {
  const m = build({ favouriteIds: [], locationEnabled: false });
  expect(m.othersTitle).toBe('All spots');
  expect(m.others.map((r) => r.name)).toEqual(['East Avenue Bridge', 'Northcote Road Bridge', 'Queens Road Station']);
  expect(m.others.every((r) => r.walk === null)).toBe(true);
  expect(m.location).toBe('off');
});
it('with a position: nearest first, with walking labels', () => {
  const m = build({ favouriteIds: [], locationEnabled: true, geo: { status: 'granted', position: HERE } });
  expect(m.othersTitle).toBe('Near you');
  expect(m.others.map((r) => r.id)).toEqual(['queens-road', 'northcote-rd', 'east-ave']);
  expect(m.others[0].walk).toBe("You're here");
  expect(m.others[1].walk).toMatch(/^\d+ min walk$/);
});
it('favourites sit on top in saved order and are not repeated below', () => {
  const m = build({ favouriteIds: ['northcote-rd', 'east-ave'], locationEnabled: true, geo: { status: 'granted', position: HERE } });
  expect(m.favourites.map((r) => r.id)).toEqual(['northcote-rd', 'east-ave']);
  expect(m.others.map((r) => r.id)).toEqual(['queens-road']);
  expect(m.favourites.every((r) => r.favourite)).toBe(true);
});
it.each([
  ['locating', null, 'locating'], ['denied', null, 'denied'], ['no-signal', null, 'no-signal'],
  ['unavailable', null, 'unavailable'], ['idle', HERE, 'on'],
] as const)('enabled with status %s → %s, list still shown', (status, position, expected) => {
  const m = build({ favouriteIds: [], locationEnabled: true, geo: { status, position } });
  expect(m.location).toBe(expected);
  expect(m.others.length).toBe(3);
  if (position === null) expect(m.othersTitle).toBe('All spots');
});
it('row links and countdown text', () => {
  const m = build({ favouriteIds: [], snapshots: qrDueIn(125) });
  const qr = m.others.find((r) => r.id === 'queens-road')!;
  expect(qr.href).toBe('/walthamstow/queens-road-station');
  expect(qr.countdown).toEqual({ kind: 'minutes', text: '2 min' });
  expect(m.others.find((r) => r.id === 'east-ave')!.countdown).toEqual({ kind: 'loading', text: '…' });
});
it('says so when TfL cannot be reached and a row has nothing to show', () => {
  expect(build({ lastPollFailed: true }).notice).toBe("Can't reach TfL. Trying again.");
  expect(build({ lastPollFailed: true, snapshots: allDue() }).notice).toBeNull();
});
```

  plus `formatWalkShort`: 30 m → `You're here`; 300 m → `4 min walk`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: home model: favourites first, then nearest`

### Task 4: Home screen DOM

**Files:**
- Create: `src/home.ts`
- Modify: `src/styles.css` (new `.home*` block)
- Test: `tests/home.test.ts`

**Interfaces:**
- Consumes: `HomeModel`, `HomeRow` (Task 3).
- Produces: `renderHome(root: HTMLElement, model: HomeModel, options: HomeOptions): void` with `interface HomeOptions { onOpen(id: string): void; onToggleFavourite(id: string): void; onUseLocation(): void; onLocationOff(): void }`.

Structure, in order, all direct children of `root`: `header.home-header` (`<h1>E17 Trains</h1>`); `section.home-section.home-favourites` with `<h2>Your favourites</h2>` and `ul.home-list` (omitted when empty); the location control; `section.home-section.home-others` with `<h2>` = `othersTitle` and `ul.home-list` (omitted when empty); `p.home-notice` (when `notice`); the same `nav.doc-links` as the countdown screen. Each row is `li.home-row[data-id]` holding `a.home-row-link[href]` (line-colour dot, `.home-row-name`, `.home-row-meta` = line name and, when set, ` · ` + walk, `.home-row-countdown` with class = countdown kind) and a sibling `button.home-star` (`aria-pressed`, `aria-label="Favourite: <name>"`, same star SVGs as the switcher). The star is never inside the link.

Location control by `location`: `off` → `button.home-locate` "Use my location"; `locating` → `p.home-location` "Finding you…" + `button.home-location-off` "off"; `on` → "Using your location" + off; `denied` → "Location unavailable" + off; `no-signal` → "No GPS signal" + off; `unavailable` → nothing.

Redraw rule: `renderHome` runs every second. It reuses the existing `li` for each `data-id` (updating text, classes, `href`, `aria-pressed` in place and moving it only if its position or section changed) and reuses the section, list and location elements. Anything in `root` that is not part of home is removed. Listeners are attached once at creation and call through the options of the latest render (the `currentOptions` pattern in `render.ts`). A plain left click on a row link calls `preventDefault()` and `onOpen(id)`; clicks with ctrl, meta, shift or a non-primary button are left to the browser.

- [ ] **Step 1: Write failing tests** (jsdom, `model()` helper building a `HomeModel`):

```ts
it('shows favourites, then the location button, then all spots', () => {
  renderHome(root, model({ favourites: [row('east-ave')], others: [row('queens-road')], location: 'off', othersTitle: 'All spots' }), opts);
  expect(texts('h2')).toEqual(['Your favourites', 'All spots']);
  expect(root.querySelector('.home-locate')?.textContent).toBe('Use my location');
});
it('hides the favourites section when there are none', () => { /* no .home-favourites */ });
it('a row is a real link with name, line, walk and countdown', () => {
  /* a.home-row-link href '/walthamstow/queens-road-station'; meta 'Suffragette · 4 min walk'; countdown '2 min' with class 'minutes' */
});
it('clicking a row opens it without a page load', () => { /* click → onOpen('queens-road'), event.defaultPrevented true */ });
it('a ctrl-click is left to the browser', () => { /* onOpen not called, defaultPrevented false */ });
it('the star toggles without opening the row', () => { /* click .home-star → onToggleFavourite('queens-road'), onOpen not called; aria-pressed reflects row.favourite */ });
it('Use my location asks only when tapped', () => { /* render alone: onUseLocation not called; click → called once */ });
it.each([['locating', 'Finding you…'], ['on', 'Using your location'], ['denied', 'Location unavailable'], ['no-signal', 'No GPS signal']])(
  'location %s shows "%s" with an off button', (location, text) => { /* .home-location text; click .home-location-off → onLocationOff */ });
it('keeps each row element across redraws and re-sorts', () => {
  renderHome(root, model({ others: [row('east-ave'), row('queens-road')] }), opts);
  const before = root.querySelector('[data-id="queens-road"]');
  renderHome(root, model({ others: [row('queens-road', { countdown: { kind: 'seconds', text: '40 sec' } }), row('east-ave')] }), opts);
  const after = root.querySelector('[data-id="queens-road"]');
  expect(after).toBe(before);
  expect(ids('.home-others .home-row')).toEqual(['queens-road', 'east-ave']);
  expect(after!.querySelector('.home-row-countdown')!.textContent).toBe('40 sec');
});
it('a row moving into favourites keeps its element', () => { /* same identity check across sections */ });
it('uses the latest handlers after a redraw', () => { /* render with opts A then opts B; click → B called, A not */ });
it('clears whatever the countdown screen left behind', () => { root.innerHTML = '<div class="switcher"></div><section class="row"></section>'; /* render → neither remains */ });
it('shows the TfL notice when set', () => { /* p.home-notice text */ });
```

- [ ] **Step 2: Run.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement `renderHome`.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Style it.** Use the impeccable skill with `.impeccable.md` as the brief. Fixed points: one column, rows at least 64 px tall with the whole row tappable; spot name in Big Shoulders Text; the countdown right-aligned in Big Shoulders Display 900 with `font-variant-numeric: tabular-nums`, the strongest thing in the row, in `--ink`; the dot in the row's line colour; star at least 44×44 px, reusing the `.switcher-star` colours; "Use my location" as a clear full-width button in the existing button style; no shadows-on-cards, gradients or new colours; reduced-motion block for any transition. Legible in sunlight: countdown and name pass WCAG AA on `--bg`.
- [ ] **Step 6: Commit** `feat: home screen list that redraws in place`

### Task 5: Countdown header replaces the dropdown

**Files:**
- Create: `src/spotHeader.ts`
- Modify: `src/render.ts`, `src/styles.css` (remove the `.switcher*` block, add `.spot-header*`)
- Delete: `src/switcher.ts`, `tests/switcher.test.ts`
- Test: `tests/spotHeader.test.ts`, `tests/render.test.ts`

**Interfaces:**
- Produces: `renderSpotHeader(existing: HTMLElement | null, model: { viewpoint: Viewpoint; favourite: boolean; onHome(): void; onToggleFavourite(id: string): void }): HTMLElement`. Root `header.spot-header` containing `a.spot-header-home[href="/"]` with text "All spots" (and a left chevron, `aria-hidden`), `.spot-header-line` (line name), `h1.spot-header-name` (spot name), `button.spot-header-star` (`aria-pressed`, `aria-label="Favourite: <name>"`). Reuses `existing` and updates it in place. A plain left click on the link calls `preventDefault()` and `onHome()`.
- `RenderOptions`: `onSwitchViewpoint` is removed; `onHome(): void` is added; `onToggleFavourite` stays. `ViewModel.favouriteIds` stays.

- [ ] **Step 1: Write failing tests** in `tests/spotHeader.test.ts`: shows line and spot name; link `href` is `/` and a click calls `onHome` with default prevented; ctrl-click does not; star reflects `favourite` and calls `onToggleFavourite(viewpoint.id)`; re-rendering with another viewpoint returns the same element with new text. In `tests/render.test.ts`: replace switcher expectations with `.spot-header` being the first child and being the same element after a second `render()`; a kept tap slot is still the same element after a second `render()` (existing test, must still pass); no `.switcher` in the output.
- [ ] **Step 2: Run** `npx vitest run tests/spotHeader.test.ts tests/render.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `render.ts`, the header takes the switcher's place in the kept set and in `out[0]`; pass `favourite: vm.favouriteIds.includes(vm.viewpoint.id)`. Header background keeps `--line-color` as the switcher header does today. Delete the switcher and its styles.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS (`tsc` is completed by Task 6).
- [ ] **Step 5: Commit** `feat: countdown header with a way back to all spots`

### Task 6: Screens, navigation, shared location consent, home polling

**Files:**
- Modify: `src/main.ts`, `src/landing.ts` (delete `fallbackViewpoint` and its test)

**Interfaces:**
- Consumes: everything above; `landingFor`, `parseRoute`, `viewpointPath`, `HOME_PATH` (phase 1).

`main.ts` has no unit tests; every rule below is checked in Task 8.

- [ ] **Step 1: Screen state.** `let screen: 'home' | 'countdown'`. `activeViewpoint` stays non-null (the last or default viewpoint) so existing code is untouched. `rerender()` calls `renderHome(root, buildHomeModel(...), homeOptions)` on home and `render(...)` on countdown.
- [ ] **Step 2: `showCountdown(viewpoint)` and `showHome()`.**
  - `showCountdown`: does everything `switchToViewpoint` does today (clear snapshots, freight snapshots, `lastFetchMs`, `lastError`, berth ETAs and steps, tap passes, thank-yous; `tickGeneration++`; title; `--line-color`), with the early return for "same viewpoint" removed; then, if home holds an entry for this viewpoint no older than `HOME_STALE_MS`, sets `snapshots` and `lastFetchMs` from it; stops the home poller; starts the countdown poller (keep the stop function `startPoller` returns, which is discarded today) and the freight poller; `rerender()`.
  - `showHome`: stops the countdown and freight pollers, `tickGeneration++`, clears tap passes and thank-yous, sets title `E17 Trains — Live Walthamstow train tracker`, removes the `--line-color` override, starts the home poller, `rerender()`.
  - `onBerthEvent` returns at once while `screen === 'home'`.
- [ ] **Step 3: Navigation.** `openViewpoint(id)`: `history.pushState({}, '', viewpointPath(vp))`, `showCountdown(vp)`, `window.scrollTo(0, 0)`. `goHome()`: `history.pushState({}, '', HOME_PATH)`, `showHome()`, scroll to top. `popstate` listener: `parseRoute(location.pathname)` → `showCountdown` for a viewpoint, `showHome` otherwise (the landing rule is not applied here). Start-up: after the `?reset` / `?help` block, `landingFor(parseRoute(pathname), favouriteIds)`; a viewpoint landing reached from `/` or an unknown path uses `replaceState` to its URL; a home landing from an unknown path uses `replaceState` to `/`.
- [ ] **Step 4: One location consent.** Rename `walkingEnabled` → `locationEnabled`, `enableWalkingTime` → `enableLocation`, `disableWalkingTime` → `disableLocation`; storage key stays `wtt_walking_enabled`. Home's `onUseLocation` and the countdown's "Enable walking time" both call `enableLocation`; both "off" controls call `disableLocation`. `?reset=walking` is unchanged.
- [ ] **Step 5: Home poller.** `homeTick`: `pollHome(homeRowOrder(VIEWPOINTS, favouriteIds, position), homeSnapshots, fetchStopArrivals, Date.now)`; store the result and `lastHomePollFailed = failed === polled && polled > 0`; `rerender()`. Run with `startPoller(homeTick, HOME_POLL_INTERVAL_MS)` (already pauses while the tab is hidden). A home tick does not call `advanceFact()`.
- [ ] **Step 6: Run** `npx vitest run && npx tsc --noEmit && npm run build`. Expected: PASS.
- [ ] **Step 7: Commit** `feat: home at the root URL; one location consent; one poller at a time`

### Task 7: Privacy and About pages

**Files:**
- Modify: `public/privacy.html`, `public/about.html`

- [ ] **Step 1: `privacy.html`,** exact changes:
  - Intro: "enabling walking time" → "turning on location".
  - `wtt_walking_enabled` bullet: "…remembers whether you've turned location on (for sorting spots by distance and showing walking times)."
  - `atViewpoint` bullet: "It is `unknown` unless location is on and your phone has found its location."
  - Geolocation section, first paragraph: "If you tap **Use my location** on the home screen or **Enable walking time** on a spot, your browser hands your latitude/longitude to this app's JavaScript code. Those coordinates are used on your device only — to work out how far you are from each spot, so the list can be sorted nearest first and walking times shown — and are **never transmitted anywhere**. They are not stored, logged, or sent. A tap sends only whether you were near the viewpoint (`yes` or `no`), never the coordinates." Second paragraph: "You can turn this off at any time using the small **off** link next to "Using your location" on the home screen or next to the walking label on a spot. That stops the location watch and removes the localStorage flag. The app never asks for your location until you tap one of those two buttons."
  - TfL bullet: add "The home screen asks TfL for arrivals at the stations behind the spots listed, about every 30 seconds while it is open."
  - Realtime Trains bullet: "only when viewing the Queens Road viewpoint" → "only while a Suffragette-line spot's countdown is open (Queens Road Station or Northcote Road Bridge), never from the home screen." (Northcote Road already polls freight today; this corrects the page.)
  - "Last updated" → the date of the change.
- [ ] **Step 2: `about.html`:** replace the sentence telling people to tap the line name at the top to switch (line 32) with one describing the home list, the star, and "All spots". Read the whole page and correct any other sentence the new home screen makes false; change nothing else.
- [ ] **Step 3: Commit** `docs: privacy and about pages match the home screen and location use`

### Task 8: Verify, review, pull request

- [ ] **Step 1: Browser check at 375×812** with `npm run dev`, console open, each from the stated storage:
  1. Empty storage, `/`: home, "All spots" by name, "Use my location" button, three rows whose countdowns fill within a second or two. No permission prompt. Network panel: two TfL requests (Walthamstow Central, Queens Road), repeated every 30 s, none to `/.netlify/functions/freight`.
  2. Tap "Use my location": the browser prompt appears only now. Allow: title becomes "Near you", walking labels appear, order is by distance. Reload: no prompt, still on.
  3. Deny instead: list stays, "Location unavailable · off". Tap off: button returns.
  4. `wtt_walking_enabled=1` set beforehand (existing walking-time user): home is already "Near you".
  5. Star a row: it moves to "Your favourites"; star a second; reload `/`: home. Un-star down to one; reload `/`: straight to that countdown, address bar is its URL. Tap "All spots": home, and it stays home.
  6. Tap a row: countdown shows numbers at once (no "Connecting to TfL…"), address bar is the spot URL; back button returns to home; forward returns to the spot.
  7. Open Northcote Road, wait for a tap button, go to "All spots" and back: pollers running (network panel), no stale thank-you, button reappears for the next train; press-and-hold on the button survives the redraw.
  8. Home row vs countdown: East Avenue's row and its countdown screen (opened in a second tab) agree to within a few seconds, including while a northbound train is between Walthamstow Central and the bridge.
  9. Block `api.tfl.gov.uk` in devtools on first load: rows show "…", then the notice "Can't reach TfL. Trying again."; unblock: rows fill. Block after data: rows count down, then show "—" after 90 s.
  10. Hide the tab for a minute: no TfL requests while hidden.
  11. `/?help=1` and `/?reset=walking` on home and on a spot URL; `/walthamstow/nope` → home at `/`.
  12. Press a row while the list re-sorts (toggle location on with the finger down in devtools touch mode): the spot opened is the one pressed.
  13. 320 px wide and 200% zoom: no row text overlaps the countdown or star.
- [ ] **Step 2: Built app and offline:** `npm run build`, preview, hard-load `/` and `/walthamstow/east-avenue-bridge`; reload so the service worker controls the page; stop the server; reload both: the shell loads and home shows its rows with the TfL notice.
- [ ] **Step 3:** Screenshot home (no location, with location, with favourites) and the new countdown header for the pull request.
- [ ] **Step 4:** Run superpowers:requesting-code-review over the branch diff; fix what it confirms. Re-run `npx vitest run && npx tsc --noEmit && npm run build`.
- [ ] **Step 5:** Push `feat/home-screen`, open a pull request with `gh pr create` (base `feat/viewpoint-urls`, or `main` if phase 1 has merged). Body: the seven calls above, the checks run, screenshots. Do not merge.
