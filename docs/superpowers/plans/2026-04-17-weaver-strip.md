# Weaver Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a whimsical horizontal train-position strip to the live Walthamstow Train Tracker PWA, showing the Chingford-branch stops with cartoon SVG trains gliding toward an East Avenue bridge landmark — without adding any new network calls.

**Architecture:** Pure-function core (`stops`, `trainPosition`) feeds a view-model extension that snapshots each tick's `timeToStation` and locally decrements it every second, producing a live floating-point position. A new `strip` DOM module creates static markup on first call and mutates CSS custom properties on subsequent calls so CSS transitions drive the glide. Bridge jiggle is a class toggle triggered by edge-detecting the countdown's transition into the `'now'` state.

**Tech Stack:** Vite + TypeScript (strict), Vitest, no new runtime deps. All CSS is hand-written to match the existing dark palette.

**Spec:** [docs/superpowers/specs/2026-04-17-weaver-strip-design.md](../specs/2026-04-17-weaver-strip-design.md)

---

## File structure

### New files

```
src/
├── stops.ts            # ordered stop list + inter-station travel-time segments
├── trainPosition.ts    # pure estimatePosition(tts, direction) → number | null
└── strip.ts            # renderStrip() — creates skeleton on first call, mutates attrs thereafter

tests/
├── stops.test.ts       # sanity: 9 stops, WC at index 5, segments have correct totals
└── trainPosition.test.ts  # all cases from spec
```

### Modified files

```
src/
├── main.ts             # rework state to snapshot timestamps, decrement tts locally each rerender,
│                       # compute position, detect 'now' edge for celebrate flag
├── render.ts           # ViewModel gains northPos/southPos/celebrate; calls renderStrip()
│                       # (NOTE: accept decremented BridgeEvent so countdown ticks between polls too)
└── styles.css          # strip layout + pips + bridge + train SVG styling + animations
```

No test changes for `main.ts`, `render.ts`, `strip.ts` — they're side-effecting glue verified manually. Unit-tested modules are the pure ones (`stops`, `trainPosition`).

---

## Task 1: Stops data and helpers

**Files:**
- Create: `src/stops.ts`
- Create: `tests/stops.test.ts`

- [ ] **Step 1: Write failing test for stops data**

Write `tests/stops.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  STOPS,
  WC_INDEX,
  SEGMENTS_NORTH_OF_WC,
  SEGMENTS_SOUTH_OF_WC,
  getStop,
} from '../src/stops';

describe('STOPS', () => {
  it('has 9 stops in order, indexed 0..8', () => {
    expect(STOPS).toHaveLength(9);
    STOPS.forEach((stop, i) => {
      expect(stop.index).toBe(i);
    });
  });

  it('has Liverpool Street at index 0 and Chingford at index 8', () => {
    expect(STOPS[0].fullName).toBe('Liverpool Street');
    expect(STOPS[0].abbrev).toBe('Liv');
    expect(STOPS[8].fullName).toBe('Chingford');
    expect(STOPS[8].abbrev).toBe('Chg');
  });

  it('has Walthamstow Central at the WC_INDEX (5)', () => {
    expect(WC_INDEX).toBe(5);
    expect(STOPS[WC_INDEX].fullName).toBe('Walthamstow Central');
    expect(STOPS[WC_INDEX].abbrev).toBe('WC');
  });
});

describe('segments', () => {
  it('SEGMENTS_NORTH_OF_WC covers WC→Wds→Hig→Chg totalling 420s', () => {
    const total = SEGMENTS_NORTH_OF_WC.reduce((sum, s) => sum + s.seconds, 0);
    expect(total).toBe(420);
    expect(SEGMENTS_NORTH_OF_WC[0].nearIndex).toBe(5);
    expect(SEGMENTS_NORTH_OF_WC[SEGMENTS_NORTH_OF_WC.length - 1].farIndex).toBe(8);
  });

  it('SEGMENTS_SOUTH_OF_WC covers WC→StJ→Clp→Hck→Bth→Liv totalling 720s', () => {
    const total = SEGMENTS_SOUTH_OF_WC.reduce((sum, s) => sum + s.seconds, 0);
    expect(total).toBe(720);
    expect(SEGMENTS_SOUTH_OF_WC[0].nearIndex).toBe(5);
    expect(SEGMENTS_SOUTH_OF_WC[SEGMENTS_SOUTH_OF_WC.length - 1].farIndex).toBe(0);
  });
});

describe('getStop', () => {
  it('returns the stop at a valid index', () => {
    expect(getStop(5)?.abbrev).toBe('WC');
  });

  it('returns undefined for an out-of-range index', () => {
    expect(getStop(-1)).toBeUndefined();
    expect(getStop(9)).toBeUndefined();
    expect(getStop(5.5)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

```bash
npm test
```

Expected: fails with "Cannot find module '../src/stops'".

- [ ] **Step 3: Implement `src/stops.ts`**

```ts
export interface Stop {
  index: number;
  fullName: string;
  abbrev: string;
}

