# Viewpoint URLs and Favourites List (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every viewpoint a permanent URL (`/<place>/<slug>`), turn the single favourite into an ordered list with migration, and apply the landing rule for `/`, with the app looking the same apart from the address bar and multiple stars.

**Architecture:** Three new pure modules (`routes.ts`, `favourites.ts`, `landing.ts`) hold all the new logic and are unit-tested. `main.ts` (which runs side effects on import and has no tests) only wires them in: it resolves the start-up route, keeps the address bar in step with the active viewpoint using `history.replaceState`, and stores the favourites list. Viewpoint records are slimmed so shared line data lives once per line.

**Tech Stack:** Vite 7, vanilla TypeScript 6, Vitest 4 (jsdom), vite-plugin-pwa, Netlify.

**Spec:** `docs/superpowers/specs/2026-11-17-viewpoint-discovery-design.md` (phase 1 of "Phasing"). Phase 2 is `docs/superpowers/plans/2026-11-17-home-screen.md`.

## Global Constraints

- Branch `feat/viewpoint-urls` from `main` (8358106), in a git worktree (other sessions share the main checkout; never switch its branch). No push to `main`, no merge, no deploy without the owner's go-ahead.
- Viewpoint ids `east-ave`, `queens-road`, `northcote-rd` never change: tap records on the server and `wtt_tap_state` on devices are keyed by them. Slugs are a new, separate field.
- URLs: `/walthamstow/east-avenue-bridge`, `/walthamstow/queens-road-station`, `/walthamstow/northcote-road-bridge`. A published URL is permanent.
- No new dependency, no new third-party request, no change to `netlify.toml` (its existing `/* → /index.html` 200 rule already serves the app for these paths) or to the service worker config (`navigateFallback: '/index.html'` already covers them).
- `/?help=1` and `/?reset=walking` keep working: they are read and stripped before routing.
- The tap feature is untouched: `render()` keeps tap slots, strips and the switcher attached across redraws; `switchToViewpoint` still clears passes, thank-yous and berth steps.
- Tests first for every pure module. `npx vitest run`, `npx tsc --noEmit` and `npm run build` pass at every commit.
- Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Calls made in this plan (for the owner)

