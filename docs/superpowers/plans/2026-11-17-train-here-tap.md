# "Train's here" tap (phase 1: collect) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A parent can tap once as a specific train passes; the app books it in like a train register entry, clips their ticket towards the next grade, and stores the tap on the server. Taps do not change any timing yet.

**Architecture:** Pure logic for the tap window, levels and local state lives in small modules with unit tests. A UI module draws the ask card, the per-direction button and the thank-you; `render.ts` places them and `main.ts` owns state. A second Netlify function stores each tap in Netlify Blobs.

**Tech Stack:** Vite, vanilla TypeScript, Vitest (jsdom), Netlify Functions, `@netlify/blobs`.

**Spec:** `docs/superpowers/specs/2026-11-17-train-here-tap-design.md`

## Global Constraints

- The countdown times are never covered, delayed or moved by this feature. The ask card sits in the page flow below both direction panels and their tickers.
- Tone: the saved brief in `.impeccable.md` (bright, cheerful, railway-truthful). The parent is railway staff booking trains in.
- One movement only: the ticket being clipped, about 300 ms, `transform`/`opacity` only, ease-out, no bounce, disabled under `prefers-reduced-motion`. No sound, no confetti, nothing over a second. A short `navigator.vibrate` where supported.
- Nothing is designed for a child to tap or watch.
- Location coordinates are never sent. Only `yes`, `no` or `unknown` for "at the viewpoint".
- No account. A random id is generated on the device.
- Phase 1 stores taps only. No timing value changes.
- Station viewpoints (position model `station` with a zero offset) and freight trains get no button and no ask.
- Buttons show to everyone except people who chose "Not now". `/?help=1` (linked from the About page as "Help tune this spot") resets that choice.
- Button appears when that direction's countdown is at or under 30 seconds; it stays until tapped or 45 seconds after the latest predicted time for that train.
- Grades and kit: Spotter 1 tap (notebook issued), Guard 5 (whistle issued), Signaller 15 (keys to the box), Driver 30 (cap and timetable), Station Master 60 (top hat optional).
- Progress is a card ticket with one hole per tap needed for the next grade, never a ring, and never around the countdown value.
- The tap button's wording stays plain: `<destination> train is passing`.
- Copy: sentence case, no exclamation marks, no "please", no "successfully".
- Nothing is deployed without the owner's approval. Work on a branch.
- Existing tests keep passing: `npx vitest run` and `npx tsc --noEmit`.

## Review Focus

1. **A tap must survive the one-second re-render.** `render()` rebuilds the direction rows every second. A button replaced between press and release loses the tap. Expected: one tap, one thank-you, every time. The same redraw must not replay the ticket's clip movement every second.
2. **Storage blocked or full** (private mode). Expected: the feature works for the session, nothing throws, the countdown is unaffected.
3. **Offline or a failed POST.** Expected: the thank-you still shows, the ticket is still clipped, no retry loop, no error on screen.
4. **Switching viewpoint while a button is showing.** Expected: the button goes, and a tap can never be recorded against the other viewpoint.
5. **Malformed, oversized or unknown-viewpoint POST bodies.** Expected: 400, nothing stored.

---

### Task 1: Tap logic

**Files:**
- Create: `src/tap.ts`
- Test: `tests/tap.test.ts`

**Interfaces:**
- Consumes: `BridgeEvent` from `src/bridge.ts`; `Viewpoint` from `src/viewpoints.ts`; `Direction` from `src/direction.ts`.
- Produces:
  ```ts
  export const TAP_LEAD_SECONDS = 30;
  export const TAP_LINGER_SECONDS = 45;
  export const LEVELS: readonly { name: string; taps: number; kit: string }[];
  export interface TapPass {
    viewpointId: string; direction: Direction;
    vehicleId: string | null; berthTrainId: string | null; destination: string;
    shownAtMs: number; predictedAtShowMs: number; latestPredictedMs: number;
  }
  export function canOfferTap(viewpoint: Viewpoint, direction: Direction, hero: BridgeEvent | undefined): boolean;
  export function updatePass(current: TapPass | null, input: {
    viewpoint: Viewpoint; direction: Direction; hero: BridgeEvent | undefined;
    berthTrainId: string | null; nowMs: number;
  }): TapPass | null;
  export function passKey(pass: TapPass): string;
  export function levelFor(taps: number): {
    name: string | null; next: { name: string; taps: number } | null;
    stepsDone: number; stepsTotal: number;
  };
  /** The gap between the tap and the app's prediction, in plain words:
   *  'Right time.' within 3 s, otherwise 'We were 12 seconds early. Noted.' or
   *  'We were 8 seconds late. Noted.' Early means the app's time came before the tap. */
  export function registerGapLine(tapMs: number, predictedMs: number): string;
  /** The grade reached by this tap, or null when the tap did not cross a threshold. */
  export function promotionFor(tapsBefore: number, tapsAfter: number): { name: string; kit: string } | null;
  export function atViewpoint(position: { lat: number; lng: number } | null,
    coords: { lat: number; lng: number }): 'yes' | 'no' | 'unknown';
  ```