export interface Segment {
  nearIndex: number;
  farIndex: number;
  seconds: number;
}

export const STOPS: readonly Stop[] = [
  { index: 0, fullName: 'Liverpool Street', abbrev: 'Liv' },
  { index: 1, fullName: 'Bethnal Green', abbrev: 'Bth' },
  { index: 2, fullName: 'Hackney Downs', abbrev: 'Hck' },
  { index: 3, fullName: 'Clapton', abbrev: 'Clp' },
  { index: 4, fullName: 'St James Street', abbrev: 'StJ' },
  { index: 5, fullName: 'Walthamstow Central', abbrev: 'WC' },
  { index: 6, fullName: 'Wood Street', abbrev: 'Wds' },
  { index: 7, fullName: 'Highams Park', abbrev: 'Hig' },
  { index: 8, fullName: 'Chingford', abbrev: 'Chg' },
];

export const WC_INDEX = 5;

// Segments from WC going north — used for southbound trains (which approach WC from the north).
export const SEGMENTS_NORTH_OF_WC: readonly Segment[] = [
  { nearIndex: 5, farIndex: 6, seconds: 120 }, // WC ↔ Wds
  { nearIndex: 6, farIndex: 7, seconds: 120 }, // Wds ↔ Hig
  { nearIndex: 7, farIndex: 8, seconds: 180 }, // Hig ↔ Chg
];

// Segments from WC going south — used for northbound trains (which approach WC from the south).
export const SEGMENTS_SOUTH_OF_WC: readonly Segment[] = [
  { nearIndex: 5, farIndex: 4, seconds: 120 }, // WC ↔ StJ
  { nearIndex: 4, farIndex: 3, seconds: 180 }, // StJ ↔ Clp
  { nearIndex: 3, farIndex: 2, seconds: 120 }, // Clp ↔ Hck
  { nearIndex: 2, farIndex: 1, seconds: 180 }, // Hck ↔ Bth
  { nearIndex: 1, farIndex: 0, seconds: 120 }, // Bth ↔ Liv
];