1. Favourites are stored under a new key `wtt_favourites` as a JSON list of ids, newest last. The old `wtt_favourite_viewpoint` key is removed once migrated, so the privacy page stays exact.
2. Phase 1 has no home screen yet, so where the landing rule says "home" (no favourites, or two or more) the app opens on the first favourite, else East Avenue. Phase 2 replaces that with home.
3. Opening `/` on a countdown rewrites the address bar to that viewpoint's URL (so the URL you copy is the spot you are looking at). An unknown path such as `/walthamstow/typo` is treated as `/`.
4. Switching viewpoint with the dropdown replaces the address rather than adding history, so the phone's back button behaves as it does today.
5. A brand-new visitor sees no filled star (today East Avenue's star is shown filled by default). Returning users keep theirs.
6. The page's canonical link stays `https://e17trains.uk/` for every viewpoint URL until the parked "static page per viewpoint" work.

## Review Focus

1. Storage that throws or is unavailable (Safari private mode): the app must still open on a countdown and stars must work for the session. Test in Task 3 (`read` returning null for everything, and `write` that throws in Task 6's manual check).
2. `wtt_favourites` holding junk (not JSON, not an array, non-strings, duplicates, ids no longer in the data): ignored without throwing. Test in Task 3.
3. Paths a person might type or a QR might carry: trailing slash, upper case, `/index.html`: must resolve, not show a blank app. Test in Task 2.
4. A brand-new user must not be mistaken for a returning one on their second visit (after `wtt_fact_index` exists) and be handed an East Avenue favourite they never chose. Test in Task 3.
5. Removing the last star: the list is empty and `/` still opens on a countdown in this phase. Test in Task 4.

---

### Task 1: Slim viewpoint records with place and slug

**Files:**
- Modify: `src/viewpoints.ts`
- Test: `tests/viewpoints.test.ts`

**Interfaces:**
- Produces: `Viewpoint` gains `place: string` and `slug: string`. `getViewpointBySlug(place: string, slug: string): Viewpoint | undefined`. `LINES: Record<LineId, { name: string; color: string; stops: readonly Stop[]; segments: readonly Segment[] }>`. `ViewpointRecord` (the small hand-written record) and `defineViewpoint(record: ViewpointRecord): Viewpoint`. `VIEWPOINTS`, `getViewpointById`, `DEFAULT_VIEWPOINT_ID` are unchanged in name and behaviour.

`ViewpointRecord` fields: `id`, `place`, `slug`, `name`, `description`, `coords`, `line: LineId`, `stopPointId`, `anchorStop: string` (a stop's `fullName` on that line), `directions`, and optional `positionModel` (default `'station'`), `timeFromExpectedArrival`, `freightStationCode`. `defineViewpoint` fills `lineId`, `lineName`, `lineColor`, `stops`, `segments` from `LINES` and resolves `anchorIndex` from `anchorStop`, throwing if the name is not on the line. Every existing value (offsets, berth steps, coords, comments) is carried over exactly.

- [ ] **Step 1: Add failing tests to `tests/viewpoints.test.ts`**

```ts
it('gives each viewpoint its published URL parts', () => {
  expect(VIEWPOINTS.map((v) => `${v.id}:/${v.place}/${v.slug}`)).toEqual([
    'east-ave:/walthamstow/east-avenue-bridge',
    'queens-road:/walthamstow/queens-road-station',
    'northcote-rd:/walthamstow/northcote-road-bridge',
  ]);
});
it('place/slug pairs are unique and URL-safe', () => {
  const keys = VIEWPOINTS.map((v) => `${v.place}/${v.slug}`);
  expect(new Set(keys).size).toBe(keys.length);
  for (const k of keys) expect(k).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/);
});
it('getViewpointBySlug finds by place and slug, and nothing else', () => {
  expect(getViewpointBySlug('walthamstow', 'east-avenue-bridge')?.id).toBe('east-ave');
  expect(getViewpointBySlug('leyton', 'east-avenue-bridge')).toBeUndefined();
  expect(getViewpointBySlug('walthamstow', 'east-ave')).toBeUndefined();
});
it('defineViewpoint fills line data and the anchor index from a small record', () => {
  const vp = defineViewpoint({
    id: 't', place: 'walthamstow', slug: 't', name: 'T', description: 'T',
    coords: { lat: 0, lng: 0 }, line: 'suffragette', stopPointId: '910GWLTHQRD',
    anchorStop: 'Blackhorse Road',
    directions: {
      north: { label: '→ Barking Riverside', tflDirection: 'outbound', terminusName: 'Barking Riverside', offsetSeconds: 10 },
      south: { label: '← Gospel Oak', tflDirection: 'inbound', terminusName: 'Gospel Oak', offsetSeconds: -10 },
    },
  });
  expect(vp.lineName).toBe('Suffragette');
  expect(vp.anchorIndex).toBe(5);
  expect(vp.positionModel).toBe('station');
  expect(vp.stops).toBe(LINES.suffragette.stops);
});
it('defineViewpoint rejects an anchor stop that is not on the line', () => {
  expect(() => defineViewpoint({ ...({} as ViewpointRecord), line: 'weaver', anchorStop: 'Blackhorse Road' })).toThrow();
});
```

- [ ] **Step 2: Run** `npx vitest run tests/viewpoints.test.ts`. Expected: the new tests fail (missing exports); the existing 14 pass.
- [ ] **Step 3: Implement** in `src/viewpoints.ts`: `LINES`, `ViewpointRecord`, `defineViewpoint`, `getViewpointBySlug`; rewrite the three entries as `defineViewpoint({...})` records.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit`. Expected: all pass (the untouched existing viewpoint, strip, trainPosition and tap tests prove nothing moved).
- [ ] **Step 5: Commit** `refactor: viewpoint records share line data and carry a place and slug`

### Task 2: Route parsing

**Files:**
- Create: `src/routes.ts`
- Test: `tests/routes.test.ts`

**Interfaces:**
- Consumes: `getViewpointBySlug`, `Viewpoint` (Task 1).
- Produces: `type Route = { kind: 'home' } | { kind: 'viewpoint'; viewpoint: Viewpoint } | { kind: 'unknown' }`; `parseRoute(pathname: string): Route`; `viewpointPath(viewpoint: Viewpoint): string`; `HOME_PATH = '/'`.

- [ ] **Step 1: Write failing tests**

```ts
it.each(['/', '', '/index.html'])('%s is home', (p) => {
  expect(parseRoute(p)).toEqual({ kind: 'home' });
});
it.each([
  '/walthamstow/east-avenue-bridge',
  '/walthamstow/east-avenue-bridge/',
  '/Walthamstow/East-Avenue-Bridge',
])('%s is East Avenue', (p) => {
  const r = parseRoute(p);
  expect(r.kind === 'viewpoint' && r.viewpoint.id).toBe('east-ave');
});
it.each(['/walthamstow', '/walthamstow/nope', '/a/b/c', '/walthamstow/east-ave', '/%E0%A4%A'])('%s is unknown', (p) => {
  expect(parseRoute(p)).toEqual({ kind: 'unknown' });
});
it('viewpointPath round-trips for every viewpoint', () => {
  for (const v of VIEWPOINTS) {
    const r = parseRoute(viewpointPath(v));
    expect(r.kind === 'viewpoint' && r.viewpoint.id).toBe(v.id);
  }
  expect(viewpointPath(getViewpointById('queens-road')!)).toBe('/walthamstow/queens-road-station');
});
```

- [ ] **Step 2: Run** `npx vitest run tests/routes.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `parseRoute` (lower-case, strip one trailing slash, split on `/`; never throws) and `viewpointPath`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat: parse and build per-viewpoint URLs`

### Task 3: Favourites list with migration

**Files:**
- Create: `src/favourites.ts`
- Test: `tests/favourites.test.ts`

**Interfaces:**
- Consumes: `getViewpointById`, `DEFAULT_VIEWPOINT_ID`.
- Produces:
  - `FAVOURITES_KEY = 'wtt_favourites'`, `LEGACY_FAVOURITE_KEY = 'wtt_favourite_viewpoint'`, `RETURNING_USER_KEY = 'wtt_fact_index'`
  - `loadFavourites(read: (key: string) => string | null): { ids: string[]; migrated: boolean }`: `migrated` is true when `wtt_favourites` was absent or unreadable and the caller must save.
  - `toggleFavourite(ids: readonly string[], id: string): string[]`: removes if present, else appends; unknown ids are ignored.
  - `saveFavourites(write: (key: string, value: string) => void, remove: (key: string) => void, ids: readonly string[]): void`: writes the JSON list and removes the legacy key.

Rules for `loadFavourites`, in order: a readable `wtt_favourites` JSON array wins (keep strings that are known ids, first occurrence only); else a valid legacy id gives `[legacy]`; else `wtt_fact_index` present gives `['east-ave']`; else `[]`.

- [ ] **Step 1: Write failing tests** (helper `store(obj)` returns `(k) => obj[k] ?? null`)

```ts
it('new user: empty list, needs saving', () => {
  expect(loadFavourites(store({}))).toEqual({ ids: [], migrated: true });
});
it('migrates the old single favourite', () => {
  expect(loadFavourites(store({ wtt_favourite_viewpoint: 'queens-road', wtt_fact_index: '9' })))
    .toEqual({ ids: ['queens-road'], migrated: true });
});
it('returning user with no favourite is given East Avenue', () => {
  expect(loadFavourites(store({ wtt_fact_index: '3' }))).toEqual({ ids: ['east-ave'], migrated: true });
});
it('a stale legacy id falls through to the returning-user rule', () => {
  expect(loadFavourites(store({ wtt_favourite_viewpoint: 'gone', wtt_fact_index: '3' })).ids).toEqual(['east-ave']);
  expect(loadFavourites(store({ wtt_favourite_viewpoint: 'gone' })).ids).toEqual([]);
});
it('once saved, the list wins: an emptied list is never re-seeded', () => {
  expect(loadFavourites(store({ wtt_favourites: '[]', wtt_fact_index: '50', wtt_favourite_viewpoint: 'queens-road' })))
    .toEqual({ ids: [], migrated: false });
});
it('keeps order, drops unknown ids, non-strings and repeats', () => {
  expect(loadFavourites(store({ wtt_favourites: '["northcote-rd","gone",7,"east-ave","northcote-rd"]' })).ids)
    .toEqual(['northcote-rd', 'east-ave']);
});
it.each(['not json', '{"a":1}', 'null', '"east-ave"'])('junk %s is treated as absent', (raw) => {
  expect(loadFavourites(store({ wtt_favourites: raw, wtt_fact_index: '1' }))).toEqual({ ids: ['east-ave'], migrated: true });
});
it('toggle appends, removes, and ignores unknown ids', () => {
  expect(toggleFavourite(['east-ave'], 'queens-road')).toEqual(['east-ave', 'queens-road']);
  expect(toggleFavourite(['east-ave', 'queens-road'], 'east-ave')).toEqual(['queens-road']);
  expect(toggleFavourite(['east-ave'], 'gone')).toEqual(['east-ave']);
});
it('save writes the list and removes the legacy key', () => {
  const write = vi.fn(); const remove = vi.fn();
  saveFavourites(write, remove, ['east-ave', 'queens-road']);
  expect(write).toHaveBeenCalledWith('wtt_favourites', '["east-ave","queens-road"]');
  expect(remove).toHaveBeenCalledWith('wtt_favourite_viewpoint');
});
```

- [ ] **Step 2: Run** `npx vitest run tests/favourites.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the three functions.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat: favourites become an ordered list, migrated from the single favourite`

### Task 4: Landing rule

**Files:**
- Create: `src/landing.ts`
- Test: `tests/landing.test.ts`

**Interfaces:**
- Consumes: `Route` (Task 2), `getViewpointById`, `DEFAULT_VIEWPOINT_ID`.
- Produces:
  - `type Landing = { screen: 'home' } | { screen: 'viewpoint'; viewpoint: Viewpoint }`
  - `landingFor(route: Route, favouriteIds: readonly string[]): Landing`: a viewpoint route lands on it; home or unknown lands on the favourite when there is exactly one, else home. This is the design's final rule and does not change in phase 2.
  - `fallbackViewpoint(favouriteIds: readonly string[]): Viewpoint`: first favourite, else East Avenue. Phase 1's stand-in for home; deleted in phase 2.

- [ ] **Step 1: Write failing tests**

```ts
const home = { kind: 'home' } as const;
it('a viewpoint URL lands on that viewpoint whatever the favourites', () => {
  const route = parseRoute('/walthamstow/queens-road-station');
  expect(landingFor(route, ['east-ave'])).toEqual({ screen: 'viewpoint', viewpoint: getViewpointById('queens-road') });
});
it('/ with no favourites lands on home', () => expect(landingFor(home, [])).toEqual({ screen: 'home' }));
it('/ with exactly one favourite lands on its countdown', () => {
  expect(landingFor(home, ['northcote-rd'])).toEqual({ screen: 'viewpoint', viewpoint: getViewpointById('northcote-rd') });
});
it('/ with two favourites lands on home', () => expect(landingFor(home, ['east-ave', 'queens-road'])).toEqual({ screen: 'home' }));
it('an unknown path is treated as /', () => {
  expect(landingFor({ kind: 'unknown' }, ['east-ave'])).toEqual({ screen: 'viewpoint', viewpoint: getViewpointById('east-ave') });
});
it('fallbackViewpoint: first favourite, else East Avenue', () => {
  expect(fallbackViewpoint(['queens-road', 'east-ave']).id).toBe('queens-road');
  expect(fallbackViewpoint([]).id).toBe('east-ave');
});
```

- [ ] **Step 2: Run** `npx vitest run tests/landing.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both functions.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: landing rule for the root URL`

### Task 5: Several stars in the switcher

**Files:**
- Modify: `src/switcher.ts`, `src/render.ts` (`ViewModel`, `RenderOptions`, the `renderSwitcher` call)
- Test: `tests/switcher.test.ts`, `tests/render.test.ts`

**Interfaces:**
- Produces: `SwitcherModel.favouriteIds: readonly string[]` replaces `favouriteViewpointId`; `SwitcherModel.onToggleFavourite(id)` replaces `onSetFavourite`. `ViewModel.favouriteIds: readonly string[]` replaces `favouriteViewpointId`. `RenderOptions.onToggleFavourite(id)` replaces `onSetFavouriteViewpoint`.

- [ ] **Step 1: Update `tests/switcher.test.ts` and the `vm()`/`opts` helpers in `tests/render.test.ts`** to the new names, and add:

```ts
it('fills a star for every favourite and none for the rest', () => {
  const el = renderSwitcher(null, { ...model, favouriteIds: ['east-ave', 'northcote-rd'] });
  const pressed = Array.from(el.querySelectorAll('.switcher-star')).map((s) => s.getAttribute('aria-pressed'));
  expect(pressed).toEqual(['true', 'false', 'true']);
  expect(el.querySelectorAll('.switcher-star.filled').length).toBe(2);
});
it('shows no filled star when there are no favourites', () => {
  const el = renderSwitcher(null, { ...model, favouriteIds: [] });
  expect(el.querySelectorAll('.switcher-star.filled').length).toBe(0);
});
it('clicking a filled star calls onToggleFavourite with its id', () => { /* click star of east-ave, expect onToggleFavourite('east-ave') and onSwitch not called */ });
```

- [ ] **Step 2: Run** `npx vitest run tests/switcher.test.ts tests/render.test.ts`. Expected: FAIL (type and assertion errors).
- [ ] **Step 3: Implement** the renames; a star is filled when `favouriteIds.includes(vp.id)`. Star `aria-label` stays `Favourite: <name>` with `aria-pressed`. In `main.ts` make only the change that keeps it compiling: pass `favouriteIds: [favouriteViewpointId]` and `onToggleFavourite: setFavouriteViewpoint` (Task 6 replaces both).
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: star more than one viewpoint`

### Task 6: Wire routing and favourites into start-up

**Files:**
- Modify: `src/main.ts`, `public/privacy.html`

**Interfaces:**
- Consumes: `parseRoute`, `viewpointPath` (Task 2); `loadFavourites`, `toggleFavourite`, `saveFavourites` (Task 3); `landingFor`, `fallbackViewpoint` (Task 4); `favouriteIds` / `onToggleFavourite` (Task 5).

- [ ] **Step 1: Replace the single-favourite state in `main.ts`.** Remove `FAVOURITE_STORAGE_KEY`, `loadFavouriteViewpointId`, `favouriteViewpointId`, `setFavouriteViewpoint`. After the existing `?reset` / `?help` block (which must stay first and keeps the path it was given):
  - `let favouriteIds = loadFavourites(safeLocalRead)`; if `migrated`, `saveFavourites(safeLocalWrite, safeLocalRemove, ids)`.
  - `const landing = landingFor(parseRoute(window.location.pathname), favouriteIds)`; `activeViewpoint` is the landing's viewpoint, or `fallbackViewpoint(favouriteIds)` when it is home.
  - If `window.location.pathname !== viewpointPath(activeViewpoint)`, `history.replaceState({}, '', viewpointPath(activeViewpoint) + window.location.hash)` inside try/catch.
  - `toggleFavouriteViewpoint(id)`: toggle, save, `rerender()`.
- [ ] **Step 2: In `switchToViewpoint`,** after `activeViewpoint = next`, `history.replaceState({}, '', viewpointPath(next))` in try/catch. Everything else in the function (snapshot, berth, tap and thank-you clearing, `tickGeneration++`, title, colour, pollers) stays as it is.
- [ ] **Step 3: Make the first-paint title match the switch title:** `E17 Trains — ${lineName} · ${name}` in both places.
- [ ] **Step 4: Update `public/privacy.html`.** Replace the `wtt_favourite_viewpoint` bullet with: "A `wtt_favourites` list remembering which viewpoints you've starred, in the order you starred them. (An older `wtt_favourite_viewpoint` flag is replaced by this list the first time the app opens.)" Keep "Last updated 17 November 2026" or set it to the day of the change.
- [ ] **Step 5: Run** `npx vitest run && npx tsc --noEmit && npm run build`. Expected: all pass.
- [ ] **Step 6: Check in a browser at 375×812** with `npm run dev` (add a `.claude/launch.json` entry; do not commit it, `.claude/` is ignored). Each check starts from the stated `localStorage`:
  1. Empty storage, open `/`: East Avenue countdown, address bar `/walthamstow/east-avenue-bridge`, no filled star, `wtt_favourites` is `[]`.
  2. `wtt_fact_index=5` only, open `/`: East Avenue, its star filled, `wtt_favourites` is `["east-ave"]`.
  3. `wtt_favourite_viewpoint=queens-road`, open `/`: Queens Road; old key gone.
  4. Open `/walthamstow/northcote-road-bridge` directly: Northcote Road regardless of favourites. Reload: same.
  5. Switch with the dropdown: address bar follows; one press of back leaves the app as today.
  6. Star two, un-star both: stars follow; reload opens East Avenue.
  7. `/walthamstow/east-avenue-bridge?help=1`: param stripped, path kept, ask card returns after a "Not now". `/?reset=walking`: walking opt-in row returns.
  8. `/walthamstow/nope` and `/Walthamstow/East-Avenue-Bridge/`: a countdown, never a blank page.
  9. At Northcote Road, wait for a train: the tap button appears, press-and-hold survives the one-second redraw, the thank-you shows, and switching viewpoint clears it. No console errors.
  10. In devtools, make `localStorage.setItem` throw (`Storage.prototype.setItem = () => { throw new Error('x') }` before load via a snippet): app still opens and stars work until reload.
- [ ] **Step 7: Check the built app and offline.** `npm run build`, then the `preview` script. Hard-load `/walthamstow/queens-road-station` (served by the SPA fallback), reload once so the service worker controls the page, stop the preview server, reload: the app shell still loads at that URL. Confirm `dist/sw.js` contains `index.html` in its precache list.
- [ ] **Step 8: Commit** `feat: every viewpoint has its own URL; the root URL follows the landing rule`

### Task 7: Review and pull request

- [ ] **Step 1:** Run the superpowers:requesting-code-review skill over the branch diff against `main`; fix what it confirms.
- [ ] **Step 2:** `npx vitest run && npx tsc --noEmit && npm run build` one last time.
- [ ] **Step 3:** Push `feat/viewpoint-urls` and open a pull request against `main` with `gh pr create`. The body lists the six calls above, the browser checks run, and that Netlify's deploy preview is the place to try it on a phone. Do not merge.