- [ ] **Step 1: Write the failing tests** in `tests/tap.test.ts`. Use `getViewpointById('east-ave')`, `('queens-road')`, `('northcote-rd')` and a small `hero(bridgeTimeSeconds, overrides)` helper. Cases, one `it` each:
  - `canOfferTap` is false with no hero; false for a freight hero (`arrival.category === 'freight'`); false at `queens-road`; true at `east-ave` and `northcote-rd` for a passenger hero.
  - `updatePass(null, …)` returns null at 31 s, a pass at 30 s and at 5 s, and null at -46 s.
  - A new pass records `vehicleId`, `destination` (the hero's `destinationName`), `shownAtMs = nowMs` and `predictedAtShowMs = latestPredictedMs = nowMs + bridgeTimeSeconds * 1000`.
  - With a current pass and the same vehicle now predicted 20 s later, the pass is kept and `latestPredictedMs` moves; `predictedAtShowMs` does not.
  - With a current pass and a different vehicle leading the panel, the pass is kept unchanged while `nowMs <= latestPredictedMs + 45_000`, and is null one millisecond after.
  - A current pass for another viewpoint id returns null.
  - `passKey` is equal for the same viewpoint, direction and `predictedAtShowMs`, and differs across directions.
  - `levelFor(0)` → `{ name: null, next: Spotter/1, stepsDone: 0, stepsTotal: 1 }`; `levelFor(2)` → name Spotter, next Guard, `stepsDone: 1, stepsTotal: 4`; `levelFor(5)` → Guard, `stepsDone: 0, stepsTotal: 10`; `levelFor(75)` → Station Master, `next: null`.
  - `registerGapLine(t, t + 2000)` is `Right time.`; `registerGapLine(t, t - 12000)` is `We were 12 seconds early. Noted.`; `registerGapLine(t, t + 8000)` is `We were 8 seconds late. Noted.`
  - `promotionFor(4, 5)` is Guard with kit `Whistle issued`; `promotionFor(5, 6)` is null; `promotionFor(0, 1)` is Spotter.
  - `atViewpoint(null, coords)` is `unknown`; a point 50 m away is `yes`; a point 400 m away is `no`.

- [ ] **Step 2: Run to verify failure**
  Run: `npx vitest run tests/tap.test.ts`
  Expected: FAIL, cannot resolve `../src/tap`.

- [ ] **Step 3: Implement `src/tap.ts`.** A station viewpoint is `positionModel === 'station'` with that direction's `offsetSeconds === 0`. "At the viewpoint" is within 150 m, using the haversine in `src/walkingTime.ts` (export it if it is not already exported).

- [ ] **Step 4: Run to verify pass**
  Run: `npx vitest run tests/tap.test.ts && npx tsc --noEmit`
  Expected: PASS, no type errors.

- [ ] **Step 5: Commit**
  `git add src/tap.ts tests/tap.test.ts src/walkingTime.ts && git commit -m "feat: tap window, pass and level logic"`

---

### Task 2: Local tap state

**Files:**
- Create: `src/tapStore.ts`
- Test: `tests/tapStore.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const TAP_STORAGE_KEY = 'wtt_tap_state';
  export interface TapState {
    choice: 'unset' | 'helping' | 'declined';
    declinedAtMs: number | null; asksShown: number;
    taps: number; tappedPassKeys: string[]; deviceId: string;
    /** The most recent tap, so the register entry can be shown for a minute. */
    lastTap: { passKey: string; tapMs: number; predictedMs: number; tapsBefore: number } | null;
  }
  export type AskKind = 'first' | 'again' | 'invite' | null;
  export function loadTapState(read: (key: string) => string | null, newId: () => string): TapState;
  export function saveTapState(write: (key: string, value: string) => void, state: TapState): void;
  export function askKind(state: TapState, nowMs: number): AskKind;
  export function buttonsEnabled(state: TapState): boolean;
  export function chooseHelp(state: TapState, choice: 'helping' | 'declined', nowMs: number): TapState;
  export function resetChoice(state: TapState): TapState;
  export function recordTap(state: TapState, key: string, tapMs: number, predictedMs: number): TapState;
  export function hasTapped(state: TapState, key: string): boolean;
  ```

- [ ] **Step 1: Write the failing tests.** Cases:
  - `loadTapState` with nothing stored returns `choice: 'unset'`, zero taps and the id from `newId`; with stored JSON it returns that state and keeps its `deviceId`; with unparseable JSON it returns a fresh state.
  - `askKind`: `first` for a fresh state; `null` straight after `chooseHelp(…, 'declined', t)`; `again` at `t + 7 days` when `asksShown` is 1; `null` after a second decline; `invite` when `taps > 0`; `null` for `helping` with zero taps.
  - `chooseHelp` increments `asksShown` and sets `declinedAtMs` only for `declined`.
  - `buttonsEnabled` is false only for `declined`. `resetChoice` returns `choice: 'unset'`, `asksShown: 0`.
  - `recordTap` adds one tap, sets `choice: 'helping'`, stores `lastTap` with `tapsBefore`, and is a no-op for a key already recorded. `tappedPassKeys` keeps at most the latest 20.
  - `saveTapState` followed by `loadTapState` round-trips.

- [ ] **Step 2: Run to verify failure**
  Run: `npx vitest run tests/tapStore.test.ts`
  Expected: FAIL, cannot resolve `../src/tapStore`.

- [ ] **Step 3: Implement `src/tapStore.ts`.** All functions are pure; storage access is passed in so `main.ts` can use its existing `safeLocalRead` / `safeLocalWrite`.

- [ ] **Step 4: Run to verify pass**
  Run: `npx vitest run tests/tapStore.test.ts && npx tsc --noEmit`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git add src/tapStore.ts tests/tapStore.test.ts && git commit -m "feat: local state for the tap ask, taps and device id"`

---

### Task 3: Tap payload and sender

**Files:**
- Create: `src/tapClient.ts`
- Test: `tests/tapClient.test.ts`

**Interfaces:**
- Consumes: `TapPass` from Task 1.
- Produces:
  ```ts
  export interface TapPayload {
    viewpointId: string; direction: 'north' | 'south';
    msSinceTap: number;
    predictedAtShowMs: number; predictedAtTapMs: number;
    source: 'berth' | 'tfl';
    berthStepMs: number | null; tflExpectedArrivalMs: number | null;
    vehicleId: string | null; berthTrainId: string | null;
    atViewpoint: 'yes' | 'no' | 'unknown'; deviceId: string;
  }
  export function buildTapPayload(pass: TapPass, ctx: {
    tapMs: number; nowMs: number; predictedAtTapMs: number; source: 'berth' | 'tfl';
    berthStepMs: number | null; tflExpectedArrivalMs: number | null;
    atViewpoint: 'yes' | 'no' | 'unknown'; deviceId: string;
  }): TapPayload;
  export const TAP_ENDPOINT = '/.netlify/functions/tap';
  export function sendTap(payload: TapPayload, fetchFn?: typeof fetch): Promise<void>;
  ```

- [ ] **Step 1: Write the failing tests.** `buildTapPayload` copies ids from the pass and sets `msSinceTap = nowMs - tapMs`. `sendTap` POSTs JSON to `TAP_ENDPOINT` with `keepalive: true`; it resolves without throwing when `fetchFn` rejects and when it returns a 500.

- [ ] **Step 2: Run to verify failure**
  Run: `npx vitest run tests/tapClient.test.ts`
  Expected: FAIL, cannot resolve `../src/tapClient`.

- [ ] **Step 3: Implement.** One attempt only; no retry.

- [ ] **Step 4: Run to verify pass**
  Run: `npx vitest run tests/tapClient.test.ts && npx tsc --noEmit`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git add src/tapClient.ts tests/tapClient.test.ts && git commit -m "feat: tap payload and one-shot sender"`

---

### Task 4: Netlify function that stores taps

**Files:**
- Create: `netlify/functions/tap.ts`
- Test: `tests/netlify-tap.test.ts`
- Modify: `package.json` (add `@netlify/blobs` as a dependency)

**Interfaces:**
- Consumes: `TapPayload` shape from Task 3; `VIEWPOINTS` from `src/viewpoints.ts` for the id whitelist (the freight function already imports from `src/`).
- Produces:
  ```ts
  export interface TapStore { setJSON(key: string, value: unknown): Promise<void>; }
  export function createHandler(getStore: () => TapStore, now?: () => number):
    (request: Request) => Promise<Response>;
  export default handler; // createHandler wired to @netlify/blobs getStore('taps')
  ```

- [ ] **Step 1: Read Netlify's current Blobs documentation** and confirm the import, `getStore` signature and `setJSON` before writing code. Record the package version installed. If the API differs from the interface above, adapt `TapStore` and say so in the commit message.

- [ ] **Step 2: Write the failing tests** with a fake store that records calls. Cases:
  - A valid POST returns 204 and stores exactly one record whose key starts with `<viewpointId>/<direction>/`.
  - The stored record carries the payload plus `tapAtMs = now() - msSinceTap` and `receivedAtMs = now()`.
  - `OPTIONS` returns 204 with CORS headers; `GET` returns 405.
  - 400 and nothing stored for: invalid JSON; a body over 2 KB; unknown `viewpointId`; `direction` other than north/south; `msSinceTap` negative or over 120000; non-finite numbers; `atViewpoint` outside the three values; `deviceId` not matching `/^[a-z0-9-]{8,64}$/`; `source` outside berth/tfl.
  - A store that throws returns 502 and does not throw.

- [ ] **Step 3: Run to verify failure**
  Run: `npx vitest run tests/netlify-tap.test.ts`
  Expected: FAIL, cannot resolve `../netlify/functions/tap`.

- [ ] **Step 4: Install and implement.** `npm install @netlify/blobs`. Per-device rate limiting is deferred to phase 2, where the aggregation already discards repeat taps; phase 1 relies on the validation above and the 2 KB limit. Key format: `<viewpointId>/<direction>/<receivedAtMs>-<first 8 chars of deviceId>`. Follow `netlify/functions/freight.ts` for response helpers and CORS.

- [ ] **Step 5: Run to verify pass**
  Run: `npx vitest run tests/netlify-tap.test.ts && npx tsc --noEmit && npm run build`
  Expected: PASS, build succeeds.

- [ ] **Step 6: Commit**
  `git add netlify/functions/tap.ts tests/netlify-tap.test.ts package.json package-lock.json && git commit -m "feat: Netlify function that stores taps in Blobs"`

---

### Task 5: Ask card, tap button and thank-you

**Files:**
- Create: `src/tapUi.ts`
- Modify: `src/render.ts` (ViewModel, RenderOptions, `renderDirection`, and the block before the footer)
- Modify: `src/styles.css`
- Test: `tests/tapUi.test.ts`; extend `tests/render.test.ts`

**Interfaces:**
- Consumes: `TapPass`, `levelFor` (Task 1); `AskKind` (Task 2).
- Produces:
  ```ts
  export interface TapDirectionView {
    state: 'none' | 'button' | 'thanks';
    passKey: string | null; destination: string | null;
    /** Set in the 'thanks' state. */
    entry: { tapMs: number; predictedMs: number; tapsBefore: number } | null;
  }
  export interface TapView {
    ask: AskKind; taps: number;
    north: TapDirectionView; south: TapDirectionView;
  }
  export function renderTapSlot(existing: HTMLElement | null, view: TapDirectionView,
    taps: number, onTap: () => void): HTMLElement | null;
  export function renderAskCard(ask: AskKind, taps: number,
    onChoice: (choice: 'helping' | 'declined') => void): HTMLElement | null;
  export function renderTicket(taps: number, justClipped: boolean): HTMLElement;
  ```
  `ViewModel` gains `tap: TapView`. `RenderOptions` gains `onTap: (direction: Direction) => void` and `onHelpChoice: (choice: 'helping' | 'declined') => void`.

- [ ] **Step 1: Write the failing tests** (jsdom). Cases:
  - `renderTapSlot` returns null for `none`; for `button` it returns a button whose text is `<destination> train is passing`; for `thanks` it contains "Booked in. Thank you.", the booked time and predicted time as `HH:MM:SS`, the `registerGapLine` text and the ticket. When `promotionFor(tapsBefore, taps)` is not null it shows "Staff notice", "Promoted to <grade>" and the kit line instead of the plain heading.
  - Called again with the same `passKey` and state, `renderTapSlot` returns the same element (identity), so a press in progress is not lost. A new `passKey` gives a new element.
  - The button calls `onTap` once on `pointerdown` and ignores a second press.
  - `renderAskCard(null, …)` is null. `first` contains "Help make this spot-on" and two controls, "I'll help" and "Not now", each calling `onChoice` with the matching value. `invite` contains "Want to make it more accurate?" and the ticket, and no "Not now".
  - `renderTicket(2, false)` shows the grade "Spotter", four holes of which one is clipped, and an accessible label "Spotter. 1 of 4 taps to Guard"; `renderTicket(75, false)` reads "Station Master" with no holes. `renderTicket(2, true)` marks the newest clipped hole with a class that carries the clip movement.
  - In `render()`: the ask card comes after both `.row` sections and tickers and before `.footer`; with `ask: null` and both directions `none`, the output equals today's (no extra nodes).

- [ ] **Step 2: Run to verify failure**
  Run: `npx vitest run tests/tapUi.test.ts tests/render.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement.** The slot goes inside the direction's `.row`, after the value. Keep the slot element across renders the way strips and the switcher are kept (query for the existing node before clearing, pass it in). Card copy for `first` and `again`: heading "Help make this spot-on"; body "Our timings can be a little out. When the front of a train reaches you, tap its button and we'll tune this spot for everyone." The ticket is a card in the existing palette with the grade in Big Shoulders. Styles use the existing custom properties. The only keyframes are the hole clip (about 300 ms, ease-out, `transform` and `opacity`), wrapped in the same `prefers-reduced-motion` pattern the stylesheet already uses.

- [ ] **Step 4: Run to verify pass**
  Run: `npx vitest run && npx tsc --noEmit`
  Expected: PASS, whole suite.

- [ ] **Step 5: Commit**
  `git add src/tapUi.ts src/render.ts src/styles.css tests/tapUi.test.ts tests/render.test.ts && git commit -m "feat: ask card, per-train tap button, register thank-you and ticket"`

---

### Task 6: Wire it together, About link and privacy

**Files:**
- Modify: `src/main.ts`
- Modify: `public/about.html`, `public/privacy.html`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: State in `main.ts`.** Hold `tapState` (loaded with `safeLocalRead`), one `TapPass | null` per direction, a `thanksUntilMs` per direction, and per direction the last berth step seen (`stepMs`, `trainId`) alongside `berthEtas`. Clear passes and thanks in `switchToViewpoint`.

- [ ] **Step 2: Build the tap view** in `buildViewModel`: for each direction call `updatePass` with the hero; state is `thanks` while `now < thanksUntilMs` (60 s after the tap), with `entry` taken from `tapState.lastTap`, `button` when a pass exists, `buttonsEnabled(tapState)` and `!hasTapped(tapState, passKey(pass))`, otherwise `none`. `ask` is `askKind(tapState, now)`, forced to null when `canOfferTap` is false for both directions.

- [ ] **Step 3: Handlers.** `onTap(direction)`: take `tapMs = Date.now()` first; `recordTap` (with the tap time and the prediction at the tap) and save; set `thanksUntilMs`; `navigator.vibrate?.(30)`; build the payload (source is `berth` when `liveBerthEta` is defined for that direction, else `tfl`; `tflExpectedArrivalMs` from the pass's vehicle in the current snapshot if present) and call `sendTap` without awaiting; rerender. `onHelpChoice`: `chooseHelp`, save, rerender.

- [ ] **Step 4: `?help=1`.** Next to the existing `?reset=walking` handling: apply `resetChoice`, save, strip the parameter.

- [ ] **Step 5: Pages.** About page: a "Help tune this spot" link to `/?help=1` with one sentence of explanation. Privacy page: a short section listing exactly what a tap sends (the fields of `TapPayload`), that no coordinates or account are involved, that the id is random and stored on the device, and that taps are kept for 12 months. Correct any existing statement the new storage makes untrue. The 12-month deletion itself is part of phase 2's daily job, which will exist long before any tap is that old.

- [ ] **Step 6: Verify the whole suite and build**
  Run: `npx vitest run && npx tsc --noEmit && npm run build`
  Expected: PASS.

- [ ] **Step 7: Verify in the browser.** Start the dev server and open East Avenue. Confirm: the ask card is below both panels; "Not now" removes card and buttons; `/?help=1` brings the card back; when a direction's countdown reaches 30 s a button named for that train appears in that panel only; one tap shows the register entry with the ticket clipped one hole further, and the clip moves once and not again on the next redraw; a reload keeps the tap count; Queens Road shows neither card nor button. The POST will 404 under the dev server; confirm that produces no visible error.

- [ ] **Step 8: Commit**
  `git add src/main.ts public/about.html public/privacy.html && git commit -m "feat: wire the tap feature, About link and privacy text"`