export function getStop(index: number): Stop | undefined {
  if (!Number.isInteger(index)) return undefined;
  return STOPS[index];
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
npm test
```

Expected: all previous 30 tests + 6 new stops tests pass = 36 total.

- [ ] **Step 5: Commit**

```bash
git add src/stops.ts tests/stops.test.ts
git commit -m "feat: add Chingford-branch stops and travel-time segments"
```

---

## Task 2: estimatePosition() (TDD)

**Files:**
- Create: `src/trainPosition.ts`
- Create: `tests/trainPosition.test.ts`

- [ ] **Step 1: Write failing tests**

Write `tests/trainPosition.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { estimatePosition } from '../src/trainPosition';

describe('estimatePosition', () => {
  it('returns 5 (WC) for tts=0 regardless of direction', () => {
    expect(estimatePosition(0, 'north')).toBe(5);
    expect(estimatePosition(0, 'south')).toBe(5);
  });

  describe('southbound (train approaching WC from the north)', () => {
    it('tts=120 → position 6 (Wood Street, one segment north)', () => {
      expect(estimatePosition(120, 'south')).toBe(6);
    });

    it('tts=180 → position 6.5 (halfway between Wds and Hig)', () => {
      expect(estimatePosition(180, 'south')).toBe(6.5);
    });

    it('tts=300 → position ≈7.33 (one-third into Hig↔Chg segment)', () => {
      const pos = estimatePosition(300, 'south');
      expect(pos).not.toBeNull();
      expect(pos!).toBeCloseTo(7.333, 2);
    });

    it('tts=420 → position 8 (Chingford, end of modelled range)', () => {
      expect(estimatePosition(420, 'south')).toBe(8);
    });

    it('tts=600 → position 8 (clamped to Chingford — beyond modelled segments)', () => {
      expect(estimatePosition(600, 'south')).toBe(8);
    });
  });

  describe('northbound (train approaching WC from the south)', () => {
    it('tts=120 → position 4 (St James Street, one segment south of WC)', () => {
      expect(estimatePosition(120, 'north')).toBe(4);
    });

    it('tts=300 → position 3 (Clapton, exactly at station)', () => {
      expect(estimatePosition(300, 'north')).toBe(3);
    });

    it('tts=510 → position 1.5 (halfway between Bethnal Green and Hackney Downs)', () => {
      expect(estimatePosition(510, 'north')).toBe(1.5);
    });

    it('tts=680 → position ≈0.33 (two-thirds from Liverpool Street toward Bethnal Green)', () => {
      const pos = estimatePosition(680, 'north');
      expect(pos).not.toBeNull();
      expect(pos!).toBeCloseTo(0.333, 2);
    });

    it('tts=1000 → position 0 (clamped to Liverpool Street — beyond modelled segments)', () => {
      expect(estimatePosition(1000, 'north')).toBe(0);
    });
  });

  describe('out-of-range inputs return null', () => {
    it('tts < 0 → null', () => {
      expect(estimatePosition(-1, 'north')).toBeNull();
      expect(estimatePosition(-1, 'south')).toBeNull();
    });

    it('tts > 30 minutes → null', () => {
      expect(estimatePosition(30 * 60 + 1, 'north')).toBeNull();
      expect(estimatePosition(30 * 60 + 1, 'south')).toBeNull();
    });

    it('tts = exactly 30 minutes → clamped terminus (not null)', () => {
      expect(estimatePosition(30 * 60, 'north')).toBe(0);
      expect(estimatePosition(30 * 60, 'south')).toBe(8);
    });
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

```bash
npm test
```

Expected: fails with "Cannot find module '../src/trainPosition'".

- [ ] **Step 3: Implement `src/trainPosition.ts`**

```ts
import type { Direction } from './direction';
import { SEGMENTS_NORTH_OF_WC, SEGMENTS_SOUTH_OF_WC } from './stops';

const MAX_REASONABLE_SECONDS = 30 * 60;

/**
 * Estimate a train's position on the Chingford branch as a floating-point
 * index in [0, 8], given its remaining time to Walthamstow Central and
 * its direction of travel.
 *
 * Returns null when the prediction is outside the modelled range
 * (negative or more than 30 minutes away).
 */
export function estimatePosition(
  timeToStationSeconds: number,
  direction: Direction
): number | null {
  if (timeToStationSeconds < 0) return null;
  if (timeToStationSeconds > MAX_REASONABLE_SECONDS) return null;

  const segments = direction === 'south' ? SEGMENTS_NORTH_OF_WC : SEGMENTS_SOUTH_OF_WC;

  let accumulated = 0;
  for (const seg of segments) {
    if (timeToStationSeconds <= accumulated + seg.seconds) {
      const progress = (timeToStationSeconds - accumulated) / seg.seconds;
      return seg.nearIndex + progress * (seg.farIndex - seg.nearIndex);
    }
    accumulated += seg.seconds;
  }

  // Beyond all modelled segments but within the reasonable-range cap:
  // clamp to the farthest terminus in the direction of approach.
  return direction === 'south' ? 8 : 0;
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
npm test
```

Expected: all tests pass. Total = 36 (stops) + 12 (trainPosition) − earlier count changes = run `npm test` and confirm no failures.

- [ ] **Step 5: Commit**

```bash
git add src/trainPosition.ts tests/trainPosition.test.ts
git commit -m "feat: add estimatePosition for the weaver strip"
```

---

## Task 3: State snapshot, live decrement, position + celebrate flag

This rewires `src/main.ts` to snapshot each poll's arrivals with a fetch timestamp, then in `rerender()` compute a live `BridgeEvent` with decremented `bridgeTimeSeconds` (which also fixes the currently-latent bug where the countdown doesn't tick between polls), plus a live position via `estimatePosition()`, plus edge-detects the countdown's `'now'` transition to set `celebrate` for 1 second.

`src/render.ts`'s `ViewModel` gains three optional fields: `northPos`, `southPos`, `celebrate`. `renderDirection()` stays unchanged — it still reads `event.bridgeTimeSeconds`, which is now the live decremented value because we construct a fresh event object per rerender.

**Files:**
- Modify: `src/main.ts`
- Modify: `src/render.ts`

- [ ] **Step 1: Extend `ViewModel` in `src/render.ts`**

Open `src/render.ts`. Find the `ViewModel` interface and replace with:

```ts
export interface ViewModel {
  north?: BridgeEvent;
  south?: BridgeEvent;
  freshness: FreshnessState;
  error?: string;
  northPos: number | null;
  southPos: number | null;
  celebrate: { direction: 'north' | 'south' } | null;
}
```

Do NOT modify `render()` or `renderDirection()` logic in this task. The new fields will be consumed by `renderStrip()` added in Task 4.

- [ ] **Step 2: Rewrite `src/main.ts`**

Replace the entire contents of `src/main.ts` with:

```ts
import { fetchArrivals } from './tfl';
import { pickNextPerDirection } from './bridge';
import type { BridgeEvent } from './bridge';
import { classifyFreshness } from './freshness';
import { startPoller } from './poller';
import { render, type ViewModel } from './render';
import { formatCountdown } from './display';
import { estimatePosition } from './trainPosition';
import { WALTHAMSTOW_CENTRAL_STOPPOINT_ID, POLL_INTERVAL_MS } from './constants';
import type { Direction } from './direction';

const root = document.getElementById('app')!;

const DIRECTIONS: readonly Direction[] = ['north', 'south'];
const CELEBRATE_DURATION_MS = 1000;

interface DirectionSnapshot {
  event: BridgeEvent;
  snapshottedAtMs: number;
}

let snapshots: Partial<Record<Direction, DirectionSnapshot>> = {};
let lastFetchMs: number | null = null;
let lastError: string | undefined;
const previousKind: Partial<Record<Direction, string>> = {};
const celebrateSetAt: Partial<Record<Direction, number>> = {};

function liveEvent(snapshot: DirectionSnapshot, nowMs: number): BridgeEvent {
  const elapsedSeconds = (nowMs - snapshot.snapshottedAtMs) / 1000;
  return {
    ...snapshot.event,
    bridgeTimeSeconds: snapshot.event.bridgeTimeSeconds - elapsedSeconds,
  };
}

function livePosition(snapshot: DirectionSnapshot, nowMs: number): number | null {
  const elapsedSeconds = (nowMs - snapshot.snapshottedAtMs) / 1000;
  const currentTts = snapshot.event.arrival.timeToStation - elapsedSeconds;
  return estimatePosition(currentTts, snapshot.event.direction);
}

function buildViewModel(): ViewModel {
  const now = Date.now();

  const events: Partial<Record<Direction, BridgeEvent>> = {};
  const positions: Record<Direction, number | null> = { north: null, south: null };

  for (const dir of DIRECTIONS) {
    const snap = snapshots[dir];
    if (!snap) continue;
    events[dir] = liveEvent(snap, now);
    positions[dir] = livePosition(snap, now);
  }

  // Detect 'now'-state edges for bridge-jiggle celebration.
  for (const dir of DIRECTIONS) {
    const ev = events[dir];
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

  // Active celebration (1 second window after a 'now' edge).
  let celebrate: ViewModel['celebrate'] = null;
  for (const dir of DIRECTIONS) {
    const setAt = celebrateSetAt[dir];
    if (setAt !== undefined && now - setAt < CELEBRATE_DURATION_MS) {
      celebrate = { direction: dir };
      break;
    }
  }

  return {
    north: events.north,
    south: events.south,
    freshness: classifyFreshness(lastFetchMs, now),
    error: lastFetchMs === null ? lastError : undefined,
    northPos: positions.north,
    southPos: positions.south,
    celebrate,
  };
}

function rerender(): void {
  render(root, buildViewModel());
}

async function tick(): Promise<void> {
  try {
    const arrivals = await fetchArrivals(WALTHAMSTOW_CENTRAL_STOPPOINT_ID);
    const picked = pickNextPerDirection(arrivals);
    const now = Date.now();
    snapshots = {
      north: picked.north ? { event: picked.north, snapshottedAtMs: now } : undefined,
      south: picked.south ? { event: picked.south, snapshottedAtMs: now } : undefined,
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

- [ ] **Step 3: Run tests, confirm no regressions**

```bash
npm test
```

Expected: all tests still pass (same total as after Task 2). No test changes in this task.

- [ ] **Step 4: Run build, confirm clean**

```bash
npm run build
```

Expected: exit 0, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/render.ts
git commit -m "feat: snapshot state + decrement tts locally for live countdown and position"
```

---

## Task 4: Strip skeleton — DOM module + CSS (stations + bridge, no trains yet)

This creates `src/strip.ts` with the in-place-update pattern and adds CSS for the strip container, line, station pips, abbreviations, and the East Avenue bridge landmark. Trains are added in Task 5. Renders cleanly even with no train data.

**Files:**
- Create: `src/strip.ts`
- Modify: `src/render.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Create `src/strip.ts`**

```ts
import { STOPS } from './stops';
import type { Direction } from './direction';

export interface StripModel {
  northPos: number | null;
  southPos: number | null;
  celebrate: { direction: Direction } | null;
}

const BRIDGE_SVG = `
<svg class="strip-bridge-svg" viewBox="0 0 28 16" aria-hidden="true">
  <path d="M2 13 L2 10 Q2 4 14 4 Q26 4 26 10 L26 13 Z" fill="currentColor"/>
  <rect x="2" y="13" width="24" height="1.5" fill="currentColor"/>
</svg>
`;

const TRAIN_SVG = `
<svg class="strip-train-svg" viewBox="0 0 40 24" aria-hidden="true">
  <g class="strip-train-body">
    <rect x="4" y="4" width="32" height="12" rx="3" fill="currentColor"/>
    <rect x="28" y="1" width="5" height="5" rx="1" fill="currentColor"/>
    <rect x="9" y="7" width="6" height="5" rx="1" fill="#0a0a0f"/>
    <circle cx="12" cy="9.5" r="0.6" fill="currentColor"/>
    <path d="M11 10.5 Q12 11.5 13 10.5" stroke="currentColor" stroke-width="0.6" fill="none" stroke-linecap="round"/>
    <circle cx="11" cy="17.5" r="2.5" fill="#0a0a0f" stroke="currentColor" stroke-width="1"/>
    <circle cx="29" cy="17.5" r="2.5" fill="#0a0a0f" stroke="currentColor" stroke-width="1"/>
  </g>
  <g class="strip-smoke">
    <circle class="strip-smoke-puff" cx="30" cy="-2" r="1.5" fill="currentColor"/>
    <circle class="strip-smoke-puff strip-smoke-puff-b" cx="30" cy="-2" r="1.5" fill="currentColor"/>
    <circle class="strip-smoke-puff strip-smoke-puff-c" cx="30" cy="-2" r="1.5" fill="currentColor"/>
  </g>
</svg>
`;

export function renderStrip(root: HTMLElement, model: StripModel): void {
  let container = root.querySelector<HTMLElement>('.strip');

  if (!container) {
    container = buildSkeleton();
    root.appendChild(container);
  }

  updateDynamic(container, model);
}

function buildSkeleton(): HTMLElement {
  const container = document.createElement('section');
  container.className = 'strip';
  container.setAttribute('aria-label', 'Train positions on the Weaver line');

  const line = document.createElement('div');
  line.className = 'strip-line';
  container.appendChild(line);

  for (const stop of STOPS) {
    const pip = document.createElement('div');
    pip.className = 'strip-pip';
    pip.style.setProperty('--pos', String(stop.index));

    const dot = document.createElement('div');
    dot.className = 'strip-pip-dot';
    pip.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'strip-pip-label';
    label.textContent = stop.abbrev;
    pip.appendChild(label);

    container.appendChild(pip);
  }

  const bridge = document.createElement('div');
  bridge.className = 'strip-bridge';
  bridge.style.setProperty('--pos', '5.5');
  bridge.innerHTML = `${BRIDGE_SVG}<span class="strip-bridge-label">East Av</span>`;
  container.appendChild(bridge);

  const trainN = document.createElement('div');
  trainN.className = 'strip-train strip-train-north';
  trainN.style.setProperty('--pos', '0');
  trainN.innerHTML = TRAIN_SVG;
  container.appendChild(trainN);

  const trainS = document.createElement('div');
  trainS.className = 'strip-train strip-train-south';
  trainS.style.setProperty('--pos', '8');
  trainS.innerHTML = TRAIN_SVG;
  container.appendChild(trainS);

  return container;
}

function updateDynamic(container: HTMLElement, model: StripModel): void {
  const trainN = container.querySelector<HTMLElement>('.strip-train-north')!;
  const trainS = container.querySelector<HTMLElement>('.strip-train-south')!;
  const bridge = container.querySelector<HTMLElement>('.strip-bridge')!;

  setTrain(trainN, model.northPos);
  setTrain(trainS, model.southPos);

  bridge.classList.toggle('celebrating', model.celebrate !== null);
}

function setTrain(el: HTMLElement, pos: number | null): void {
  if (pos === null) {
    el.classList.add('hidden');
  } else {
    el.classList.remove('hidden');
    el.style.setProperty('--pos', String(pos));
  }
}
```

- [ ] **Step 2: Update `src/render.ts` to call renderStrip**

Open `src/render.ts`. Add the import at the top (next to the other imports):

```ts
import { renderStrip } from './strip';
```

Find the `render()` function. In its current form, the happy path does:

```ts
  } else {
    root.appendChild(renderDirection('→ Chingford', vm.north));
    root.appendChild(renderDirection('← Walthamstow Central', vm.south));
  }
```

Replace that block with:

```ts
  } else {
    root.appendChild(renderDirection('→ Chingford', vm.north));
    root.appendChild(renderDirection('← Walthamstow Central', vm.south));
  }

  // The strip uses in-place updates so it persists across re-renders
  // without triggering FLIP/layout thrash. We only need to ensure it
  // exists somewhere in root; renderStrip() handles find-or-create.
```

Then at the end of `render()`, just before `root.appendChild(footer)`, call:

```ts
  renderStrip(root, {
    northPos: vm.northPos,
    southPos: vm.southPos,
    celebrate: vm.celebrate,
  });
```

So the footer stays at the bottom of the DOM order (strip is inserted before it on first render and stays put on subsequent ones since it's not removed).

Important: the existing `render()` starts with `root.innerHTML = ''` which would wipe the strip. That conflicts with "renderStrip uses in-place updates". We must change that.

Replace the entire `render()` function with:

```ts
export function render(root: HTMLElement, vm: ViewModel): void {
  // Preserve the strip across renders; rebuild the error / empty / rows / footer.
  const existingStrip = root.querySelector<HTMLElement>('.strip');

  // Remove everything EXCEPT the strip
  Array.from(root.children).forEach((child) => {
    if (child !== existingStrip) root.removeChild(child);
  });

  if (vm.freshness.state === 'no-data' && vm.error) {
    const err = document.createElement('div');
    err.className = 'error';
    err.textContent = vm.error;
    root.appendChild(err);
    return;
  }

  if (!vm.north && !vm.south) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = `
      <p>No trains right now.</p>
      <a href="https://tfl.gov.uk/tube-dlr-overground/status/" target="_blank" rel="noopener">Check TfL status</a>
    `;
    root.appendChild(empty);
  } else {
    root.appendChild(renderDirection('→ Chingford', vm.north));
    root.appendChild(renderDirection('← Walthamstow Central', vm.south));
  }

  renderStrip(root, {
    northPos: vm.northPos,
    southPos: vm.southPos,
    celebrate: vm.celebrate,
  });

  const footer = document.createElement('div');
  footer.className = `footer ${vm.freshness.state}`;
  footer.textContent = vm.freshness.state === 'no-data'
    ? 'connecting…'
    : formatAge(vm.freshness.ageMs);
  root.appendChild(footer);
}
```

The strip stays in the DOM permanently after the first render; everything else is rebuilt each tick. That's fine — the CSS transitions live on the train elements inside the strip, which are preserved.

- [ ] **Step 3: Add strip CSS in `src/styles.css`**

Append to the bottom of `src/styles.css`:

```css
/* ───── Weaver strip ───── */

.strip {
  position: relative;
  height: 96px;
  padding: 0 16px;
}

.strip-line {
  position: absolute;
  top: 50%;
  left: 16px;
  right: 16px;
  height: 1px;
  background: var(--dim);
  opacity: 0.4;
  transform: translateY(-50%);
}

.strip-pip {
  position: absolute;
  top: 50%;
  left: calc(var(--pos) * (100% - 32px) / 8 + 16px);
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: none;
}

.strip-pip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1px solid var(--dim);
  background: var(--bg);
}

