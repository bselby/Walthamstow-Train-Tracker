# Engagement Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four small complementary features on top of the live Walthamstow Train Tracker PWA: walking-time to the bridge, tap-to-toot synth honk, year-round seasonal train overlays, and a next-3-trains live ticker.

**Architecture:** Pure-function core per feature (haversine + formatter; date-to-theme picker; extended arrivals picker) keeps unit-testable logic isolated. Side-effecting modules (Web Audio API synth, Geolocation wrapper) are tested manually. State flows through a renamed `DirectionSnapshots` (plural, array-shaped) so the hero and ticker draw from the same snapshot timestamp. No new network calls beyond the browser's Geolocation API.

**Tech Stack:** Vite + TypeScript (strict), Vitest, Web Audio API, Geolocation API. No new runtime deps.

**Spec:** [docs/superpowers/specs/2026-04-17-engagement-features-design.md](../specs/2026-04-17-engagement-features-design.md)

---

## File structure

### New files

```
src/
├── walkingTime.ts       # haversine + WalkingEstimate + formatter (pure)
├── season.ts            # date → Theme picker (pure)
├── toot.ts              # Web Audio API synth honk (impure, lazy AudioContext)
├── geolocation.ts       # navigator.geolocation watch wrapper (impure)

tests/
├── walkingTime.test.ts
├── season.test.ts
```

### Modified files

```
src/
├── bridge.ts            # + pickNextNPerDirection; existing pickNextPerDirection becomes a wrapper
├── main.ts              # snapshots becomes DirectionSnapshots (plural, arrays); wires walking + ticker
├── render.ts            # + walking-time row above rows; + ticker row below each strip; ViewModel extended
├── strip.ts             # + tap-to-toot handler & wobble; + theme overlays in train SVG
├── styles.css           # + walking-time, + ticker, + train-inner wrapper, + tooting wobble, + theme overlay notes
├── constants.ts         # + EAST_AVE_BRIDGE constant

tests/
├── bridge.test.ts       # + pickNextNPerDirection cases
```

---

## Task 1: Walking-time pure functions

**Files:**
- Create: `src/walkingTime.ts`
- Create: `tests/walkingTime.test.ts`
- Modify: `src/constants.ts`

- [ ] **Step 1: Add constants**

In `src/constants.ts`, append at the end:

```ts
// East Avenue bridge over the Weaver line, between Walthamstow Central and Wood Street.
// Initial best-guess pin; adjust if the "AT THE BRIDGE" state fires in the wrong place.
export const EAST_AVE_BRIDGE = {
  lat: 51.58775,
  lng: -0.01645,
} as const;
```

- [ ] **Step 2: Write failing tests**

Write `tests/walkingTime.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  haversineMetres,
  walkingEstimate,
  formatWalkingLabel,
  WALKING_SPEED_MPS,
} from '../src/walkingTime';

describe('haversineMetres', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMetres({ lat: 51, lng: 0 }, { lat: 51, lng: 0 })).toBe(0);
  });

  it('calculates about 111 km for 1 degree of latitude at the equator', () => {
    const d = haversineMetres({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('calculates known London pair (Westminster → Tower Bridge ≈ 3.4 km)', () => {
    const westminster = { lat: 51.4995, lng: -0.1248 };
    const towerBridge = { lat: 51.5055, lng: -0.0754 };
    const d = haversineMetres(westminster, towerBridge);
    expect(d).toBeGreaterThan(3300);
    expect(d).toBeLessThan(3700);
  });
});

describe('walkingEstimate', () => {
  it('returns metres and seconds = metres / walking speed', () => {
    const est = walkingEstimate({ lat: 51.585, lng: -0.015 }, { lat: 51.58775, lng: -0.01645 });
    expect(est.metres).toBeGreaterThan(0);
    expect(est.seconds).toBeCloseTo(est.metres / WALKING_SPEED_MPS, 5);
  });
});

describe('formatWalkingLabel', () => {
  it('shows "At the bridge" under 50m regardless of seconds', () => {
    expect(formatWalkingLabel({ metres: 30, seconds: 21 })).toBe('At the bridge');
    expect(formatWalkingLabel({ metres: 49.9, seconds: 35 })).toBe('At the bridge');
  });

  it('shows minutes + rounded metres between 50 and 1000m', () => {
    expect(formatWalkingLabel({ metres: 384, seconds: 274 })).toBe('5 min walk · 380 m');
    expect(formatWalkingLabel({ metres: 52, seconds: 37 })).toBe('1 min walk · 50 m');
  });

  it('shows minutes + km above 1000m, one decimal place', () => {
    expect(formatWalkingLabel({ metres: 2345, seconds: 1675 })).toBe('28 min walk · 2.3 km');
    expect(formatWalkingLabel({ metres: 1050, seconds: 750 })).toBe('13 min walk · 1.1 km');
  });

  it('rounds walking minutes up (ceil) so we never overpromise arrival', () => {
    // 61 seconds → 2 minutes (ceil), not 1
    expect(formatWalkingLabel({ metres: 150, seconds: 61 })).toBe('2 min walk · 150 m');
  });
});
```

- [ ] **Step 3: Run, confirm fail**

```bash
npm test
```

Expected: fails with "Cannot find module '../src/walkingTime'".

- [ ] **Step 4: Implement `src/walkingTime.ts`**

```ts
export interface LatLng {
  lat: number;
  lng: number;
}

export interface WalkingEstimate {
  metres: number;
  seconds: number;
}

/** Walking pace in metres per second (~5 km/h — a steady but not rushed adult pace). */
export const WALKING_SPEED_MPS = 1.4;

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two points on Earth's surface, in metres. */
export function haversineMetres(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Estimate metres + seconds to walk from `userPos` to `bridge` at `WALKING_SPEED_MPS`. */
export function walkingEstimate(userPos: LatLng, bridge: LatLng): WalkingEstimate {
  const metres = haversineMetres(userPos, bridge);
  return { metres, seconds: metres / WALKING_SPEED_MPS };
}

/**
 * Human-readable walking label. Case preserved for CSS text-transform to decide.
 *   < 50 m   → "At the bridge"
 *   < 1000 m → "N min walk · M m" (minutes ceil, metres rounded to nearest 10)
 *   ≥ 1000 m → "N min walk · X.X km" (minutes ceil, km rounded to 1 dp)
 */
export function formatWalkingLabel(est: WalkingEstimate): string {
  if (est.metres < 50) return 'At the bridge';
  const minutes = Math.ceil(est.seconds / 60);
  if (est.metres < 1000) {
    const roundedMetres = Math.round(est.metres / 10) * 10;
    return `${minutes} min walk · ${roundedMetres} m`;
  }
  const km = Math.round(est.metres / 100) / 10;
  return `${minutes} min walk · ${km.toFixed(1)} km`;
}
```