.strip-pip-label {
  position: absolute;
  top: 12px;
  font-size: 0.625rem;
  color: var(--dim);
  font-weight: 500;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.strip-bridge {
  position: absolute;
  top: 50%;
  left: calc(var(--pos) * (100% - 32px) / 8 + 16px);
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--accent);
  pointer-events: none;
  z-index: 2;
}

.strip-bridge-svg {
  width: 20px;
  height: 12px;
  display: block;
}

.strip-bridge-label {
  position: absolute;
  top: 14px;
  font-size: 0.625rem;
  color: var(--accent);
  font-weight: 600;
  white-space: nowrap;
}

.strip-train {
  /* Trains get CSS in Task 5. For now they exist invisibly. */
  display: none;
}
```

- [ ] **Step 4: Manual verification (dev server)**

```bash
npm run dev &
DEV_PID=$!
sleep 4
curl -s http://localhost:5173/ | head -20
# Check that the HTML contains <main id="app"...>
kill $DEV_PID 2>/dev/null || true
```

Then open the dev server URL manually in a browser (or, if you cannot, accept the DOM-only check): the strip section should render with 9 little station dots across a thin line, with a cyan arched bridge between the WC and Wds dots labelled "East Av". No trains yet (they're `display: none`).

If you want a deeper check from the CLI, dump the rendered HTML after JS runs using an HTTP-only approach — that won't work since this is a client-rendered SPA. The honest answer: real visual verification happens in a browser, which is a user step in Task 7 (final verification). For now, confirm:
- `npm run build` still succeeds
- `npm test` still passes

- [ ] **Step 5: Run tests and build**

```bash
npm test && npm run build
```

Expected: all tests pass, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/strip.ts src/render.ts src/styles.css
git commit -m "feat: weaver strip skeleton — stations, line, bridge landmark"
```