- [ ] **Step 5: Run, confirm pass**

```bash
npm test
```

Expected: all tests pass; walkingTime.test.ts adds ~10 new passing tests.

- [ ] **Step 6: Commit**

```bash
git add src/walkingTime.ts src/constants.ts tests/walkingTime.test.ts
git commit -m "feat: add walking-time pure functions + bridge constants"
```

---

## Task 2: Season / theme picker

**Files:**
- Create: `src/season.ts`
- Create: `tests/season.test.ts`

- [ ] **Step 1: Write failing tests**

Write `tests/season.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { currentTheme } from '../src/season';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('currentTheme — boundary dates for every transition', () => {
  it('Jan 15 → winter-ski', () => expect(currentTheme(d(2026, 1, 15))).toBe('winter-ski'));
  it('Feb 28 → winter-ski', () => expect(currentTheme(d(2026, 2, 28))).toBe('winter-ski'));
  it('Feb 29 (leap) → winter-ski', () => expect(currentTheme(d(2024, 2, 29))).toBe('winter-ski'));
  it('Mar 1 → world-book-day', () => expect(currentTheme(d(2026, 3, 1))).toBe('world-book-day'));
  it('Mar 10 → world-book-day', () => expect(currentTheme(d(2026, 3, 10))).toBe('world-book-day'));
  it('Mar 11 → easter', () => expect(currentTheme(d(2026, 3, 11))).toBe('easter'));
  it('Apr 15 → easter', () => expect(currentTheme(d(2026, 4, 15))).toBe('easter'));
  it('Apr 16 → spring', () => expect(currentTheme(d(2026, 4, 16))).toBe('spring'));
  it('Jun 20 → spring', () => expect(currentTheme(d(2026, 6, 20))).toBe('spring'));
  it('Jun 21 → summer', () => expect(currentTheme(d(2026, 6, 21))).toBe('summer'));
  it('Sep 21 → summer', () => expect(currentTheme(d(2026, 9, 21))).toBe('summer'));
  it('Sep 22 → autumn', () => expect(currentTheme(d(2026, 9, 22))).toBe('autumn'));
  it('Oct 23 → autumn', () => expect(currentTheme(d(2026, 10, 23))).toBe('autumn'));
  it('Oct 24 → halloween', () => expect(currentTheme(d(2026, 10, 24))).toBe('halloween'));
  it('Oct 31 → halloween', () => expect(currentTheme(d(2026, 10, 31))).toBe('halloween'));
  it('Nov 1 → bonfire', () => expect(currentTheme(d(2026, 11, 1))).toBe('bonfire'));
  it('Nov 10 → bonfire', () => expect(currentTheme(d(2026, 11, 10))).toBe('bonfire'));
  it('Nov 11 → autumn', () => expect(currentTheme(d(2026, 11, 11))).toBe('autumn'));
  it('Nov 30 → autumn', () => expect(currentTheme(d(2026, 11, 30))).toBe('autumn'));
  it('Dec 1 → christmas', () => expect(currentTheme(d(2026, 12, 1))).toBe('christmas'));
  it('Dec 30 → christmas', () => expect(currentTheme(d(2026, 12, 30))).toBe('christmas'));
  it('Dec 31 → new-year', () => expect(currentTheme(d(2026, 12, 31))).toBe('new-year'));
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test
```

Expected: fails with "Cannot find module '../src/season'".

- [ ] **Step 3: Implement `src/season.ts`**

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

/**
 * Pick the seasonal theme active on `date`. Specific calendar windows (New Year,
 * Halloween, Bonfire Night, World Book Day) are checked before the broader season
 * ranges so they win inside overlapping periods.
 */