---

## Task 5: Train SVG + position binding + glide animation

Make the trains visible, position them via the `--pos` custom property shared with pips/bridge, and add the 1.5s ease transition so they glide between positions. Northbound train uses the SVG as-authored (faces right, toward higher indices); southbound train uses the same SVG mirrored via CSS.

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace the `.strip-train` placeholder block in `src/styles.css`**

Find the block you added in Task 4:

```css
.strip-train {
  /* Trains get CSS in Task 5. For now they exist invisibly. */
  display: none;
}
```

Replace it with:

```css
.strip-train {
  position: absolute;
  top: 50%;
  left: calc(var(--pos) * (100% - 32px) / 8 + 16px);
  transform: translate(-50%, -50%);
  width: 40px;
  height: 24px;
  color: var(--accent);
  pointer-events: none;
  z-index: 3;
  transition: left 1.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.strip-train.hidden {
  visibility: hidden;
}

.strip-train-svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

/* Northbound (→ Chingford): faces right = SVG as authored.
   Southbound (← Liverpool Street): mirror horizontally.
   Use an inner transform so it composes cleanly with the outer translate(-50%, -50%). */
.strip-train-south .strip-train-svg {
  transform: scaleX(-1);
}
```

- [ ] **Step 2: Verify CSS works with a sanity build**

```bash
npm run build
```

Expected: exit 0. No CSS parse errors.

- [ ] **Step 3: Smoke-check the output HTML/CSS paths**

```bash
npm run dev &
DEV_PID=$!
sleep 4
curl -s http://localhost:5173/ | grep -E "(css|app)" | head -3
kill $DEV_PID 2>/dev/null || true
```

Expected: the HTML references the Vite-bundled CSS (via `<link>`) and has `<main id="app"...>`. Trains appear only when JS runs in a real browser, so full verification waits until Task 9.

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "feat: position and glide the two cartoon trains on the strip"
```

---

## Task 6: Animations — smoke + bridge jiggle + prefers-reduced-motion

Three additions:
1. Smoke puff keyframes rising above the train chimney on loop.
2. Bridge jiggle keyframe triggered by `.celebrating` class.
3. `@media (prefers-reduced-motion: reduce)` disables transitions and keyframe animations site-wide.

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Append animation CSS to `src/styles.css`**

Append to the bottom of the file:

```css
/* ───── Strip animations ───── */

.strip-smoke-puff {
  animation: smoke-rise 2s ease-out infinite;
  opacity: 0;
  transform-origin: center;
}

.strip-smoke-puff-b {
  animation-delay: 0.67s;
}

.strip-smoke-puff-c {
  animation-delay: 1.33s;
}