export function currentTheme(date: Date): Theme {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  // Specific calendar windows — take priority over the broader seasons below.
  if (month === 12 && day === 31) return 'new-year';
  if (month === 10 && day >= 24) return 'halloween';
  if (month === 11 && day <= 10) return 'bonfire';
  if (month === 3 && day <= 10) return 'world-book-day';

  // Broader seasonal ranges.
  if (month === 12) return 'christmas';                // Dec 1-30 (Dec 31 handled above)
  if (month === 1 || month === 2) return 'winter-ski';
  if (month === 3 && day >= 11) return 'easter';       // Mar 11-31
  if (month === 4 && day <= 15) return 'easter';       // Apr 1-15
  if (month === 4 && day >= 16) return 'spring';       // Apr 16-30
  if (month === 5) return 'spring';
  if (month === 6 && day <= 20) return 'spring';       // Jun 1-20
  if (month === 6 && day >= 21) return 'summer';       // Jun 21-30
  if (month === 7 || month === 8) return 'summer';
  if (month === 9 && day <= 21) return 'summer';       // Sep 1-21
  if (month === 9 && day >= 22) return 'autumn';       // Sep 22-30
  if (month === 10 && day <= 23) return 'autumn';      // Oct 1-23 (24-31 handled above)
  if (month === 11 && day >= 11) return 'autumn';      // Nov 11-30 (1-10 handled above)

  return null;
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test
```

Expected: 21 new season tests pass; total test count increases accordingly.

- [ ] **Step 5: Commit**

```bash
git add src/season.ts tests/season.test.ts
git commit -m "feat: add year-round seasonal theme picker"
```

---

## Task 3: Extend `pickNextNPerDirection`

**Files:**
- Modify: `src/bridge.ts`
- Modify: `tests/bridge.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/bridge.test.ts` (inside the outer module, after the existing describes):

```ts
import { pickNextNPerDirection } from '../src/bridge';

describe('pickNextNPerDirection', () => {
  it('returns up to n entries per direction, sorted ascending by bridge time', () => {
    const arrivals = [
      arrival('Chingford', 300, 'n1'),
      arrival('Chingford', 60, 'n2'),
      arrival('Chingford', 600, 'n3'),
      arrival('Liverpool Street', 200, 's1'),
      arrival('Liverpool Street', 500, 's2'),
    ];
    const result = pickNextNPerDirection(arrivals, 3);
    expect(result.north.map((e) => e.arrival.id)).toEqual(['n2', 'n1', 'n3']);
    expect(result.south.map((e) => e.arrival.id)).toEqual(['s1', 's2']);
  });

  it('caps at n even if more arrivals exist', () => {
    const arrivals = [
      arrival('Chingford', 60, 'n1'),
      arrival('Chingford', 120, 'n2'),
      arrival('Chingford', 180, 'n3'),
      arrival('Chingford', 240, 'n4'),
      arrival('Chingford', 300, 'n5'),
    ];
    expect(pickNextNPerDirection(arrivals, 3).north).toHaveLength(3);
  });

  it('returns empty arrays when direction has no arrivals', () => {
    const arrivals = [arrival('Chingford', 120, 'n1')];
    const result = pickNextNPerDirection(arrivals, 4);
    expect(result.north).toHaveLength(1);
    expect(result.south).toHaveLength(0);
  });

  it('respects the JUST_CROSSED_WINDOW filter', () => {
    const arrivals = [
      arrival('Liverpool Street', -100, 's-gone'),
      arrival('Liverpool Street', 300, 's-ok'),
    ];
    const result = pickNextNPerDirection(arrivals, 3);
    expect(result.south.map((e) => e.arrival.id)).toEqual(['s-ok']);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test
```

Expected: fails with "pickNextNPerDirection is not exported".

- [ ] **Step 3: Implement in `src/bridge.ts`**

Replace the existing `pickNextPerDirection` export with:

```ts
export function pickNextNPerDirection(
  arrivals: Arrival[],
  n: number
): { north: BridgeEvent[]; south: BridgeEvent[] } {
  const events = arrivals
    .map(toEvent)
    .filter((e) => e.bridgeTimeSeconds >= JUST_CROSSED_WINDOW_SECONDS)
    .sort((a, b) => a.bridgeTimeSeconds - b.bridgeTimeSeconds);

  return {
    north: events.filter((e) => e.direction === 'north').slice(0, n),
    south: events.filter((e) => e.direction === 'south').slice(0, n),
  };
}

export function pickNextPerDirection(arrivals: Arrival[]): { north?: BridgeEvent; south?: BridgeEvent } {
  const nexts = pickNextNPerDirection(arrivals, 1);
  return { north: nexts.north[0], south: nexts.south[0] };
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test
```

Expected: all existing bridge tests still pass (`pickNextPerDirection` wrapper keeps the same contract); 4 new `pickNextNPerDirection` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/bridge.ts tests/bridge.test.ts
git commit -m "feat: add pickNextNPerDirection with backward-compatible wrapper"
```

---

## Task 4: Refactor `main.ts` state to arrays

**Files:**
- Modify: `src/main.ts`
- Modify: `src/render.ts`

This task swaps the per-direction snapshot shape from `{ event, snapshottedAtMs }` (single) to `{ events: BridgeEvent[], snapshottedAtMs }` (plural, array). It also extends `ViewModel` with ticker arrays, a walking-time slot (nullable placeholder — filled in Task 8), and a theme slot (filled in Task 6). No visible UI change yet.

- [ ] **Step 1: Extend `ViewModel` in `src/render.ts`**

Replace the `ViewModel` interface declaration with:

```ts
import type { Theme } from './season';

export interface ViewModel {
  north?: BridgeEvent;
  south?: BridgeEvent;
  freshness: FreshnessState;
  error?: string;
  northPos: number | null;
  southPos: number | null;
  celebrate: { north: boolean; south: boolean };
  northTicker: BridgeEvent[];   // entries 1..n (hero is north)
  southTicker: BridgeEvent[];
  walkingLabel: string | null;  // null = feature disabled / not yet available
  theme: Theme;
}
```

Ensure the file imports `Theme` from `./season` (add alongside existing imports).

- [ ] **Step 2: Rewrite `src/main.ts`**

Replace the entire contents with:

```ts
import { fetchArrivals } from './tfl';
import { pickNextNPerDirection } from './bridge';
import type { BridgeEvent } from './bridge';
import { classifyFreshness } from './freshness';
import { startPoller } from './poller';
import { render, type ViewModel } from './render';
import { formatCountdown } from './display';
import { estimatePosition } from './trainPosition';
import { currentTheme } from './season';
import { WALTHAMSTOW_CENTRAL_STOPPOINT_ID, POLL_INTERVAL_MS } from './constants';
import type { Direction } from './direction';

// A small hello for anyone peeking at devtools. One console log, no overhead.
console.log(
  '%c🚂 Walthamstow Train Tracker\n%cBuilt for watching trains with a toddler on the East Avenue bridge.\nSource: github.com/bselby/Walthamstow-Train-Tracker',
  'font: 700 16px system-ui; color: #EE7C0E;',
  'font: 500 12px system-ui; color: #1a2840; line-height: 1.6;'
);

const root = document.getElementById('app')!;

const DIRECTIONS: readonly Direction[] = ['north', 'south'];
const CELEBRATE_DURATION_MS = 1000;
const TICKER_SIZE = 4; // hero + 3 ticker entries

interface DirectionSnapshots {
  events: BridgeEvent[];
  snapshottedAtMs: number;
}

let snapshots: Partial<Record<Direction, DirectionSnapshots>> = {};
let lastFetchMs: number | null = null;
let lastError: string | undefined;
const previousKind: Partial<Record<Direction, string>> = {};
const celebrateSetAt: Partial<Record<Direction, number>> = {};

/** Decrement snapshot[index]'s bridgeTimeSeconds by elapsed seconds since it was fetched. */
function liveEvent(snap: DirectionSnapshots, index: number, nowMs: number): BridgeEvent | undefined {
  const ev = snap.events[index];
  if (!ev) return undefined;
  const elapsedSeconds = (nowMs - snap.snapshottedAtMs) / 1000;
  return { ...ev, bridgeTimeSeconds: ev.bridgeTimeSeconds - elapsedSeconds };
}

/** Live position for snapshot[index] (hero index 0). */
function livePosition(snap: DirectionSnapshots, index: number, nowMs: number): number | null {
  const ev = snap.events[index];
  if (!ev) return null;
  const elapsedSeconds = (nowMs - snap.snapshottedAtMs) / 1000;
  const currentTts = ev.arrival.timeToStation - elapsedSeconds;
  return estimatePosition(currentTts, ev.direction);
}

function buildViewModel(): ViewModel {
  const now = Date.now();

  const heroes: Partial<Record<Direction, BridgeEvent>> = {};
  const positions: Record<Direction, number | null> = { north: null, south: null };
  const tickers: Record<Direction, BridgeEvent[]> = { north: [], south: [] };

  for (const dir of DIRECTIONS) {
    const snap = snapshots[dir];
    if (!snap) continue;
    heroes[dir] = liveEvent(snap, 0, now);
    positions[dir] = livePosition(snap, 0, now);
    // Ticker entries: indices 1..TICKER_SIZE-1, decremented and filtered for non-negative bridge times.
    for (let i = 1; i < TICKER_SIZE; i++) {
      const live = liveEvent(snap, i, now);
      if (live && live.bridgeTimeSeconds >= 0) tickers[dir].push(live);
    }
  }

  // Detect 'now'-state edges for bridge-jiggle celebration (hero only).
  for (const dir of DIRECTIONS) {
    const ev = heroes[dir];
    if (!ev) {
      previousKind[dir] = undefined;
      continue;
    }
    const currentKind = formatCountdown(ev.bridgeTimeSeconds).kind;
    const prev = previousKind[dir];
    if (prev !== 'now' && currentKind === 'now') {
      celebrateSetAt[dir] = now;
    }
    previousKind[dir] = currentKind;
  }

  const celebrate: ViewModel['celebrate'] = { north: false, south: false };
  for (const dir of DIRECTIONS) {
    const setAt = celebrateSetAt[dir];
    if (setAt !== undefined && now - setAt < CELEBRATE_DURATION_MS) {
      celebrate[dir] = true;
    }
  }

  return {
    north: heroes.north,
    south: heroes.south,
    freshness: classifyFreshness(lastFetchMs, now),
    error: lastFetchMs === null ? lastError : undefined,
    northPos: positions.north,
    southPos: positions.south,
    celebrate,
    northTicker: tickers.north,
    southTicker: tickers.south,
    walkingLabel: null,            // wired up in Task 8
    theme: currentTheme(new Date()),
  };
}

function rerender(): void {
  render(root, buildViewModel());
}

async function tick(): Promise<void> {
  try {
    const arrivals = await fetchArrivals(WALTHAMSTOW_CENTRAL_STOPPOINT_ID);
    const picked = pickNextNPerDirection(arrivals, TICKER_SIZE);
    const now = Date.now();
    snapshots = {
      north: picked.north.length > 0 ? { events: picked.north, snapshottedAtMs: now } : undefined,
      south: picked.south.length > 0 ? { events: picked.south, snapshottedAtMs: now } : undefined,
    };
    lastFetchMs = now;
    lastError = undefined;
  } catch (err) {
    lastError = err instanceof Error ? err.message : 'Network error — check connection';
  }
  rerender();
}

setInterval(rerender, 1000);
startPoller(tick, POLL_INTERVAL_MS);
```

- [ ] **Step 3: Run tests — confirm no regressions**

```bash
npm test
```

Expected: all tests still pass. Test count unchanged by this task.

- [ ] **Step 4: Build — confirm clean**

```bash
npm run build
```

Expected: exit 0 with no TS errors.

- [ ] **Step 5: Dev-server smoke check**

```bash
npm run dev &
DEV_PID=$!
sleep 4
curl -s http://localhost:5173/ | grep -c '<main id="app"'
kill $DEV_PID 2>/dev/null || true
wait $DEV_PID 2>/dev/null || true
```

Expected: 1.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/render.ts
git commit -m "feat: refactor state to array-shaped DirectionSnapshots + extend ViewModel"
```

---

## Task 5: Render ticker rows

**Files:**
- Modify: `src/render.ts`
- Modify: `src/styles.css`

Adds a small ticker row under each direction's strip.

- [ ] **Step 1: Add ticker rendering to `src/render.ts`**

In `src/render.ts`, add this helper function near `renderDirection`:

```ts
function renderTicker(events: BridgeEvent[]): HTMLElement | null {
  if (events.length === 0) return null;

  const row = document.createElement('div');
  row.className = 'ticker';

  const prefix = document.createElement('span');
  prefix.className = 'ticker-prefix';
  prefix.textContent = 'Then';
  row.appendChild(prefix);

  events.forEach((ev, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'ticker-sep';
      sep.textContent = '·';
      row.appendChild(sep);
    }
    const val = document.createElement('span');
    val.className = 'ticker-value';
    const mins = Math.max(0, Math.floor(ev.bridgeTimeSeconds / 60));
    // Only the LAST value gets the "min" suffix so the row doesn't shout "MIN · MIN · MIN".
    val.textContent = i === events.length - 1 ? `${mins} min` : `${mins}`;
    row.appendChild(val);
  });

  return row;
}
```

Then in `render()`, replace the block that appends the northbound row+strip and southbound row+strip with:

```ts
    // Northbound: row, strip, ticker
    root.appendChild(renderDirection('→ Chingford', vm.north));
    const stripN = renderDirectionStrip(existingStripN, {
      direction: 'north',
      pos: vm.northPos,
      celebrate: vm.celebrate.north,
    });
    root.appendChild(stripN);
    const tickerN = renderTicker(vm.northTicker);
    if (tickerN) root.appendChild(tickerN);

    // Southbound: row, strip, ticker
    root.appendChild(renderDirection('← Walthamstow Central', vm.south));
    const stripS = renderDirectionStrip(existingStripS, {
      direction: 'south',
      pos: vm.southPos,
      celebrate: vm.celebrate.south,
    });
    root.appendChild(stripS);
    const tickerS = renderTicker(vm.southTicker);
    if (tickerS) root.appendChild(tickerS);
```

- [ ] **Step 2: Add ticker CSS to `src/styles.css`**

Append to the end of `src/styles.css`:

```css
/* ───── Ticker rows ───── */

.ticker {
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: 0.5rem;
  padding-top: 0.2rem;
  font-family: 'Big Shoulders Text', sans-serif;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--ink);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.ticker-prefix {
  color: var(--overground);
  font-weight: 800;
}

.ticker-sep {
  color: var(--overground);
}

/* Tighter vertical rhythm so strip → ticker reads as one unit */
.strip + .ticker {
  margin-top: -0.25rem;
}
.ticker + .row {
  margin-top: clamp(0.75rem, 3vw, 1.75rem);
}
```

- [ ] **Step 3: Run tests + build**

```bash
npm test && npm run build
```

Expected: all tests pass, build exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/render.ts src/styles.css
git commit -m "feat: render next-3-trains ticker row below each strip"
```

---

## Task 6: Theme overlays on the trains

**Files:**
- Modify: `src/strip.ts`
- Modify: `src/styles.css`

Conditionally inject a seasonal SVG `<g>` inside each train SVG based on today's date.

- [ ] **Step 1: Extend `src/strip.ts` with theme overlays**

At the top of `src/strip.ts`, add the import:

```ts
import { currentTheme, type Theme } from './season';
```

Then, after the `TRAIN_SVG` constant, add the theme-overlay map:

```ts
type NonNullTheme = Exclude<Theme, null>;

const THEME_OVERLAYS: Record<NonNullTheme, string> = {
  'winter-ski': `
    <g class="theme-overlay">
      <rect x="15" y="0.3" width="14" height="3.5" fill="#c13838" rx="0.6"/>
      <rect x="15" y="3" width="14" height="1" fill="#f4f4f7"/>
      <circle cx="22" cy="-0.3" r="1.3" fill="#f4f4f7"/>
    </g>
  `,
  'world-book-day': `
    <g class="theme-overlay">
      <rect x="18" y="0.6" width="10" height="3.4" fill="#2f4ea0" rx="0.3"/>
      <rect x="19" y="1.2" width="8" height="0.3" fill="#f4f4f7"/>
      <rect x="19" y="2.0" width="8" height="0.3" fill="#f4f4f7"/>
      <rect x="19" y="2.8" width="8" height="0.3" fill="#f4f4f7"/>
      <rect x="17.8" y="0.6" width="0.4" height="3.4" fill="#1a2840"/>
    </g>
  `,
  easter: `
    <g class="theme-overlay">
      <ellipse cx="18.5" cy="-0.5" rx="1.2" ry="4" fill="#f4f4f7" stroke="#a65c8a" stroke-width="0.4"/>
      <ellipse cx="22.5" cy="-0.5" rx="1.2" ry="4" fill="#f4f4f7" stroke="#a65c8a" stroke-width="0.4"/>
      <ellipse cx="18.5" cy="0" rx="0.4" ry="2.2" fill="#ffb6d0"/>
      <ellipse cx="22.5" cy="0" rx="0.4" ry="2.2" fill="#ffb6d0"/>
    </g>
  `,
  spring: `
    <g class="theme-overlay">
      <circle cx="44" cy="3.8" r="1.1" fill="#ff9ec7"/>
      <circle cx="45.4" cy="2.8" r="1.1" fill="#ff9ec7"/>
      <circle cx="46.4" cy="4.2" r="1.1" fill="#ff9ec7"/>
      <circle cx="44.6" cy="5.1" r="1.1" fill="#ff9ec7"/>
      <circle cx="45.3" cy="4" r="0.5" fill="#ffd23f"/>
    </g>
  `,
  summer: `
    <g class="theme-overlay">
      <rect x="40" y="7.5" width="3.2" height="2.2" fill="#0a0a0f" rx="0.3"/>
      <rect x="44" y="7.5" width="3.2" height="2.2" fill="#0a0a0f" rx="0.3"/>
      <rect x="43.2" y="8" width="0.8" height="0.5" fill="#0a0a0f"/>
    </g>
  `,
  autumn: `
    <g class="theme-overlay">
      <path d="M 22 -0.5 Q 19 -1.5 17.5 0.5 Q 19.5 -0.5 20.5 1.5 Q 18.8 2.5 19.5 3.5 Q 21 2.5 22 3.2 Q 22 1 22 -0.5 Z" fill="#d97748"/>
      <path d="M 22 1.2 L 22 3.6" stroke="#7a3a1a" stroke-width="0.3" stroke-linecap="round"/>
    </g>
  `,
  halloween: `
    <g class="theme-overlay">
      <ellipse cx="22" cy="1.5" rx="3.5" ry="2.8" fill="#ef6c1a"/>
      <path d="M 22 1 L 22 4" stroke="#b6460e" stroke-width="0.4"/>
      <rect x="21.7" y="-1" width="0.8" height="2.2" fill="#3b5a2a"/>
      <path d="M 20.2 1.5 L 21 1 L 21.8 1.5 Z" fill="#0a0a0f"/>
      <path d="M 22.2 1.5 L 23 1 L 23.8 1.5 Z" fill="#0a0a0f"/>
      <path d="M 20.5 2.5 Q 22 3.2 23.5 2.5" stroke="#0a0a0f" stroke-width="0.4" fill="none"/>
    </g>
  `,
  bonfire: `
    <g class="theme-overlay">
      <circle cx="22" cy="-3" r="0.6" fill="#ffd23f"/>
      <line x1="22" y1="-5.5" x2="22" y2="-3.8" stroke="#ffd23f" stroke-width="0.4"/>
      <line x1="18.8" y1="-4.5" x2="20.8" y2="-3.3" stroke="#ff6b35" stroke-width="0.4"/>
      <line x1="25.2" y1="-4.5" x2="23.2" y2="-3.3" stroke="#ff6b35" stroke-width="0.4"/>
      <line x1="22" y1="-1.8" x2="22" y2="0" stroke="#ffd23f" stroke-width="0.4"/>
      <line x1="17.5" y1="-2" x2="19.5" y2="-1.8" stroke="#ffd23f" stroke-width="0.4"/>
      <line x1="26.5" y1="-2" x2="24.5" y2="-1.8" stroke="#ffd23f" stroke-width="0.4"/>
    </g>
  `,
  christmas: `
    <g class="theme-overlay">
      <path d="M 17 4 L 27 4 L 23 -3 Q 22 -4 21 -3 Z" fill="#c13838"/>
      <rect x="17" y="3" width="10" height="1.2" fill="#f4f4f7"/>
      <circle cx="22" cy="-3.5" r="1.1" fill="#f4f4f7"/>
    </g>
  `,
  'new-year': `
    <g class="theme-overlay">
      <path d="M 18 4 L 26 4 L 22 -5 Z" fill="#ffd23f"/>
      <rect x="18" y="3.4" width="8" height="0.7" fill="#c13838"/>
      <circle cx="15" cy="-2" r="0.35" fill="#ffd23f"/>
      <circle cx="29" cy="-1" r="0.35" fill="#ffd23f"/>
      <circle cx="14" cy="1" r="0.35" fill="#c13838"/>
      <circle cx="30" cy="2" r="0.35" fill="#c13838"/>
    </g>
  `,
};
```

Then modify `buildSkeleton` to inject the overlay into each train SVG after creation. Find the section that creates `trainN` and `trainS` and replace with:

```ts
  const theme = currentTheme(new Date());
  const trainN = createTrainElement('north', theme);
  container.appendChild(trainN);

  const trainS = createTrainElement('south', theme);
  container.appendChild(trainS);
```

Add a helper function to the file:

```ts
function createTrainElement(direction: Direction, theme: Theme): HTMLElement {
  const el = document.createElement('div');
  el.className = `strip-train strip-train-${direction}`;
  el.style.setProperty('--pos', direction === 'north' ? '0' : '8');

  // Inner wrapper so we can animate a toot-wobble scale (in Task 7) without
  // overwriting the outer translate positioning.
  const inner = document.createElement('div');
  inner.className = 'strip-train-inner';

  let svg = TRAIN_SVG;
  if (theme !== null) {
    // Inject the overlay right before the closing </svg> tag.
    svg = svg.replace('</svg>', `${THEME_OVERLAYS[theme]}</svg>`);
  }
  inner.innerHTML = svg;

  el.appendChild(inner);
  return el;
}
```

- [ ] **Step 2: Update CSS for train-inner wrapper in `src/styles.css`**

Find the existing `.strip-train-svg` block and the `.strip-train-south .strip-train-svg` mirror rule. Replace the relevant block with:

```css
.strip-train-inner {
  width: 100%;
  height: 100%;
  display: block;
}

.strip-train-svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

/* Northbound (→ Chingford): train faces right as authored.
   Southbound (← Liverpool Street): mirror horizontally. */
.strip-south .strip-train-svg {
  transform: scaleX(-1);
}
```

- [ ] **Step 3: Run tests + build**

```bash
npm test && npm run build
```

Expected: all pass, no CSS parse errors.

- [ ] **Step 4: Commit**

```bash
git add src/strip.ts src/styles.css
git commit -m "feat: year-round seasonal train overlays"
```

---

## Task 7: Tap-to-toot

**Files:**
- Create: `src/toot.ts`
- Modify: `src/strip.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Create `src/toot.ts`**

```ts
// Web Audio API synth honk. Two-tone triangle oscillators (220 Hz + 293 Hz ≈ perfect
// fourth, classic two-tone EMU horn), short attack/decay. Lazy AudioContext so we
// only construct it when the user actually taps — browsers require a user gesture.

let ctx: AudioContext | null = null;

export function toot(): void {
  if (!ctx) {
    const AudioCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return; // older browser — silently no-op
    ctx = new AudioCtor();
  }
  if (ctx.state === 'suspended') ctx.resume();

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.01);         // 10 ms attack
  gain.gain.setValueAtTime(0.25, now + 0.16);                   // hold 150 ms
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);   // 200 ms decay
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

- [ ] **Step 2: Wire tap handlers in `src/strip.ts`**

At the top of the file, add:

```ts
import { toot } from './toot';
```

Extend `createTrainElement` (added in Task 6) to attach the tap handler:

```ts
function createTrainElement(direction: Direction, theme: Theme): HTMLElement {
  const el = document.createElement('div');
  el.className = `strip-train strip-train-${direction}`;
  el.style.setProperty('--pos', direction === 'north' ? '0' : '8');

  const inner = document.createElement('div');
  inner.className = 'strip-train-inner';

  let svg = TRAIN_SVG;
  if (theme !== null) {
    svg = svg.replace('</svg>', `${THEME_OVERLAYS[theme]}</svg>`);
  }
  inner.innerHTML = svg;

  el.appendChild(inner);

  // Tap to toot — emits a synth honk and triggers the wobble class.
  el.addEventListener('click', () => {
    toot();
    el.classList.remove('tooting');
    void el.offsetWidth; // restart animation
    el.classList.add('tooting');
  });

  return el;
}
```

- [ ] **Step 3: Add wobble CSS to `src/styles.css`**

Append to the end:

```css
/* Tap-to-toot wobble — applied briefly to the train when tapped. Animates the
   inner wrapper so it doesn't fight the outer translate positioning. */
.strip-train.tooting .strip-train-inner {
  animation: train-toot 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes train-toot {
  0%   { transform: scale(1); }
  35%  { transform: scale(1.14); }
  100% { transform: scale(1); }
}
```

Also extend the `prefers-reduced-motion` block — find the existing `@media (prefers-reduced-motion: reduce) { … }` and add `.strip-train.tooting .strip-train-inner` to the list of animations disabled:

```css
@media (prefers-reduced-motion: reduce) {
  .strip-train {
    transition: none;
  }
  .strip-bridge.celebrating .strip-bridge-svg,
  .strip-pip.pulsing .strip-pip-dot,
  .strip-train.tooting .strip-train-inner,
  .value.now,
  .value.ticking {
    animation: none;
  }
}
```

(Replace the existing block entirely if it's simpler than editing in place.)

Also make trains visibly tap-targetable (small cursor hint):

```css
.strip-train {
  cursor: pointer;
}
```

Add this inside the existing `.strip-train { … }` block (not as a new rule).

- [ ] **Step 4: Build and tests**

```bash
npm test && npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/toot.ts src/strip.ts src/styles.css
git commit -m "feat: tap-to-toot synth honk with train wobble"
```

---

## Task 8: Walking-time to bridge

**Files:**
- Create: `src/geolocation.ts`
- Modify: `src/main.ts`
- Modify: `src/render.ts`
- Modify: `src/styles.css`

Adds the opt-in walking-time row under the Weaver Line header.

- [ ] **Step 1: Create `src/geolocation.ts`**

```ts
import type { LatLng } from './walkingTime';

export type GeolocationStatus = 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable';

export interface GeolocationState {
  status: GeolocationStatus;
  position: LatLng | null;
}

type Listener = (state: GeolocationState) => void;

let watchId: number | null = null;
let currentState: GeolocationState = { status: 'idle', position: null };
const listeners = new Set<Listener>();

function emit(next: GeolocationState) {
  currentState = next;
  for (const fn of listeners) fn(currentState);
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn(currentState);
  return () => listeners.delete(fn);
}

export function getState(): GeolocationState {
  return currentState;
}

/** Start watching the user's position. Safe to call multiple times — noop if already watching. */
export function start(): void {
  if (watchId !== null) return;
  if (!('geolocation' in navigator)) {
    emit({ status: 'unavailable', position: null });
    return;
  }
  emit({ status: 'locating', position: currentState.position });

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      emit({
        status: 'granted',
        position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      });
    },
    (err) => {
      const status: GeolocationStatus =
        err.code === err.PERMISSION_DENIED ? 'denied' : 'locating';
      emit({ status, position: currentState.position });
    },
    { enableHighAccuracy: false, maximumAge: 20_000, timeout: 15_000 }
  );
}

/** Stop watching. Safe to call multiple times. */
export function stop(): void {
  if (watchId !== null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(watchId);
  }
  watchId = null;
}
```

- [ ] **Step 2: Wire walking-time state into `src/main.ts`**

At the top of `src/main.ts`, add these imports (next to the existing ones):

```ts
import { subscribe as subscribeLocation, start as startLocation, stop as stopLocation, getState as getLocationState } from './geolocation';
import { walkingEstimate, formatWalkingLabel } from './walkingTime';
import { EAST_AVE_BRIDGE } from './constants';
```

Add module-level state near the existing snapshots declarations:

```ts
const WALKING_STORAGE_KEY = 'wtt_walking_enabled';
let walkingEnabled = typeof localStorage !== 'undefined' && localStorage.getItem(WALKING_STORAGE_KEY) === '1';
```

Replace the `walkingLabel: null` line in `buildViewModel` with:

```ts
    walkingLabel: computeWalkingLabel(),
```

And add this helper function right above `buildViewModel`:

```ts
function computeWalkingLabel(): string | null {
  if (!walkingEnabled) return null;
  const { status, position } = getLocationState();
  if (status === 'unavailable') return null;
  if (status === 'denied') return 'Location unavailable';
  if (status === 'locating' || position === null) return 'Locating…';
  const est = walkingEstimate(position, EAST_AVE_BRIDGE);
  return formatWalkingLabel(est);
}
```

Add a public function main.ts can call when the user taps the enable button (export it so render.ts can import it):

```ts
export function enableWalkingTime(): void {
  walkingEnabled = true;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(WALKING_STORAGE_KEY, '1');
  }
  startLocation();
}
```

Start the geolocation watch on load if already enabled. At the bottom of `main.ts` (before `setInterval(rerender, 1000)`) add:

```ts
if (walkingEnabled) startLocation();

// Re-render whenever the geolocation state changes so the walking label
// reflects locating → granted → position transitions.
subscribeLocation(() => rerender());

// Pause location watching when the tab is hidden; restart when visible.
document.addEventListener('visibilitychange', () => {
  if (!walkingEnabled) return;
  if (document.visibilityState === 'visible') startLocation();
  else stopLocation();
});
```

- [ ] **Step 3: Render the walking-time row in `src/render.ts`**

Do NOT import from `./main` — that would create a circular dependency. Instead, the `render()` function accepts a callback via an options object. The caller (main.ts) wires its local `enableWalkingTime` through.

Add this interface export near `ViewModel`:

```ts
export interface RenderOptions {
  onEnableWalkingTime: () => void;
}
```

Update the `render` function signature from:

```ts
export function render(root: HTMLElement, vm: ViewModel): void {
```

to:

```ts
export function render(root: HTMLElement, vm: ViewModel, options: RenderOptions): void {
```

Then, right after the preserved-header block in `render()`, append the walking-time row builder:

```ts
  if (existingHeader) root.appendChild(existingHeader);

  // Walking-time row immediately below the header (only when we're showing rows,
  // not in the error-only state — same treatment as the rows themselves).
  if (vm.freshness.state !== 'no-data' || !vm.error) {
    root.appendChild(renderWalkingTime(vm.walkingLabel, options.onEnableWalkingTime));
  }
```

Add the helper function:

```ts
const PIN_SVG = '<svg class="walking-icon" viewBox="0 0 10 13" aria-hidden="true"><path d="M5 0C2 0 0 2 0 5c0 3 5 8 5 8s5-5 5-8c0-3-2-5-5-5Zm0 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" fill="currentColor"/></svg>';

function renderWalkingTime(label: string | null, onEnable: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'walking-time';

  if (label === null) {
    el.classList.add('walking-time-enable');
    el.innerHTML = `${PIN_SVG}<span>Enable walking time</span>`;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.addEventListener('click', onEnable);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onEnable();
      }
    });
  } else {
    el.innerHTML = `${PIN_SVG}<span>${escapeHtml(label)}</span>`;
  }

  return el;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}
```

Finally, update `src/main.ts`'s `rerender()` function to pass the options object:

```ts
function rerender(): void {
  render(root, buildViewModel(), { onEnableWalkingTime: enableWalkingTime });
}
```

- [ ] **Step 4: Add walking-time CSS to `src/styles.css`**

Append:

```css
/* ───── Walking time row ───── */

.walking-time {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding-bottom: 0.25rem;
  font-family: 'Big Shoulders Text', sans-serif;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.walking-time-enable {
  color: var(--overground);
  cursor: pointer;
  user-select: none;
}

.walking-time-enable:focus-visible {
  outline: 2px solid var(--overground);
  outline-offset: 2px;
  border-radius: 2px;
}

.walking-icon {
  width: 9px;
  height: 12px;
  flex-shrink: 0;
  color: var(--overground);
  display: block;
}
```

- [ ] **Step 5: Test + build**

```bash
npm test && npm run build
```

Expected: pass + exit 0.

- [ ] **Step 6: Dev server + manual smoke**

```bash
npm run dev &
DEV_PID=$!
sleep 4
curl -s http://localhost:5173/ | grep -c '<header class="page-header"'
kill $DEV_PID 2>/dev/null || true
wait $DEV_PID 2>/dev/null || true
```

Expected: 1 (header still there; walking row is rendered by JS, not in the HTML stub).

- [ ] **Step 7: Commit**

```bash
git add src/geolocation.ts src/main.ts src/render.ts src/styles.css
git commit -m "feat: walking time to bridge with opt-in geolocation"
```

---

## Task 9: Verify and deploy

- [ ] **Step 1: Full test + build + bundle-size sanity**

```bash
npm test
```

Expected: all tests pass (previous 56 + 10 new walkingTime + 21 new season + 4 new bridge = 91 total).

```bash
npm run build
```

Expected: exit 0. Inspect the dist summary — JS should be under ~5 KB gzipped, CSS under 2 KB gzipped.

- [ ] **Step 2: Dev-server end-to-end smoke**

```bash
npm run dev &
DEV_PID=$!
sleep 4
curl -s http://localhost:5173/ | grep -c '<title>Walthamstow Trains</title>'
curl -s http://localhost:5173/src/main.ts | grep -c "enableWalkingTime"
curl -s http://localhost:5173/src/strip.ts | grep -c "toot"
curl -s http://localhost:5173/src/strip.ts | grep -c "THEME_OVERLAYS"
kill $DEV_PID 2>/dev/null || true
wait $DEV_PID 2>/dev/null || true
```

Expected: all counts ≥ 1.

- [ ] **Step 3: Push to main and poll Netlify**

```bash
git push origin main
```

```bash
SITE_ID="ade8ca45-bd3e-4a6f-8f3d-cadae3e8ec97"
for i in 1 2 3 4 5; do
  sleep 20
  STATE=$(npx -y netlify-cli api listSiteDeploys --data "{\"site_id\":\"$SITE_ID\",\"per_page\":1}" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin)[0]; print(f\"{d['state']}|{d['commit_ref'][:8]}\")" 2>/dev/null)
  echo "[$((i*20))s] $STATE"
  case "$STATE" in
    ready*) echo "DEPLOYED"; break ;;
    error*) echo "FAILED"; break ;;
  esac
done
```

Expected: "DEPLOYED" within ~40s.

- [ ] **Step 4: Live site contains new features**

```bash
CSSURL=$(curl -s https://walthamstow-train-tracker.netlify.app/ | grep -o 'assets/index-[^"]*.css' | head -1)
curl -s "https://walthamstow-train-tracker.netlify.app/$CSSURL" | grep -oE '(walking-time|ticker|train-toot)' | sort -u
# Expected: all three classes present
```

- [ ] **Step 5: Hand off to the human user for visual verification**

Report back to the user, asking them to:

1. Refresh the URL on their phone. Confirm the strip still looks correct and the new ticker row appears below each direction's strip.
2. Tap "Enable walking time" at the top. Grant permission. Confirm a "…MIN WALK · …M" label appears and updates as they move.
3. Tap one of the trains on the strip. Confirm a soft honk plays and the train briefly wobbles.
4. Verify today's seasonal theme overlay appears on both trains (whichever one is active on the current date).

This is visual / device-level verification that Claude cannot do from the CLI.

---

## Self-review notes

**Spec coverage:**
- ✅ Walking time feature — Task 8 (geolocation wrapper, main.ts wiring, render row, CSS) + Task 1 (pure math)
- ✅ Tap-to-toot — Task 7 (toot.ts, handler in strip.ts, wobble CSS)
- ✅ Seasonal themes — Task 6 (THEME_OVERLAYS, createTrainElement theme injection) + Task 2 (picker)
- ✅ Next-3 ticker — Task 5 (rendering) + Task 4 (state refactor to arrays) + Task 3 (pickNextNPerDirection)
- ✅ `DirectionSnapshots` rename + array-based storage — Task 4
- ✅ `prefers-reduced-motion` extends to new animations — Task 7
- ✅ Bridge coordinates + constants — Task 1

**Type consistency check:**
- `LatLng` defined once in `walkingTime.ts`, imported in `geolocation.ts`
- `Theme` defined once in `season.ts`, imported by `render.ts` and `strip.ts`
- `BridgeEvent` unchanged
- `DirectionSnapshots` new plural name used consistently in `main.ts`
- `ViewModel` extension additive; existing consumers unaffected

**Placeholder scan:**
- No "TBD" or "add appropriate X"
- All code blocks are complete and copy-pasteable
- Edge cases covered: no trains (ticker hidden), permission denied (label), fewer than 3 ticker entries (renders what's there)

**Bundle impact sanity:** new code is ~200 lines TS + ~70 lines CSS + ~100 lines inline SVG overlay strings ≈ 2 KB gzipped conservatively. Leaves plenty of headroom under the < 20 KB target set in the original MVP.

**Known caveats noted in the spec and carried forward:**
- Bridge lat/lng is eyeballed; adjust if "At the bridge" fires in the wrong place.
- World Book Day / Easter dates are approximated by broad ranges.
- Seasonal SVG overlays are drafts; visual polish may need iteration after first install.
- `DirectionSnapshots` rename is internal; no tests cover `main.ts` directly, so nothing breaks.