@keyframes smoke-rise {
  0%   { transform: translateY(0) scale(0.8);  opacity: 0;   }
  15%  { opacity: 0.6; }
  100% { transform: translateY(-18px) scale(1.6); opacity: 0; }
}

.strip-bridge.celebrating .strip-bridge-svg {
  animation: bridge-jiggle 1s ease-in-out;
}

@keyframes bridge-jiggle {
  0%   { transform: rotate(0deg); }
  15%  { transform: rotate(-4deg); }
  35%  { transform: rotate(4deg); }
  55%  { transform: rotate(-3deg); }
  75%  { transform: rotate(2deg); }
  100% { transform: rotate(0deg); }
}

/* Respect user motion preferences. */
@media (prefers-reduced-motion: reduce) {
  .strip-train {
    transition: none;
  }
  .strip-smoke-puff,
  .strip-bridge.celebrating .strip-bridge-svg,
  .value.now {
    animation: none;
  }
  .strip-smoke-puff {
    opacity: 0; /* hide entirely rather than freeze on frame 0 */
  }
}
```

- [ ] **Step 2: Build and test**

```bash
npm test && npm run build
```

Expected: all tests pass, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: smoke, bridge jiggle, and prefers-reduced-motion handling"
```

---

## Task 7: Final verification and deploy

**Files:** none modified unless a regression is found.

- [ ] **Step 1: Full test + build + bundle-size check**

```bash
npm test
```

Expected: all tests pass. Total count should be 50 (30 original + 6 stops + 14 trainPosition).

```bash
npm run build
```

Expected: exit 0. Inspect the summary output — the main JS bundle (`dist/assets/index-*.js`) should be well under 20KB gzipped (we were at 3.7KB before; the additions are a few hundred lines of code and should add 1-3KB gzipped).

```bash
ls -la dist/assets/
```

Expected: one JS file, one CSS file, both small.

- [ ] **Step 2: Live dev-server smoke test**

```bash
npm run dev &
DEV_PID=$!
sleep 4
curl -s http://localhost:5173/ | grep -c '<main id="app"'
# Expected: 1
curl -s http://localhost:5173/src/main.ts | grep -c "estimatePosition"
# Expected: 1
kill $DEV_PID 2>/dev/null || true
wait $DEV_PID 2>/dev/null || true
```

Expected: both counts are 1 (root HTML has the #app container, and the transpiled main.ts references estimatePosition).

- [ ] **Step 3: Push to main — Netlify auto-deploys**

```bash
git push origin main
```

Expected: push succeeds (may show git-credential-osxkeychain if `gh auth setup-git` was run earlier).

- [ ] **Step 4: Poll Netlify for deploy success**

```bash
SITE_ID="ade8ca45-bd3e-4a6f-8f3d-cadae3e8ec97"
for i in 1 2 3 4 5; do
  sleep 20
  STATE=$(npx -y netlify-cli api listSiteDeploys --data "{\"site_id\":\"$SITE_ID\",\"per_page\":1}" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin)[0]; print(f\"{d['state']}|{d['commit_ref'][:8]}|{d.get('error_message') or ''}\")" 2>/dev/null)
  echo "[$((i*20))s] $STATE"
  case "$STATE" in
    ready*) echo "DEPLOYED"; break ;;
    error*) echo "FAILED"; break ;;
  esac
done
```

Expected: `DEPLOYED` within ~40s (Netlify builds are fast).

- [ ] **Step 5: Live site smoke check**

```bash
curl -sI https://walthamstow-train-tracker.netlify.app/ | head -1
# Expected: HTTP/2 200
curl -s https://walthamstow-train-tracker.netlify.app/ | grep -c '<title>Walthamstow Trains</title>'
# Expected: 1
```

- [ ] **Step 6: Hand-off note**

Ask the human user to open the live URL in a browser (desktop AND iPhone home-screen install) and confirm visually:

1. The strip appears below the two countdowns and above the footer.
2. All 9 station abbreviations are visible without overlapping on a narrow phone screen.
3. The bridge glyph ("East Av") sits between WC and Wds, visibly cyan.
4. At least one train is visible and gliding (wait through a poll cycle if needed).
5. When a countdown hits NOW (this requires luck — a train must be due within ~10s of bridge crossing), the bridge briefly jiggles.
6. DevTools → Settings → Rendering → `prefers-reduced-motion: reduce` stops the glide and smoke.
7. The iPhone home-screen icon still opens the app in fullscreen.

This is a user-visible task; Claude cannot validate it from the CLI. Report the feature as `DONE_WITH_CONCERNS` if any of these fail, with the specific failure, and the human will address it.

---

## Self-review notes

**Spec coverage:**
- ✅ 9 Chingford-branch stops with 3-letter abbrevs — Task 1 (`src/stops.ts`)
- ✅ Bridge as its own landmark visually between WC and Wds at position 5.5 — Task 4 (CSS) + Task 4 (strip.ts skeleton)
- ✅ Two cartoon SVG trains, one per direction — Task 4 (SVG markup) + Task 5 (positioning + mirror)
- ✅ Position from timeToStation + travel-time table, no new network calls — Task 2 (`estimatePosition`)
- ✅ Smooth glide every second, not just on polls — Task 3 (decrement locally in `buildViewModel`) + Task 5 (CSS transition)
- ✅ Subtle smoke animation — Task 6
- ✅ Subtle bridge jiggle on NOW transition — Task 3 (edge detect) + Task 6 (CSS)
- ✅ Gracefully hide train when no arrival or out-of-range — Task 4 (`setTrain` hidden class)
- ✅ `prefers-reduced-motion` handling — Task 6
- ✅ All 30 existing tests continue to pass — verified at end of every task via `npm test`
- ✅ Bundle-size target — verified in Task 7

**Type consistency:**
- `Direction` type imported from `./direction` wherever used (main.ts, trainPosition.ts, strip.ts) — single source of truth
- `BridgeEvent` from `./bridge` used consistently; snapshots carry the whole event, `liveEvent()` returns a spread copy with updated `bridgeTimeSeconds`
- `ViewModel` changes additive — existing optional `north`/`south` preserved, three new fields added
- `StripModel` in strip.ts is a strict subset of `ViewModel`'s new fields — no duplication of types

**Placeholder scan:**
- No "TBD", no "implement later", no generic "add error handling". All code blocks are complete.
- The bridge-jiggle CSS uses a 1s keyframe that matches the 1s `CELEBRATE_DURATION_MS` in main.ts — consistent.
- The `--pos` custom property on pips, bridge, and trains uses the same positioning formula so they all align.
- Task 7's manual smoke test is inherently human-in-the-loop (visual) — flagged explicitly as such, not hidden behind "verify manually".

**Open question:** If the `position: 5.5` bridge ends up visually sitting on top of trains passing through that position (southbound between Wds and WC), stacking order is controlled by `z-index`: pip=1 (implicit), bridge=2, train=3. Trains win. Good for the "train visibly passes the bridge" moment southbound.
