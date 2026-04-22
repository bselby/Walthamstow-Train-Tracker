# Multiple E17 Viewpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the app from a single hard-coded East Avenue bridge viewpoint to a small curated set of E17 train-spotting viewpoints (v1: East Ave + Walthamstow Queens Road on the Suffragette line), with a tappable switcher header, star-to-favourite persistence, and per-line theming on trains + header.

**Architecture:** Replace scattered hard-coded constants (`WALTHAMSTOW_CENTRAL_STOPPOINT_ID`, `EAST_AVE_BRIDGE`, bridge offsets, Chingford-branch stops) with a data-driven `Viewpoint[]` array in `src/viewpoints.ts`. Refactor `bridge.ts`, `direction.ts`, `trainPosition.ts`, and `strip.ts` to accept per-viewpoint config as arguments. `main.ts` holds an active viewpoint + favourite-id state, thread the active viewpoint through `buildViewModel()` and `tick()`. A new `src/switcher.ts` renders the tappable line-name header + inline expand-down sheet with per-row star buttons.

**Tech Stack:** TypeScript (strict), Vite, Vitest, vanilla DOM rendering, CSS custom properties for theming, existing `safeLocalRead/Write` wrappers for persistence.

**Spec:** `docs/superpowers/specs/2026-04-22-multiple-viewpoints-design.md`

---

## Direction-naming convention (read this first)

The existing `Direction = 'north' | 'south'` type stays unchanged in this refactor. Treat them as **opaque labels** — they do NOT need to map to geographic north/south. The convention for every viewpoint is:

- **`'north'` = outbound** in TfL's terms (away from the central-London end of the line). Trains in this direction move **left-to-right on the strip** (from stops[0] to stops[last]).
- **`'south'` = inbound** (toward central London). Trains move **right-to-left on the strip**.

**Stops are always ordered from the inbound terminus (index 0, left on strip) to the outbound terminus (last index, right on strip).**

For East Ave (Weaver): stops = `[Liv, Bth, …, WC, WDS, Hig, Chg]`. North trains go toward Chingford (right). South trains go toward Liverpool Street (left). ✓

For Queens Road (Suffragette): stops = `[GOk, UHo, …, WQR, LMR, …, Bkg, BkR]`. North trains go toward Barking Riverside (right). South trains go toward Gospel Oak (left).

> **Note:** this overrides the design spec's Suffragette direction assignment. The spec assigned `directions.north = Gospel Oak` which would violate the left-to-right-strip convention. This plan flips it: `directions.north = Barking Riverside`.

---

## File structure

### New files
```
src/viewpoints.ts                    # Viewpoint type + VIEWPOINTS array
src/switcher.ts                      # renderSwitcher + sheet DOM + open/close
tests/viewpoints.test.ts
tests/switcher.test.ts
```

### Modified files
```
src/main.ts                          # active viewpoint state, favourite persistence,
                                     # tick() uses active viewpoint's stopPointId,
                                     # threads viewpoint through buildViewModel/render
src/render.ts                        # render switcher at top instead of static header
src/bridge.ts                        # computeBridgeTime takes offsetSeconds arg
src/direction.ts                     # classifyDirection takes tflDirection mapping
src/trainPosition.ts                 # estimatePosition takes viewpoint
src/strip.ts                         # renderDirectionStrip takes stops + line color
src/constants.ts                     # remove EAST_AVE_BRIDGE, WALTHAMSTOW_CENTRAL_STOPPOINT_ID,
                                     # NORTHBOUND_OFFSET_SECONDS, SOUTHBOUND_OFFSET_SECONDS
                                     # keep POLL_INTERVAL_MS, STALE_THRESHOLD_MS, TFL_ARRIVALS_URL
src/stops.ts                         # keep Stop/Segment types + Chingford STOPS + segments
                                     # (imported by viewpoints.ts)
src/styles.css                       # --line-color custom property, switcher + sheet layout,
                                     # star button, press feedback
index.html                           # remove static "Weaver Line" header
public/about.html                    # add one sentence about the switcher
public/privacy.html                  # add favourite-viewpoint to localStorage list
tests/bridge.test.ts                 # updated factories to pass offsetSeconds
tests/direction.test.ts              # updated to test with both viewpoints
tests/trainPosition.test.ts          # updated to pass East Ave viewpoint explicitly
```

---

## Task 1: Viewpoint types + data

**Files:**
- Create: `src/viewpoints.ts`
- Test: `tests/viewpoints.test.ts`

**Context:** This is the single data module that replaces scattered constants. No consumers yet; this task is pure data + types. Later tasks refactor consumers to read from the active viewpoint.

- [ ] **Step 1: Write the failing test file**

Create `tests/viewpoints.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { VIEWPOINTS, getViewpointById, DEFAULT_VIEWPOINT_ID } from '../src/viewpoints';

describe('VIEWPOINTS', () => {
  it('contains at least two viewpoints (East Ave + Queens Road)', () => {
    expect(VIEWPOINTS.length).toBeGreaterThanOrEqual(2);
    expect(VIEWPOINTS.map((v) => v.id)).toContain('east-ave');
    expect(VIEWPOINTS.map((v) => v.id)).toContain('queens-road');
  });

  it('every viewpoint has a unique id', () => {
    const ids = VIEWPOINTS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every viewpoint has all required fields', () => {
    for (const v of VIEWPOINTS) {
      expect(v.id).toBeTruthy();
      expect(v.name).toBeTruthy();
      expect(v.lineId).toBeTruthy();
      expect(v.lineName).toBeTruthy();
      expect(v.lineColor).toBeTruthy();
      expect(v.stopPointId).toBeTruthy();
      expect(v.coords.lat).toBeGreaterThan(51.5);
      expect(v.coords.lat).toBeLessThan(51.7);
      expect(v.coords.lng).toBeGreaterThan(-0.2);
      expect(v.coords.lng).toBeLessThan(0.2);
      expect(v.stops.length).toBeGreaterThan(1);
      expect(v.segments.length).toBe(v.stops.length - 1);
      expect(v.directions.north.offsetSeconds).toBeGreaterThanOrEqual(-300);
      expect(v.directions.south.offsetSeconds).toBeGreaterThanOrEqual(-300);
    }
  });

  it('every viewpoint has anchorIndex pointing at a real stop', () => {
    for (const v of VIEWPOINTS) {
      expect(v.anchorIndex).toBeGreaterThanOrEqual(0);
      expect(v.anchorIndex).toBeLessThan(v.stops.length);
    }
  });

  it('east-ave uses the bridge position model', () => {
    const v = getViewpointById('east-ave');
    expect(v?.positionModel).toBe('east-ave-bridge');
  });

  it('queens-road uses the station position model', () => {
    const v = getViewpointById('queens-road');
    expect(v?.positionModel).toBe('station');
  });
});

describe('getViewpointById', () => {
  it('returns the viewpoint matching the id', () => {
    expect(getViewpointById('east-ave')?.id).toBe('east-ave');
  });

  it('returns undefined for an unknown id', () => {
    expect(getViewpointById('no-such-viewpoint')).toBeUndefined();
  });
});

describe('DEFAULT_VIEWPOINT_ID', () => {
  it('points at an existing viewpoint', () => {
    expect(getViewpointById(DEFAULT_VIEWPOINT_ID)).toBeDefined();
  });

  it('is east-ave (the app\'s primary spot)', () => {
    expect(DEFAULT_VIEWPOINT_ID).toBe('east-ave');
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `npx vitest run tests/viewpoints.test.ts`
Expected: FAIL — module `src/viewpoints` does not exist.

- [ ] **Step 3: Create `src/viewpoints.ts`**

```ts
import type { Stop, Segment } from './stops';
import { STOPS as CHINGFORD_STOPS } from './stops';

// Direction-naming convention (see implementation plan for rationale):
//   'north' = TfL outbound = left-to-right on the strip (toward the higher-index terminus)
//   'south' = TfL inbound  = right-to-left on the strip (toward the lower-index terminus)
// These are opaque labels — they do NOT need to align with geographic north/south.

export type LineId = 'weaver' | 'suffragette';

export interface ViewpointDirection {
  /** Short label above the countdown — e.g. '→ Chingford', '← Walthamstow Central'. */
  label: string;
  /** TfL's direction code — used by classifyDirection to map arrivals to 'north'/'south'. */
  tflDirection: 'outbound' | 'inbound';
  /** Plain-English terminus name for aria-labels + fallback destination parsing. */
  terminusName: string;
  /** Seconds added to arrival.timeToStation to produce bridgeTimeSeconds.
   *  +ve = train passes the viewpoint AFTER arriving at the station (northbound bridge).
   *  -ve = train passes BEFORE arriving (southbound bridge).
   *   0  = station viewpoint (no offset — the viewpoint IS the station). */
  offsetSeconds: number;
}

/** How trainPosition estimates the train's strip position around the anchor station.
 *  'east-ave-bridge' = three-phase northbound (dwell at WC → cross bridge → continue to WDS),
 *                      southbound park for 30s after arrival. Specific to East Ave.
 *  'station'         = simple park at anchor index for 30s after arrival both directions.
 *                      Suitable for viewpoints where the station IS the viewpoint. */
export type PositionModel = 'east-ave-bridge' | 'station';

export interface Viewpoint {
  /** Stable slug — used as localStorage key + in the switcher. */
  id: string;
  /** Short display label for the switcher — 'East Ave bridge', 'Queens Road'. */
  name: string;
  /** Longer copy for screen readers + the switcher sheet subtitle. */
  description: string;
  /** TfL line id — used to filter arrivals from the StopPoint API response. */
  lineId: LineId;
  /** Display line name — 'Weaver', 'Suffragette'. */
  lineName: string;
  /** CSS colour (OKLCH) for the header + train livery. */
  lineColor: string;
  /** TfL NaPTAN StopPoint — what the arrivals API is polled against. */
  stopPointId: string;
  /** Physical location of the viewpoint — used by the walking-time feature. */
  coords: { lat: number; lng: number };
  /** Ordered list of stops on the relevant branch (inbound terminus first, outbound last). */
  stops: readonly Stop[];
  /** Inter-stop travel times — `segments[i]` is the time between stops[i] and stops[i+1]. */
  segments: readonly Segment[];
  /** Which stop in `stops` IS (or is closest to) the viewpoint — used by trainPosition. */
  anchorIndex: number;
  /** Position model tag — 'east-ave-bridge' or 'station'. Picked by trainPosition. */
  positionModel: PositionModel;
  /** Per-direction config. */
  directions: {
    north: ViewpointDirection;
    south: ViewpointDirection;
  };
}

// ─── Chingford branch (Weaver) segments, keyed to CHINGFORD_STOPS ordering ───
// Segment[i] connects stops[i] ↔ stops[i+1]. Derived from the existing
// SEGMENTS_NORTH_OF_WC + SEGMENTS_SOUTH_OF_WC data in stops.ts (same numbers,
// just in a contiguous list).
const CHINGFORD_SEGMENTS: readonly Segment[] = [
  { nearIndex: 0, farIndex: 1, seconds: 120 }, // Liv ↔ Bth
  { nearIndex: 1, farIndex: 2, seconds: 180 }, // Bth ↔ Hck
  { nearIndex: 2, farIndex: 3, seconds: 120 }, // Hck ↔ Clp
  { nearIndex: 3, farIndex: 4, seconds: 180 }, // Clp ↔ StJ
  { nearIndex: 4, farIndex: 5, seconds: 120 }, // StJ ↔ WC
  { nearIndex: 5, farIndex: 6, seconds: 120 }, // WC ↔ Wds
  { nearIndex: 6, farIndex: 7, seconds: 120 }, // Wds ↔ Hig
  { nearIndex: 7, farIndex: 8, seconds: 180 }, // Hig ↔ Chg
];

// ─── Suffragette line stops (Gospel Oak → Barking Riverside) ───
// Ordered inbound terminus (GOk, left of strip) → outbound terminus (BkR, right of strip).
// North-direction trains on our app = left-to-right = toward Barking Riverside.
const SUFFRAGETTE_STOPS: readonly Stop[] = [
  { index: 0, fullName: 'Gospel Oak', abbrev: 'GOk' },
  { index: 1, fullName: 'Upper Holloway', abbrev: 'UHo' },
  { index: 2, fullName: 'Crouch Hill', abbrev: 'CrH' },
  { index: 3, fullName: 'Harringay Green Lanes', abbrev: 'HGL' },
  { index: 4, fullName: 'South Tottenham', abbrev: 'STm' },
  { index: 5, fullName: 'Blackhorse Road', abbrev: 'BHR' },
  { index: 6, fullName: 'Walthamstow Queens Road', abbrev: 'WQR' },
  { index: 7, fullName: 'Leyton Midland Road', abbrev: 'LMR' },
  { index: 8, fullName: 'Leytonstone High Road', abbrev: 'LHR' },
  { index: 9, fullName: 'Wanstead Park', abbrev: 'WPk' },
  { index: 10, fullName: 'Woodgrange Park', abbrev: 'WGP' },
  { index: 11, fullName: 'Barking', abbrev: 'Bkg' },
  { index: 12, fullName: 'Barking Riverside', abbrev: 'BkR' },
];

// Approximate inter-stop travel times from TfL's timetable.
// Exact numbers aren't critical — this drives the cartoon-train animation only.
const SUFFRAGETTE_SEGMENTS: readonly Segment[] = [
  { nearIndex: 0, farIndex: 1, seconds: 180 }, // GOk ↔ UHo
  { nearIndex: 1, farIndex: 2, seconds: 120 }, // UHo ↔ CrH
  { nearIndex: 2, farIndex: 3, seconds: 180 }, // CrH ↔ HGL
  { nearIndex: 3, farIndex: 4, seconds: 180 }, // HGL ↔ STm
  { nearIndex: 4, farIndex: 5, seconds: 240 }, // STm ↔ BHR
  { nearIndex: 5, farIndex: 6, seconds: 180 }, // BHR ↔ WQR
  { nearIndex: 6, farIndex: 7, seconds: 180 }, // WQR ↔ LMR
  { nearIndex: 7, farIndex: 8, seconds: 120 }, // LMR ↔ LHR
  { nearIndex: 8, farIndex: 9, seconds: 240 }, // LHR ↔ WPk
  { nearIndex: 9, farIndex: 10, seconds: 180 }, // WPk ↔ WGP
  { nearIndex: 10, farIndex: 11, seconds: 300 }, // WGP ↔ Bkg
  { nearIndex: 11, farIndex: 12, seconds: 240 }, // Bkg ↔ BkR
];

// Line colours sourced from TfL's November 2024 Overground rebrand palette.
// OKLCH values tuned to look right on the app's cream background in daylight.
const WEAVER_BURGUNDY = 'oklch(35% 0.12 10)';
const SUFFRAGETTE_GREEN = 'oklch(55% 0.15 155)';

export const VIEWPOINTS: readonly Viewpoint[] = [
  {
    id: 'east-ave',
    name: 'East Ave bridge',
    description: 'The road bridge over the Weaver line on East Avenue, Walthamstow',
    lineId: 'weaver',
    lineName: 'Weaver',
    lineColor: WEAVER_BURGUNDY,
    stopPointId: '910GWLTWCEN',
    coords: { lat: 51.583486, lng: -0.014564 },
    stops: CHINGFORD_STOPS,
    segments: CHINGFORD_SEGMENTS,
    anchorIndex: 5, // Walthamstow Central
    positionModel: 'east-ave-bridge',
    directions: {
      north: {
        label: '→ Chingford',
        tflDirection: 'outbound',
        terminusName: 'Chingford',
        offsetSeconds: 90, // dwell at WC + cross bridge
      },
      south: {
        label: '← Walthamstow Central',
        tflDirection: 'inbound',
        terminusName: 'Liverpool Street',
        offsetSeconds: -20, // crosses bridge 20s before reaching WC
      },
    },
  },
  {
    id: 'queens-road',
    name: 'Queens Road',
    description: 'Walthamstow Queens Road station, platform view',
    lineId: 'suffragette',
    lineName: 'Suffragette',
    lineColor: SUFFRAGETTE_GREEN,
    stopPointId: '910GWLTHQRD', // VERIFY during implementation via TfL /StopPoint/Search
    coords: { lat: 51.581539, lng: -0.023774 },
    stops: SUFFRAGETTE_STOPS,
    segments: SUFFRAGETTE_SEGMENTS,
    anchorIndex: 6, // Walthamstow Queens Road
    positionModel: 'station',
    directions: {
      north: {
        label: '→ Barking Riverside',
        tflDirection: 'outbound',
        terminusName: 'Barking Riverside',
        offsetSeconds: 0,
      },
      south: {
        label: '← Gospel Oak',
        tflDirection: 'inbound',
        terminusName: 'Gospel Oak',
        offsetSeconds: 0,
      },
    },
  },
];

export const DEFAULT_VIEWPOINT_ID = 'east-ave';

export function getViewpointById(id: string): Viewpoint | undefined {
  return VIEWPOINTS.find((v) => v.id === id);
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `npx vitest run tests/viewpoints.test.ts`
Expected: PASS — all viewpoint tests green.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all 124 existing tests + ~10 new viewpoint tests pass (134 total).

- [ ] **Step 6: Commit**

```bash
git add src/viewpoints.ts tests/viewpoints.test.ts
git commit -m "feat: Viewpoint type + East Ave and Queens Road records

Introduces src/viewpoints.ts as the single data module for E17 viewpoints.
Two records: 'east-ave' (Weaver, Walthamstow Central stop, bridge position
model) and 'queens-road' (Suffragette, Walthamstow Queens Road stop,
station position model).

No consumers yet — subsequent commits refactor bridge.ts, direction.ts,
trainPosition.ts, strip.ts, and main.ts to read from the active viewpoint."
```

---

## Task 2: Refactor `computeBridgeTime` to accept offsetSeconds

**Files:**
- Modify: `src/bridge.ts`
- Modify: `src/constants.ts` (remove NORTHBOUND_OFFSET_SECONDS / SOUTHBOUND_OFFSET_SECONDS)
- Modify: `tests/bridge.test.ts`
- Modify: `src/main.ts` (pass viewpoint offsets)

**Context:** Bridge offsets were hard-coded constants (`+90`, `-20`) imported from `constants.ts`. Now they live per-viewpoint per-direction. This task makes `computeBridgeTime` take the offset as an argument, updates tests to pass offsets explicitly, and deletes the old constants.

- [ ] **Step 1: Update `tests/bridge.test.ts` to use the new signature**

Replace the whole file with:
```ts
import { describe, it, expect } from 'vitest';
import { computeBridgeTime, pickNextPerDirection, pickNextNPerDirection } from '../src/bridge';
import type { Arrival } from '../src/tfl';
import { getViewpointById } from '../src/viewpoints';

const EAST_AVE = getViewpointById('east-ave')!;

function arrival(destinationName: string, timeToStation: number, id = 'x'): Arrival {
  return {
    id,
    stationName: 'Walthamstow Central',
    lineId: 'weaver',
    destinationName,
    timeToStation,
    expectedArrival: '2026-04-17T10:00:00Z',
    modeName: 'overground',
    platformName: 'Platform 1'
  };
}

describe('computeBridgeTime', () => {
  it('adds 90s for northbound on East Ave (train leaves WC then reaches bridge)', () => {
    expect(computeBridgeTime(arrival('Chingford', 120), EAST_AVE)).toBe(210);
  });

  it('subtracts 20s for southbound on East Ave (train crosses bridge before WC)', () => {
    expect(computeBridgeTime(arrival('Liverpool Street', 120), EAST_AVE)).toBe(100);
  });

  it('handles a northbound train already at platform (tts=0)', () => {
    expect(computeBridgeTime(arrival('Chingford', 0), EAST_AVE)).toBe(90);
  });

  it('handles a southbound train already at platform (returns -20)', () => {
    expect(computeBridgeTime(arrival('Liverpool Street', 0), EAST_AVE)).toBe(-20);
  });

  it('station viewpoint: offset=0 means bridgeTime equals timeToStation', () => {
    const queensRoad = getViewpointById('queens-road')!;
    expect(computeBridgeTime(arrival('Barking Riverside', 120), queensRoad)).toBe(120);
    expect(computeBridgeTime(arrival('Gospel Oak', 120), queensRoad)).toBe(120);
  });
});

describe('pickNextPerDirection', () => {
  it('picks earliest future northbound and earliest future southbound', () => {
    const arrivals = [
      arrival('Chingford', 300, 'n1'),
      arrival('Chingford', 60, 'n2'),
      arrival('Liverpool Street', 500, 's1'),
      arrival('Liverpool Street', 200, 's2')
    ];

    const result = pickNextPerDirection(arrivals, EAST_AVE);

    expect(result.north?.arrival.id).toBe('n2');
    expect(result.north?.bridgeTimeSeconds).toBe(150); // 60 + 90
    expect(result.south?.arrival.id).toBe('s2');
    expect(result.south?.bridgeTimeSeconds).toBe(180); // 200 - 20
  });

  it('excludes arrivals whose bridge time is too far in the past (< -30s)', () => {
    const arrivals = [
      arrival('Liverpool Street', -100, 's-gone'),
      arrival('Liverpool Street', 200, 's-next')
    ];
    const result = pickNextPerDirection(arrivals, EAST_AVE);
    expect(result.south?.arrival.id).toBe('s-next');
  });

  it('keeps a southbound train that just crossed (bridge time between -30 and 0)', () => {
    const arrivals = [arrival('Liverpool Street', 10, 's-just-crossed')];
    const result = pickNextPerDirection(arrivals, EAST_AVE);
    expect(result.south?.arrival.id).toBe('s-just-crossed');
    expect(result.south?.bridgeTimeSeconds).toBe(-10);
  });

  it('returns undefined for a direction with no valid arrivals', () => {
    const arrivals = [arrival('Chingford', 120, 'n1')];
    const result = pickNextPerDirection(arrivals, EAST_AVE);
    expect(result.north?.arrival.id).toBe('n1');
    expect(result.south).toBeUndefined();
  });
});

describe('pickNextNPerDirection', () => {
  it('returns up to N per direction, sorted by bridge time ascending', () => {
    const arrivals = [
      arrival('Chingford', 600, 'n3'),
      arrival('Chingford', 300, 'n2'),
      arrival('Chingford', 60, 'n1'),
      arrival('Liverpool Street', 500, 's2'),
      arrival('Liverpool Street', 200, 's1'),
    ];
    const result = pickNextNPerDirection(arrivals, 2, EAST_AVE);
    expect(result.north.map((e) => e.arrival.id)).toEqual(['n1', 'n2']);
    expect(result.south.map((e) => e.arrival.id)).toEqual(['s1', 's2']);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `npx vitest run tests/bridge.test.ts`
Expected: FAIL — `computeBridgeTime` signature mismatch + `getViewpointById` not yet wired to direction classification.

- [ ] **Step 3: Refactor `src/bridge.ts`**

Replace the file with:
```ts
import type { Arrival } from './tfl';
import { classifyDirection, type Direction } from './direction';
import type { Viewpoint } from './viewpoints';

export interface BridgeEvent {
  arrival: Arrival;
  direction: Direction;
  bridgeTimeSeconds: number;
}

/** Compute how long until this arrival passes the viewpoint.
 *  For bridge viewpoints: offset is added to timeToStation (+ve northbound, -ve southbound).
 *  For station viewpoints: offset is 0, so bridgeTime == timeToStation. */
export function computeBridgeTime(arrival: Arrival, viewpoint: Viewpoint): number {
  const direction = classifyDirection(arrival, viewpoint);
  const offset = viewpoint.directions[direction].offsetSeconds;
  return arrival.timeToStation + offset;
}

const JUST_CROSSED_WINDOW_SECONDS = -30;

function toEvent(arrival: Arrival, viewpoint: Viewpoint): BridgeEvent {
  return {
    arrival,
    direction: classifyDirection(arrival, viewpoint),
    bridgeTimeSeconds: computeBridgeTime(arrival, viewpoint),
  };
}

export function pickNextNPerDirection(
  arrivals: Arrival[],
  n: number,
  viewpoint: Viewpoint,
): { north: BridgeEvent[]; south: BridgeEvent[] } {
  const events = arrivals
    .map((a) => toEvent(a, viewpoint))
    .filter((e) => e.bridgeTimeSeconds >= JUST_CROSSED_WINDOW_SECONDS)
    .sort((a, b) => a.bridgeTimeSeconds - b.bridgeTimeSeconds);

  return {
    north: events.filter((e) => e.direction === 'north').slice(0, n),
    south: events.filter((e) => e.direction === 'south').slice(0, n),
  };
}

export function pickNextPerDirection(
  arrivals: Arrival[],
  viewpoint: Viewpoint,
): { north?: BridgeEvent; south?: BridgeEvent } {
  const nexts = pickNextNPerDirection(arrivals, 1, viewpoint);
  return { north: nexts.north[0], south: nexts.south[0] };
}
```

- [ ] **Step 4: Update `src/direction.ts` to accept a viewpoint**

Replace the file with:
```ts
import type { Arrival } from './tfl';
import type { Viewpoint } from './viewpoints';

export type Direction = 'north' | 'south';

/**
 * Classify an arrival by travel direction relative to a viewpoint.
 *
 * TfL's `direction` field ("outbound" / "inbound") is the authoritative source —
 * it stays correct during engineering works when destinations change to shuttle
 * terminuses. We prefer it whenever TfL returns it.
 *
 * Falls back to destination-name matching against the viewpoint's configured
 * terminus names when `direction` is missing.
 */
export function classifyDirection(arrival: Arrival, viewpoint: Viewpoint): Direction {
  if (arrival.direction === viewpoint.directions.north.tflDirection) return 'north';
  if (arrival.direction === viewpoint.directions.south.tflDirection) return 'south';

  // Destination-name fallback: match against terminus names (case-insensitive substring).
  const dest = arrival.destinationName.toLowerCase();
  const northTerm = viewpoint.directions.north.terminusName.toLowerCase();
  if (dest.includes(northTerm)) return 'north';
  return 'south';
}
```

- [ ] **Step 5: Remove obsolete constants from `src/constants.ts`**

Replace the file with:
```ts
export const TFL_ARRIVALS_URL = (stopPointId: string) =>
  `https://api.tfl.gov.uk/StopPoint/${stopPointId}/Arrivals`;

export const POLL_INTERVAL_MS = 20_000;
export const STALE_THRESHOLD_MS = 60_000;
```

(Removes `WALTHAMSTOW_CENTRAL_STOPPOINT_ID`, `NORTHBOUND_OFFSET_SECONDS`, `SOUTHBOUND_OFFSET_SECONDS`, `EAST_AVE_BRIDGE`. These now live on the East Ave viewpoint record.)

- [ ] **Step 6: Update `src/main.ts` to pass viewpoint to bridge helpers**

In `src/main.ts`, change these lines:

```ts
// OLD (near top):
import { pickNextNPerDirection } from './bridge';
// ...
import { WALTHAMSTOW_CENTRAL_STOPPOINT_ID, POLL_INTERVAL_MS, EAST_AVE_BRIDGE } from './constants';

// NEW:
import { pickNextNPerDirection } from './bridge';
import { getViewpointById, DEFAULT_VIEWPOINT_ID } from './viewpoints';
import type { Viewpoint } from './viewpoints';
// ...
import { POLL_INTERVAL_MS } from './constants';
```

Add a viewpoint accessor near the state declarations (line ~34):
```ts
// Active viewpoint for this session. Starts at the default (East Ave); will be
// upgraded to the user's favourite in Task 7 once favourite persistence is added.
let activeViewpoint: Viewpoint = getViewpointById(DEFAULT_VIEWPOINT_ID)!;
```

Update `tick()` (line ~245) to pass the active viewpoint:
```ts
async function tick(): Promise<void> {
  try {
    const arrivals = await fetchArrivals(activeViewpoint.stopPointId);
    const picked = pickNextNPerDirection(arrivals, TICKER_SIZE, activeViewpoint);
    // ... rest unchanged
```

Update `computeWalkingLabel()` (line ~139) — replace `EAST_AVE_BRIDGE` with `activeViewpoint.coords`:
```ts
const est = walkingEstimate(position, activeViewpoint.coords);
```

- [ ] **Step 7: Update `tests/direction.test.ts`**

Open `tests/direction.test.ts` and replace the factory + tests to pass a viewpoint:
```ts
import { describe, it, expect } from 'vitest';
import { classifyDirection } from '../src/direction';
import type { Arrival } from '../src/tfl';
import { getViewpointById } from '../src/viewpoints';

const EAST_AVE = getViewpointById('east-ave')!;
const QUEENS_ROAD = getViewpointById('queens-road')!;

function arrival(destinationName: string, direction?: string): Arrival {
  return {
    id: 'x',
    stationName: 'Walthamstow Central',
    lineId: 'weaver',
    destinationName,
    timeToStation: 120,
    expectedArrival: '2026-04-17T10:00:00Z',
    modeName: 'overground',
    platformName: 'Platform 1',
    direction,
  };
}

describe('classifyDirection — East Ave', () => {
  it('uses TfL outbound/inbound when present', () => {
    expect(classifyDirection(arrival('Chingford', 'outbound'), EAST_AVE)).toBe('north');
    expect(classifyDirection(arrival('Liverpool Street', 'inbound'), EAST_AVE)).toBe('south');
  });

  it('prefers TfL direction over destination name', () => {
    // Shuttle to Wood Street during works — TfL direction still says outbound.
    expect(classifyDirection(arrival('Wood Street', 'outbound'), EAST_AVE)).toBe('north');
  });

  it('falls back to destination-name match when TfL direction is missing', () => {
    expect(classifyDirection(arrival('Chingford'), EAST_AVE)).toBe('north');
    expect(classifyDirection(arrival('Liverpool Street'), EAST_AVE)).toBe('south');
  });
});

describe('classifyDirection — Queens Road', () => {
  it('uses TfL outbound/inbound when present (north=Barking, south=Gospel Oak)', () => {
    expect(classifyDirection(arrival('Barking Riverside', 'outbound'), QUEENS_ROAD)).toBe('north');
    expect(classifyDirection(arrival('Gospel Oak', 'inbound'), QUEENS_ROAD)).toBe('south');
  });

  it('falls back to destination-name match for north terminus', () => {
    expect(classifyDirection(arrival('Barking Riverside'), QUEENS_ROAD)).toBe('north');
  });
});
```

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all tests pass. The `bridge.test.ts` and `direction.test.ts` files now use the viewpoint parameter.

- [ ] **Step 9: Typecheck + build**

Run: `npm run build`
Expected: `tsc --noEmit` passes, Vite build succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/bridge.ts src/direction.ts src/constants.ts src/main.ts tests/bridge.test.ts tests/direction.test.ts
git commit -m "refactor: thread viewpoint through bridge + direction helpers

computeBridgeTime and pickNextPerDirection now take a Viewpoint argument
instead of reading hard-coded offsets from constants.ts. classifyDirection
uses the viewpoint's tflDirection mapping (outbound→north etc.) with
terminus-name fallback.

Removes obsolete constants (WALTHAMSTOW_CENTRAL_STOPPOINT_ID,
NORTHBOUND_OFFSET_SECONDS, SOUTHBOUND_OFFSET_SECONDS, EAST_AVE_BRIDGE) —
their values now live on the east-ave viewpoint record.

main.ts holds activeViewpoint state (East Ave for now; Task 7 swaps this
for the user's stored favourite) and passes it into tick() + the
walking-time label computation."
```

---

## Task 3: Refactor `estimatePosition` to take a viewpoint

**Files:**
- Modify: `src/trainPosition.ts`
- Modify: `tests/trainPosition.test.ts`
- Modify: `src/main.ts` (pass active viewpoint to `livePosition`)

**Context:** `estimatePosition` currently hard-codes the Chingford-branch segment tables and the East-Ave-specific three-phase northbound model. We parameterise it by viewpoint, branching on `positionModel`: `'east-ave-bridge'` preserves the existing behaviour; `'station'` parks the train at the anchor for a short post-arrival window.

- [ ] **Step 1: Update `tests/trainPosition.test.ts`**

Replace the file with:
```ts
import { describe, it, expect } from 'vitest';
import { estimatePosition } from '../src/trainPosition';
import { getViewpointById } from '../src/viewpoints';

const EAST_AVE = getViewpointById('east-ave')!;
const QUEENS_ROAD = getViewpointById('queens-road')!;

describe('estimatePosition — East Ave bridge model', () => {
  it('returns 5 (WC) for tts=0 regardless of direction', () => {
    expect(estimatePosition(0, 'north', EAST_AVE)).toBe(5);
    expect(estimatePosition(0, 'south', EAST_AVE)).toBe(5);
  });

  describe('southbound', () => {
    it('tts=120 → position 6 (Wood Street)', () => {
      expect(estimatePosition(120, 'south', EAST_AVE)).toBe(6);
    });

    it('tts=180 → position 6.5 (halfway Wds↔Hig)', () => {
      expect(estimatePosition(180, 'south', EAST_AVE)).toBe(6.5);
    });

    it('tts=300 → position ≈7.33 (one-third into Hig↔Chg)', () => {
      const pos = estimatePosition(300, 'south', EAST_AVE);
      expect(pos!).toBeCloseTo(7.333, 2);
    });

    it('tts=420 → position 8 (Chingford)', () => {
      expect(estimatePosition(420, 'south', EAST_AVE)).toBe(8);
    });

    it('tts=600 → position 8 (clamped)', () => {
      expect(estimatePosition(600, 'south', EAST_AVE)).toBe(8);
    });

    it('tts=-10 → position 5 (just arrived, parks briefly at WC)', () => {
      expect(estimatePosition(-10, 'south', EAST_AVE)).toBe(5);
    });

    it('tts=-40 → null (beyond southbound post-arrival window)', () => {
      expect(estimatePosition(-40, 'south', EAST_AVE)).toBeNull();
    });
  });

  describe('northbound', () => {
    it('tts=120 → position 4 (St James Street)', () => {
      expect(estimatePosition(120, 'north', EAST_AVE)).toBe(4);
    });

    it('tts=300 → position 3 (Clapton)', () => {
      expect(estimatePosition(300, 'north', EAST_AVE)).toBe(3);
    });

    it('tts=510 → position 1.5 (halfway Bth↔Hck)', () => {
      expect(estimatePosition(510, 'north', EAST_AVE)).toBe(1.5);
    });

    it('tts=-15 → position 5 (dwell phase at WC)', () => {
      expect(estimatePosition(-15, 'north', EAST_AVE)).toBe(5);
    });

    it('tts=-60 → position 5.25 (mid bridge-crossing)', () => {
      const pos = estimatePosition(-60, 'north', EAST_AVE);
      expect(pos!).toBeCloseTo(5.25, 2);
    });

    it('tts=-120 → position 6 (reached Wood Street)', () => {
      expect(estimatePosition(-120, 'north', EAST_AVE)).toBe(6);
    });

    it('tts=-130 → null (beyond northbound post-arrival window)', () => {
      expect(estimatePosition(-130, 'north', EAST_AVE)).toBeNull();
    });
  });
});

describe('estimatePosition — Queens Road (station model)', () => {
  it('tts=0 → anchor index 6 (WQR), both directions', () => {
    expect(estimatePosition(0, 'north', QUEENS_ROAD)).toBe(6);
    expect(estimatePosition(0, 'south', QUEENS_ROAD)).toBe(6);
  });

  it('tts=180 northbound (approaching from south of WQR) → position 5 (BHR)', () => {
    // WQR=6, segment BHR(5) → WQR(6) = 180s. At tts=180, train is at BHR.
    expect(estimatePosition(180, 'north', QUEENS_ROAD)).toBe(5);
  });

  it('tts=180 southbound (approaching from north of WQR) → position 7 (LMR)', () => {
    // Segment WQR(6) → LMR(7) = 180s. At tts=180, train is at LMR.
    expect(estimatePosition(180, 'south', QUEENS_ROAD)).toBe(7);
  });

  it('tts=-10 → position 6 (parks at WQR briefly after arrival)', () => {
    expect(estimatePosition(-10, 'north', QUEENS_ROAD)).toBe(6);
    expect(estimatePosition(-10, 'south', QUEENS_ROAD)).toBe(6);
  });

  it('tts=-40 → null (beyond post-arrival window)', () => {
    expect(estimatePosition(-40, 'north', QUEENS_ROAD)).toBeNull();
    expect(estimatePosition(-40, 'south', QUEENS_ROAD)).toBeNull();
  });

  it('tts > MAX_REASONABLE returns null', () => {
    expect(estimatePosition(2000, 'north', QUEENS_ROAD)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run tests/trainPosition.test.ts`
Expected: FAIL — signature mismatch (new third argument).

- [ ] **Step 3: Rewrite `src/trainPosition.ts`**

Replace the file with:
```ts
import type { Direction } from './direction';
import type { Viewpoint, PositionModel } from './viewpoints';

const MAX_REASONABLE_SECONDS = 30 * 60;
const POST_ARRIVAL_WINDOW_SECONDS = 30;

// East-Ave-bridge-specific constants (three-phase northbound: dwell → cross → continue).
const EAST_AVE_BRIDGE_POSITION = 5.5; // between WC (index 5) and Wood Street (index 6)
const EAST_AVE_NB_DWELL_SECONDS = 30;
const EAST_AVE_NB_WC_TO_BRIDGE_SECONDS = 60;
const EAST_AVE_NB_BRIDGE_TO_WDS_SECONDS = 30;
const EAST_AVE_NB_TOTAL_POST_WC_SECONDS =
  EAST_AVE_NB_DWELL_SECONDS + EAST_AVE_NB_WC_TO_BRIDGE_SECONDS + EAST_AVE_NB_BRIDGE_TO_WDS_SECONDS; // = 120

/**
 * Estimate a train's position on a viewpoint's strip as a floating-point
 * index in [0, stops.length - 1], given its remaining timeToStation and
 * direction of travel.
 *
 * Returns null when the prediction falls outside the modelled window (either
 * too-far-future or past the post-arrival window).
 */
export function estimatePosition(
  timeToStationSeconds: number,
  direction: Direction,
  viewpoint: Viewpoint,
): number | null {
  if (timeToStationSeconds > MAX_REASONABLE_SECONDS) return null;

  // Post-arrival: train has reached (or passed) the anchor station.
  if (timeToStationSeconds < 0) {
    return postArrivalPosition(timeToStationSeconds, direction, viewpoint);
  }

  // Pre-arrival: interpolate along segments from the approaching side.
  return preArrivalPosition(timeToStationSeconds, direction, viewpoint);
}

function preArrivalPosition(tts: number, direction: Direction, viewpoint: Viewpoint): number {
  const { stops, segments, anchorIndex } = viewpoint;
  const lastIndex = stops.length - 1;

  // Northbound trains approach the anchor from lower indices (south-ish on strip).
  // Southbound trains approach from higher indices.
  // Build a list of segments to step through, starting at the anchor and walking
  // AWAY from it in the approach direction.
  const segmentsToWalk =
    direction === 'north'
      ? [...segments].reverse().filter((s) => s.farIndex <= anchorIndex)
      : segments.filter((s) => s.nearIndex >= anchorIndex);

  let accumulated = 0;
  for (const seg of segmentsToWalk) {
    // For northbound: we're walking from anchor toward index 0; near = toward anchor, far = away.
    // For southbound: we're walking from anchor toward lastIndex; near = toward anchor, far = away.
    const toward = direction === 'north' ? seg.farIndex : seg.nearIndex;
    const away = direction === 'north' ? seg.nearIndex : seg.farIndex;

    if (tts <= accumulated + seg.seconds) {
      const progress = (tts - accumulated) / seg.seconds;
      // At tts=accumulated the train is at `away` (just left it); at accumulated+seg.seconds it's at `toward` (about to enter).
      // Wait — that's backwards. At tts=accumulated the train is closer to the anchor; at tts=accumulated+seg.seconds the train is further.
      // Let me re-reason: tts is TIME REMAINING to the anchor. So higher tts = further from anchor.
      // Segment seconds = time to traverse. At tts=accumulated the train has just entered this segment from the anchor side (position `toward` = closer to anchor).
      // As tts increases within this segment, the train moves away from anchor (toward `away`).
      // So at tts=accumulated, pos=toward; at tts=accumulated+seg.seconds, pos=away.
      return toward + progress * (away - toward);
    }
    accumulated += seg.seconds;
  }

  // Beyond all modelled segments: clamp to the far terminus.
  return direction === 'north' ? 0 : lastIndex;
}

function postArrivalPosition(tts: number, direction: Direction, viewpoint: Viewpoint): number | null {
  if (viewpoint.positionModel === 'east-ave-bridge') {
    return eastAveBridgePostArrival(tts, direction, viewpoint);
  }
  // 'station' model: both directions park at the anchor for a short post-arrival window.
  if (tts < -POST_ARRIVAL_WINDOW_SECONDS) return null;
  return viewpoint.anchorIndex;
}

function eastAveBridgePostArrival(tts: number, direction: Direction, viewpoint: Viewpoint): number | null {
  if (direction === 'south') {
    // Southbound has already crossed the bridge before reaching WC — park briefly at WC.
    if (tts < -POST_ARRIVAL_WINDOW_SECONDS) return null;
    return viewpoint.anchorIndex;
  }
  // Northbound: three-phase model.
  if (tts < -EAST_AVE_NB_TOTAL_POST_WC_SECONDS) return null;
  const elapsed = -tts;

  // Phase 1: dwelling at WC.
  if (elapsed <= EAST_AVE_NB_DWELL_SECONDS) return viewpoint.anchorIndex;

  // Phase 2: moving from WC to the bridge.
  const postDwell = elapsed - EAST_AVE_NB_DWELL_SECONDS;
  if (postDwell <= EAST_AVE_NB_WC_TO_BRIDGE_SECONDS) {
    const progress = postDwell / EAST_AVE_NB_WC_TO_BRIDGE_SECONDS;
    return viewpoint.anchorIndex + progress * (EAST_AVE_BRIDGE_POSITION - viewpoint.anchorIndex);
  }

  // Phase 3: past the bridge, continuing to Wood Street.
  const postBridge = postDwell - EAST_AVE_NB_WC_TO_BRIDGE_SECONDS;
  const progress = postBridge / EAST_AVE_NB_BRIDGE_TO_WDS_SECONDS;
  return EAST_AVE_BRIDGE_POSITION + progress * (viewpoint.anchorIndex + 1 - EAST_AVE_BRIDGE_POSITION);
}

// Export for tests / future use.
export type { PositionModel };
```

- [ ] **Step 4: Run the test — expect pass**

Run: `npx vitest run tests/trainPosition.test.ts`
Expected: PASS — all 20+ position tests green.

If any fail, examine the failure carefully. The most likely culprit is the pre-arrival segment walk logic (the `toward`/`away` reasoning is easy to flip). The expected behaviour:
- East Ave northbound tts=120 → position 4 (train is at StJ, one segment south of WC)
- East Ave southbound tts=120 → position 6 (train is at WDS, one segment north of WC)

- [ ] **Step 5: Update `src/main.ts` to pass the active viewpoint**

In `src/main.ts`, update `livePosition`:
```ts
function livePosition(snap: DirectionSnapshots, index: number, nowMs: number): number | null {
  const ev = snap.events[index];
  if (!ev) return null;
  const elapsedSeconds = (nowMs - snap.snapshottedAtMs) / 1000;
  const currentTts = ev.arrival.timeToStation - elapsedSeconds;
  return estimatePosition(currentTts, ev.direction, activeViewpoint);
}
```

- [ ] **Step 6: Run full test suite + build**

Run: `npm test && npm run build`
Expected: all tests pass; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add src/trainPosition.ts tests/trainPosition.test.ts src/main.ts
git commit -m "refactor: estimatePosition takes a Viewpoint

The three-phase East Ave northbound model (dwell at WC → cross bridge →
continue to Wood Street) now lives behind the 'east-ave-bridge' position
model tag. Other viewpoints use the simpler 'station' model that parks
the train at the anchor index for 30s after arrival.

Queens Road uses the 'station' model — no bridge animation, just a brief
post-arrival park. Works for both directions since offset=0.

Segment walking is now generic: it uses the viewpoint's segments array
and anchorIndex, no more hard-coded SEGMENTS_NORTH/SOUTH_OF_WC imports."
```

---

## Task 4: Refactor `strip.ts` to accept stops + line colour

**Files:**
- Modify: `src/strip.ts`
- Modify: `src/main.ts` (thread viewpoint through to strip)
- Modify: `src/render.ts` (accept viewpoint in render options, pass to strip)

**Context:** `renderDirectionStrip` currently imports `STOPS` from `stops.ts` directly. It needs to accept the active viewpoint's stops + anchorIndex + lineColor, so switching viewpoints swaps the displayed strip entirely.

- [ ] **Step 1: Refactor `src/strip.ts`**

Replace the file with:
```ts
import type { Stop } from './stops';
import type { Direction } from './direction';
import { currentTheme, type Theme } from './season';
import { toot } from './toot';

export interface StripModel {
  direction: Direction;
  pos: number | null;
  celebrate: boolean;
  stops: readonly Stop[];
  anchorIndex: number;
  /** Strip position of the bridge graphic, if any. For station viewpoints, null. */
  bridgeStripPosition: number | null;
  /** Label for the bridge graphic ("East Av") when bridgeStripPosition is set. */
  bridgeLabel: string | null;
  lineNameForAria: string; // e.g. 'Weaver line', 'Suffragette line'
}

const BRIDGE_SVG = `
<svg class="strip-bridge-svg" viewBox="0 0 28 16" aria-hidden="true">
  <path d="M2 13 L2 10 Q2 3 14 3 Q26 3 26 10 L26 13 Z" fill="currentColor"/>
  <rect x="0" y="13" width="28" height="2" fill="currentColor"/>
</svg>
`;

// Stylised Class 710 Aventra. `.train-livery` + `.train-body` now use currentColor
// so the viewpoint's --line-color drives the livery.
const TRAIN_SVG = `
<svg class="strip-train-svg" viewBox="0 0 52 22" aria-hidden="true">
  <path class="train-body" d="M1 4 L42 4 L50 8 L50 17 L1 17 Z"/>
  <rect class="train-livery" x="1" y="15" width="49" height="2"/>
  <rect class="train-window" x="4" y="6.5" width="4.5" height="4.5" rx="0.5"/>
  <rect class="train-window" x="11" y="6.5" width="4.5" height="4.5" rx="0.5"/>
  <rect class="train-window" x="18" y="6.5" width="4.5" height="4.5" rx="0.5"/>
  <rect class="train-window" x="25" y="6.5" width="4.5" height="4.5" rx="0.5"/>
  <rect class="train-window" x="32" y="6.5" width="4.5" height="4.5" rx="0.5"/>
  <rect class="train-door" x="9" y="5" width="1.8" height="10.5"/>
  <rect class="train-door" x="23" y="5" width="1.8" height="10.5"/>
  <rect class="train-door" x="37" y="5" width="1.8" height="10.5"/>
  <path class="train-cab" d="M40 6 L48 9 L48 12.5 L40 12.5 Z"/>
  <rect class="train-bogie" x="5" y="17" width="9" height="3" rx="0.5"/>
  <rect class="train-bogie" x="33" y="17" width="9" height="3" rx="0.5"/>
</svg>
`;

type NonNullTheme = Exclude<Theme, null>;

const THEME_OVERLAYS: Record<NonNullTheme, string> = {
  /* IMPORTANT: before running the file-replace, open the CURRENT src/strip.ts
     and copy the THEME_OVERLAYS dict verbatim (10 entries: winter-ski,
     world-book-day, easter, spring, summer, autumn, halloween, bonfire,
     christmas, new-year). The dict is ~85 lines of SVG overlays — we're
     preserving it as-is in this refactor, not rewriting it. */
};

function themedTrainSvg(theme: Theme): string {
  if (theme === null) return TRAIN_SVG;
  return TRAIN_SVG.replace('</svg>', `${THEME_OVERLAYS[theme]}</svg>`);
}

function createTrainElement(direction: Direction, theme: Theme, lastIndex: number): HTMLElement {
  const el = document.createElement('div');
  el.className = `strip-train strip-train-${direction}`;
  // North trains start at position 0 (left), south at lastIndex (right).
  el.style.setProperty('--pos', direction === 'north' ? '0' : String(lastIndex));
  el.dataset.theme = theme ?? '';

  const inner = document.createElement('div');
  inner.className = 'strip-train-inner';
  inner.innerHTML = themedTrainSvg(theme);
  el.appendChild(inner);

  el.addEventListener('click', () => {
    toot();
    el.classList.remove('tooting');
    void el.offsetWidth;
    el.classList.add('tooting');
  });

  return el;
}

function refreshTrainTheme(strip: HTMLElement, theme: Theme): void {
  strip.querySelectorAll<HTMLElement>('.strip-train').forEach((train) => {
    if (train.dataset.theme === (theme ?? '')) return;
    train.dataset.theme = theme ?? '';
    const inner = train.querySelector<HTMLElement>('.strip-train-inner');
    if (inner) inner.innerHTML = themedTrainSvg(theme);
  });
}

const previousPos: Partial<Record<Direction, number>> = {};
// Remember which viewpoint each direction's strip last rendered for, so we can
// tear down and rebuild when it changes.
const previousViewpointStops = new WeakMap<HTMLElement, readonly Stop[]>();

export function renderDirectionStrip(
  el: HTMLElement | null,
  model: StripModel,
): HTMLElement {
  // If the stops list changed (e.g. user switched viewpoints), force a rebuild.
  const stale = el !== null && previousViewpointStops.get(el) !== model.stops;
  const strip = stale || el === null ? buildSkeleton(model) : el;
  previousViewpointStops.set(strip, model.stops);

  refreshTrainTheme(strip, currentTheme(new Date()));
  updateDynamic(strip, model);

  const prev = previousPos[model.direction];
  if (prev !== undefined && model.pos !== null && prev !== model.pos) {
    const lo = Math.min(prev, model.pos);
    const hi = Math.max(prev, model.pos);
    for (let i = Math.ceil(lo); i <= Math.floor(hi); i++) {
      pulsePip(strip, i);
    }
  }
  if (model.pos !== null) previousPos[model.direction] = model.pos;
  else delete previousPos[model.direction];

  return strip;
}

function pulsePip(strip: HTMLElement, index: number): void {
  const pips = strip.querySelectorAll<HTMLElement>('.strip-pip');
  const pip = pips[index];
  if (!pip) return;
  pip.classList.remove('pulsing');
  void pip.offsetWidth;
  pip.classList.add('pulsing');
}

function buildSkeleton(model: StripModel): HTMLElement {
  const container = document.createElement('section');
  container.className = `strip strip-${model.direction}`;
  container.setAttribute(
    'aria-label',
    model.direction === 'north'
      ? `Northbound train position on the ${model.lineNameForAria}`
      : `Southbound train position on the ${model.lineNameForAria}`,
  );
  // Expose the stop count to CSS so --pos → translate math scales.
  container.style.setProperty('--stop-count', String(model.stops.length));

  const line = document.createElement('div');
  line.className = 'strip-line';
  container.appendChild(line);

  for (const stop of model.stops) {
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

  if (model.bridgeStripPosition !== null && model.bridgeLabel !== null) {
    const bridge = document.createElement('div');
    bridge.className = 'strip-bridge';
    bridge.style.setProperty('--pos', String(model.bridgeStripPosition));
    bridge.innerHTML = `${BRIDGE_SVG}<span class="strip-bridge-label">${model.bridgeLabel}</span>`;
    container.appendChild(bridge);
  }

  const theme = currentTheme(new Date());
  const train = createTrainElement(model.direction, theme, model.stops.length - 1);
  container.appendChild(train);

  return container;
}

function updateDynamic(container: HTMLElement, model: StripModel): void {
  const train = container.querySelector<HTMLElement>('.strip-train')!;
  const bridge = container.querySelector<HTMLElement>('.strip-bridge');

  setTrain(train, model.pos);
  if (bridge) bridge.classList.toggle('celebrating', model.celebrate);
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

**Important:** When you write this file, copy the existing `THEME_OVERLAYS` dict verbatim from the current `src/strip.ts` — the 10 entries (winter-ski, world-book-day, easter, spring, summer, autumn, halloween, bonfire, christmas, new-year). The placeholder comment in the snippet above says "unchanged".

- [ ] **Step 2: Update `src/render.ts` to accept viewpoint in RenderOptions and build StripModel**

In `src/render.ts`, update the imports + types:
```ts
// At the top of src/render.ts, add imports:
import type { Viewpoint } from './viewpoints';
// The import for renderDirectionStrip stays the same.
```

Update `ViewModel`:
```ts
export interface ViewModel {
  // ... existing fields ...
  viewpoint: Viewpoint;   // active viewpoint — drives strip, header, theming
  // remove: nothing, just add `viewpoint`
}
```

Update the two `renderDirectionStrip()` calls (around lines 83 and 91):
```ts
// OLD:
const stripN = renderDirectionStrip(existingStripN, {
  direction: 'north',
  pos: vm.northPos,
  celebrate: vm.celebrate.north,
});

// NEW:
const stripN = renderDirectionStrip(existingStripN, {
  direction: 'north',
  pos: vm.northPos,
  celebrate: vm.celebrate.north,
  stops: vm.viewpoint.stops,
  anchorIndex: vm.viewpoint.anchorIndex,
  bridgeStripPosition: vm.viewpoint.positionModel === 'east-ave-bridge' ? 5.5 : null,
  bridgeLabel: vm.viewpoint.positionModel === 'east-ave-bridge' ? 'East Av' : null,
  lineNameForAria: `${vm.viewpoint.lineName} line`,
});
```

And the same for `stripS` (with `direction: 'south'`).

Also update the `renderDirection()` calls (lines 82, 86) to use the viewpoint's direction labels:
```ts
// OLD:
root.appendChild(renderDirection('→ Chingford', vm.north, 'Next train to Chingford', vm.northConfidence));

// NEW:
root.appendChild(renderDirection(
  vm.viewpoint.directions.north.label,
  vm.north,
  `Next train to ${vm.viewpoint.directions.north.terminusName}`,
  vm.northConfidence,
));
```

Same for the south call.

- [ ] **Step 3: Update `src/main.ts` `buildViewModel()` to include the viewpoint**

In `src/main.ts`, add `viewpoint: activeViewpoint` to the return of `buildViewModel()`:
```ts
return {
  // ... existing fields ...
  viewpoint: activeViewpoint,
};
```

- [ ] **Step 4: Run tests + build**

Run: `npm test && npm run build`
Expected: all tests pass; tsc clean. The previous test suite should still be 134+ passing (no new tests added in this task).

- [ ] **Step 5: Manual sanity check (dev server)**

Run: `npm run dev`
Open: `http://localhost:5173`
Expected: the app renders normally — East Ave strip with Chingford-branch stops, hero countdowns labelled "→ Chingford" and "← Walthamstow Central", cartoon train animates. Nothing should look different from before this task.

- [ ] **Step 6: Commit**

```bash
git add src/strip.ts src/render.ts src/main.ts
git commit -m "refactor: renderDirectionStrip takes stops + anchorIndex + bridge config

Strip rendering is now data-driven from the viewpoint: stops list, anchor
index, optional bridge graphic position + label. Train travels from index
0 to stops.length-1 (scales correctly for Suffragette's 13-stop line vs
Weaver's 9).

StripModel also carries lineNameForAria so the aria-label stays line-specific.
The train's .train-livery + .train-body SVG use currentColor (CSS drives
the final livery in Task 6).

render.ts threads the viewpoint through ViewModel and builds both the
direction labels and the strip model from it."
```

---

## Task 5: Favourite persistence + active viewpoint state

**Files:**
- Modify: `src/main.ts`

**Context:** So far `activeViewpoint` always equals the default. Now we add the favourite-on-boot behaviour: read `wtt_favourite_viewpoint` from `localStorage`, validate it, use it as the initial active viewpoint. Also expose `setFavourite(id)` and `switchViewpoint(id)` functions that the switcher (Task 6) will call.

- [ ] **Step 1: Add favourite state to `src/main.ts`**

Near the top of `src/main.ts`, after the existing `WALKING_STORAGE_KEY` declaration:
```ts
const FAVOURITE_STORAGE_KEY = 'wtt_favourite_viewpoint';

/** Load the stored favourite viewpoint id, validating that it points at a
 *  real viewpoint. Falls back to DEFAULT_VIEWPOINT_ID if missing or stale. */
function loadFavouriteViewpointId(): string {
  const stored = safeLocalRead(FAVOURITE_STORAGE_KEY);
  if (stored && getViewpointById(stored)) return stored;
  return DEFAULT_VIEWPOINT_ID;
}

let favouriteViewpointId = loadFavouriteViewpointId();
```

Change `activeViewpoint` to start at the favourite (not the default):
```ts
let activeViewpoint: Viewpoint = getViewpointById(favouriteViewpointId)!;
```

Add two exported functions for the switcher to call:
```ts
export function setFavouriteViewpoint(id: string): void {
  if (!getViewpointById(id)) return; // guard against stale ids
  favouriteViewpointId = id;
  safeLocalWrite(FAVOURITE_STORAGE_KEY, id);
  rerender();
}

export function switchToViewpoint(id: string): void {
  const next = getViewpointById(id);
  if (!next || next.id === activeViewpoint.id) return;
  activeViewpoint = next;
  // Clear snapshots so the UI shows "Connecting to TfL…" until the next
  // poll resolves against the new stoppoint. Also reset prediction samples
  // since they're keyed on the old vehicleIds.
  snapshots = {};
  predictionSamples.north.length = 0;
  predictionSamples.south.length = 0;
  // Update the document title to reflect the new viewpoint.
  document.title = `East Ave Trains — ${activeViewpoint.name}`;
  // Update the --line-color CSS custom property so the header + train livery
  // pick up the new colour immediately.
  document.documentElement.style.setProperty('--line-color', activeViewpoint.lineColor);
  rerender();
  // Fire an immediate fetch against the new stoppoint — don't wait for the
  // next scheduled poll (20 s away).
  void tick();
}
```

At the bottom of the file, add a one-time initial setup to sync the CSS custom property + title on boot:
```ts
// Sync CSS + title to the booted viewpoint. These normally update on switch,
// but first-paint needs them too.
document.documentElement.style.setProperty('--line-color', activeViewpoint.lineColor);
document.title = `East Ave Trains — ${activeViewpoint.name}`;
```

Place this block directly above the existing `startRenderLoop();` line at the end of the file.

- [ ] **Step 2: Update the ViewModel + render options to expose favourite status**

In `src/render.ts`, extend the `ViewModel`:
```ts
export interface ViewModel {
  // ... existing fields ...
  viewpoint: Viewpoint;
  favouriteViewpointId: string;   // id of the user's current favourite
}

export interface RenderOptions {
  onEnableWalkingTime: () => void;
  onDisableWalkingTime: () => void;
  onAdvanceFact: () => void;
  onSwitchViewpoint: (id: string) => void;
  onSetFavouriteViewpoint: (id: string) => void;
}
```

In `src/main.ts` `buildViewModel()` return:
```ts
return {
  // ... existing ...
  viewpoint: activeViewpoint,
  favouriteViewpointId,
};
```

And in the `rerender()` function, pass the new callbacks:
```ts
function rerender(): void {
  render(root, buildViewModel(), {
    onEnableWalkingTime: enableWalkingTime,
    onDisableWalkingTime: disableWalkingTime,
    onAdvanceFact: () => {
      advanceFact();
      rerender();
    },
    onSwitchViewpoint: switchToViewpoint,
    onSetFavouriteViewpoint: setFavouriteViewpoint,
  });
}
```

- [ ] **Step 3: Run tests + build**

Run: `npm test && npm run build`
Expected: tests pass, tsc clean. Note: no new test file yet — Task 6 adds `switcher.test.ts` which tests these callbacks.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/render.ts
git commit -m "feat: favourite viewpoint persistence + switch/favourite actions

Reads wtt_favourite_viewpoint from localStorage on boot, validates it
against VIEWPOINTS, and uses it as the initial activeViewpoint. Falls back
to DEFAULT_VIEWPOINT_ID ('east-ave') if the stored value is missing or
points at a non-existent viewpoint (future-proofing for removed spots).

Exposes setFavouriteViewpoint(id) and switchToViewpoint(id) for the
switcher UI to call. switchToViewpoint:
 - Updates activeViewpoint
 - Clears snapshots so the UI shows a fresh 'Connecting to TfL…' state
 - Resets prediction samples (old vehicleIds are irrelevant)
 - Updates document.title + --line-color CSS custom property
 - Fires an immediate poll against the new stoppoint

Favourite is a pure flag — setFavouriteViewpoint does NOT change the
active viewpoint, only the stored preference for next boot."
```

---

## Task 6: Build the switcher UI

**Files:**
- Create: `src/switcher.ts`
- Create: `tests/switcher.test.ts`
- Modify: `src/render.ts` (render switcher instead of static header)
- Modify: `index.html` (remove static header text)

**Context:** The switcher is a tappable line-name header that expands an inline sheet listing viewpoints with per-row star buttons. Separate file since it's a self-contained component.

- [ ] **Step 1: Write `tests/switcher.test.ts`**

Create `tests/switcher.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderSwitcher, type SwitcherModel } from '../src/switcher';
import { getViewpointById } from '../src/viewpoints';

const EAST_AVE = getViewpointById('east-ave')!;
const QUEENS_ROAD = getViewpointById('queens-road')!;

function baseModel(overrides: Partial<SwitcherModel> = {}): SwitcherModel {
  return {
    activeViewpoint: EAST_AVE,
    favouriteViewpointId: EAST_AVE.id,
    onSwitch: vi.fn(),
    onSetFavourite: vi.fn(),
    ...overrides,
  };
}

describe('renderSwitcher', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders the active line name + viewpoint name in the closed header', () => {
    const el = renderSwitcher(null, baseModel());
    container.appendChild(el);
    const header = el.querySelector<HTMLElement>('.switcher-header')!;
    expect(header.textContent).toContain('Weaver');
    expect(header.textContent).toContain('East Ave bridge');
  });

  it('closed header has aria-expanded=false and the sheet is not visible', () => {
    const el = renderSwitcher(null, baseModel());
    const header = el.querySelector<HTMLButtonElement>('.switcher-header')!;
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.switcher-sheet')?.classList.contains('open')).toBeFalsy();
  });

  it('clicking the header opens the sheet', () => {
    const el = renderSwitcher(null, baseModel());
    const header = el.querySelector<HTMLButtonElement>('.switcher-header')!;
    header.click();
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.switcher-sheet')?.classList.contains('open')).toBeTruthy();
  });

  it('sheet lists every viewpoint with a row + star button', () => {
    const el = renderSwitcher(null, baseModel());
    const header = el.querySelector<HTMLButtonElement>('.switcher-header')!;
    header.click();
    const rows = el.querySelectorAll('.switcher-row');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    rows.forEach((row) => {
      expect(row.querySelector('.switcher-star')).toBeTruthy();
    });
  });

  it('clicking a row calls onSwitch with its id and does NOT call onSetFavourite', () => {
    const onSwitch = vi.fn();
    const onSetFavourite = vi.fn();
    const el = renderSwitcher(null, baseModel({ onSwitch, onSetFavourite }));
    const header = el.querySelector<HTMLButtonElement>('.switcher-header')!;
    header.click();
    const queensRow = el.querySelector<HTMLButtonElement>(`.switcher-row[data-id="${QUEENS_ROAD.id}"]`)!;
    queensRow.click();
    expect(onSwitch).toHaveBeenCalledWith(QUEENS_ROAD.id);
    expect(onSetFavourite).not.toHaveBeenCalled();
  });

  it('clicking a star calls onSetFavourite with its id and does NOT call onSwitch', () => {
    const onSwitch = vi.fn();
    const onSetFavourite = vi.fn();
    const el = renderSwitcher(null, baseModel({ onSwitch, onSetFavourite }));
    const header = el.querySelector<HTMLButtonElement>('.switcher-header')!;
    header.click();
    const queensStar = el.querySelector<HTMLButtonElement>(
      `.switcher-row[data-id="${QUEENS_ROAD.id}"] .switcher-star`,
    )!;
    queensStar.click();
    expect(onSetFavourite).toHaveBeenCalledWith(QUEENS_ROAD.id);
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('marks the current favourite with a filled star', () => {
    const el = renderSwitcher(null, baseModel({ favouriteViewpointId: QUEENS_ROAD.id }));
    const header = el.querySelector<HTMLButtonElement>('.switcher-header')!;
    header.click();
    const queensStar = el.querySelector<HTMLButtonElement>(
      `.switcher-row[data-id="${QUEENS_ROAD.id}"] .switcher-star`,
    )!;
    expect(queensStar.classList.contains('filled')).toBe(true);
    const eastStar = el.querySelector<HTMLButtonElement>(
      `.switcher-row[data-id="${EAST_AVE.id}"] .switcher-star`,
    )!;
    expect(eastStar.classList.contains('filled')).toBe(false);
  });

  it('marks the active viewpoint with aria-selected=true on its row', () => {
    const el = renderSwitcher(null, baseModel({ activeViewpoint: EAST_AVE }));
    const header = el.querySelector<HTMLButtonElement>('.switcher-header')!;
    header.click();
    const eastRow = el.querySelector<HTMLButtonElement>(`.switcher-row[data-id="${EAST_AVE.id}"]`)!;
    const queensRow = el.querySelector<HTMLButtonElement>(`.switcher-row[data-id="${QUEENS_ROAD.id}"]`)!;
    expect(eastRow.getAttribute('aria-selected')).toBe('true');
    expect(queensRow.getAttribute('aria-selected')).toBe('false');
  });

  it('Escape key closes the sheet', () => {
    const el = renderSwitcher(null, baseModel());
    const header = el.querySelector<HTMLButtonElement>('.switcher-header')!;
    header.click();
    expect(header.getAttribute('aria-expanded')).toBe('true');
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    el.dispatchEvent(event);
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('re-rendering preserves the header DOM element (no flicker)', () => {
    const first = renderSwitcher(null, baseModel());
    const secondModel = baseModel({ activeViewpoint: QUEENS_ROAD });
    const second = renderSwitcher(first, secondModel);
    expect(second).toBe(first); // same node, updated in place
    const header = second.querySelector<HTMLElement>('.switcher-header')!;
    expect(header.textContent).toContain('Suffragette');
  });
});
```

- [ ] **Step 2: Run test — expect failure**

Run: `npx vitest run tests/switcher.test.ts`
Expected: FAIL — `src/switcher.ts` does not exist.

- [ ] **Step 3: Create `src/switcher.ts`**

Create the file:
```ts
import { VIEWPOINTS, type Viewpoint } from './viewpoints';

export interface SwitcherModel {
  activeViewpoint: Viewpoint;
  favouriteViewpointId: string;
  onSwitch: (id: string) => void;
  onSetFavourite: (id: string) => void;
}

// Module-level state for the open/closed toggle, keyed by element. Using a
// WeakMap keeps memory tidy if multiple switchers are ever mounted, and avoids
// the DOM being the source of truth for open state (the class IS, but the
// listener wiring has to know too).
const openState = new WeakMap<HTMLElement, boolean>();

export function renderSwitcher(
  existing: HTMLElement | null,
  model: SwitcherModel,
): HTMLElement {
  const el = existing ?? buildSkeleton();
  updateDynamic(el, model);
  return el;
}

function buildSkeleton(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'switcher';
  // Use grid-rows animation for the sheet height (0fr → 1fr) so no layout jank.
  root.innerHTML = `
    <button type="button" class="switcher-header" aria-expanded="false" aria-controls="switcher-sheet">
      <span class="switcher-header-label"></span>
      <span class="switcher-header-chevron" aria-hidden="true">▾</span>
    </button>
    <div id="switcher-sheet" class="switcher-sheet" role="listbox" aria-label="Choose a viewpoint">
      <div class="switcher-sheet-inner"></div>
    </div>
  `;

  const header = root.querySelector<HTMLButtonElement>('.switcher-header')!;
  header.addEventListener('click', () => toggleOpen(root));

  root.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape' && openState.get(root)) {
      closeSheet(root);
      header.focus();
    }
  });

  // Clicking outside the switcher closes the sheet. Use capture phase so our
  // handler runs before any other stopped-propagation handlers.
  document.addEventListener(
    'click',
    (e) => {
      if (!openState.get(root)) return;
      if (!root.contains(e.target as Node)) closeSheet(root);
    },
    true,
  );

  openState.set(root, false);
  return root;
}

function toggleOpen(root: HTMLElement): void {
  if (openState.get(root)) closeSheet(root);
  else openSheet(root);
}

function openSheet(root: HTMLElement): void {
  openState.set(root, true);
  root.querySelector('.switcher-header')!.setAttribute('aria-expanded', 'true');
  root.querySelector('.switcher-sheet')!.classList.add('open');
}

function closeSheet(root: HTMLElement): void {
  openState.set(root, false);
  root.querySelector('.switcher-header')!.setAttribute('aria-expanded', 'false');
  root.querySelector('.switcher-sheet')!.classList.remove('open');
}

function updateDynamic(root: HTMLElement, model: SwitcherModel): void {
  const { activeViewpoint, favouriteViewpointId, onSwitch, onSetFavourite } = model;

  // Header label: "Weaver · East Ave bridge"
  const label = root.querySelector<HTMLElement>('.switcher-header-label')!;
  label.textContent = `${activeViewpoint.lineName} · ${activeViewpoint.name}`;

  // Rebuild the sheet inner content each render — cheap and keeps favourite/
  // active highlights in sync.
  const inner = root.querySelector<HTMLElement>('.switcher-sheet-inner')!;
  inner.innerHTML = '';
  for (const vp of VIEWPOINTS) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'switcher-row';
    row.setAttribute('role', 'option');
    row.setAttribute('data-id', vp.id);
    row.setAttribute('aria-selected', vp.id === activeViewpoint.id ? 'true' : 'false');

    const rowInner = document.createElement('span');
    rowInner.className = 'switcher-row-content';
    rowInner.innerHTML = `
      <span class="switcher-row-dot${vp.id === activeViewpoint.id ? ' active' : ''}"></span>
      <span class="switcher-row-text">
        <span class="switcher-row-name">${escapeHtml(vp.name)}</span>
        <span class="switcher-row-line" style="color: ${vp.lineColor};">${escapeHtml(vp.lineName)} line</span>
      </span>
    `;
    row.appendChild(rowInner);

    // Row click → switch viewpoint. Don't bubble to the document click handler.
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      // Don't fire switch when the click was actually on the star button.
      if ((e.target as HTMLElement).closest('.switcher-star')) return;
      onSwitch(vp.id);
    });

    // Star button (separate hit target).
    const star = document.createElement('button');
    star.type = 'button';
    star.className = `switcher-star${vp.id === favouriteViewpointId ? ' filled' : ''}`;
    star.setAttribute('aria-label', `Favourite: ${vp.name}`);
    star.setAttribute('aria-pressed', vp.id === favouriteViewpointId ? 'true' : 'false');
    star.innerHTML = vp.id === favouriteViewpointId
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1 L10 6 L15 6 L11 9 L12 14 L8 11 L4 14 L5 9 L1 6 L6 6 Z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1 L10 6 L15 6 L11 9 L12 14 L8 11 L4 14 L5 9 L1 6 L6 6 Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    star.addEventListener('click', (e) => {
      e.stopPropagation();
      onSetFavourite(vp.id);
    });
    row.appendChild(star);

    inner.appendChild(row);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
```

- [ ] **Step 4: Run the switcher tests — expect pass**

Run: `npx vitest run tests/switcher.test.ts`
Expected: PASS — all 10 switcher tests green.

- [ ] **Step 5: Wire the switcher into `src/render.ts`**

In `src/render.ts`, replace the existing static header preservation logic. Add an import:
```ts
import { renderSwitcher } from './switcher';
```

In the `render()` function, replace the existing header preservation block:
```ts
// OLD:
const existingHeader = root.querySelector<HTMLElement>('.page-header');
// ...
if (existingHeader) preserved.add(existingHeader);
// ... later ...
if (existingHeader) root.appendChild(existingHeader);

// NEW:
const existingSwitcher = root.querySelector<HTMLElement>('.switcher');
// ...
if (existingSwitcher) preserved.add(existingSwitcher);
// ... later ...
const switcher = renderSwitcher(existingSwitcher, {
  activeViewpoint: vm.viewpoint,
  favouriteViewpointId: vm.favouriteViewpointId,
  onSwitch: options.onSwitchViewpoint,
  onSetFavourite: options.onSetFavouriteViewpoint,
});
root.appendChild(switcher);
```

- [ ] **Step 6: Remove the static header from `index.html`**

In `index.html`, replace:
```html
<main id="app">
  <header class="page-header">Weaver Line</header>
</main>
```

With:
```html
<main id="app">
</main>
```

The switcher is rendered by `render.ts` into `#app` on every tick.

- [ ] **Step 7: Run full test suite + build**

Run: `npm test && npm run build`
Expected: all tests pass (now ~155 — the 10 new switcher tests + a handful of render test updates if any). tsc clean.

- [ ] **Step 8: Commit**

```bash
git add src/switcher.ts tests/switcher.test.ts src/render.ts index.html
git commit -m "feat: tappable switcher header with inline expand-down sheet

New src/switcher.ts renders a header + sheet component. Header shows the
active line name + viewpoint name, tinted with the line colour; tapping it
expands a sheet listing all viewpoints with per-row star buttons. Clicking
a row switches viewpoints; clicking a star sets that viewpoint as the
favourite (without switching). Escape closes the sheet; clicks outside
also close it.

Replaces the static <header class=\"page-header\">Weaver Line</header>
in index.html. render.ts now delegates header rendering to the switcher.
Accessibility: aria-expanded on the header, aria-selected on rows, role=
listbox/option, star buttons have aria-pressed + aria-label.

No CSS yet — Task 7 styles the switcher + sheet."
```

---

## Task 7: CSS for switcher, sheet, stars, and line colour

**Files:**
- Modify: `src/styles.css`

**Context:** Pure styling pass. Adds the `--line-color` custom property, switcher header styles (press feedback, chevron rotation on open, focus outline), sheet animation (grid-rows 0fr → 1fr), star button states, row highlight for active viewpoint.

- [ ] **Step 1: Add line-colour custom property + switcher styles**

Near the top of `src/styles.css`, in the existing `:root` block, add:
```css
:root {
  /* ... existing custom properties ... */
  --line-color: oklch(35% 0.12 10); /* Weaver burgundy — default; main.ts overrides per viewpoint */
}
```

At the bottom of `src/styles.css`, add:
```css
/* ───── Viewpoint switcher ─────
   Tappable line-name header; taps toggle an inline sheet listing viewpoints
   with per-row star buttons. Uses grid-template-rows 0fr → 1fr for the sheet
   animation so there's no height-measurement jank. */

.switcher {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  max-width: 100%;
}

.switcher-header {
  /* Reset <button> defaults */
  appearance: none;
  border: none;
  background: transparent;
  padding: 0.6rem 1rem;
  margin: 0;
  font: inherit;
  cursor: pointer;

  /* Typography matches the old .page-header */
  font-family: 'Big Shoulders Display', sans-serif;
  font-weight: 900;
  font-size: 1.4rem;
  letter-spacing: 0.02em;
  text-align: center;
  color: var(--line-color);

  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.4em;

  transition: transform 180ms cubic-bezier(0.25, 1, 0.5, 1),
              opacity 180ms ease;
}

.switcher-header:hover { opacity: 0.9; }
.switcher-header:active {
  transform: scale(0.97);
  transition-duration: 60ms;
}
.switcher-header:focus-visible {
  outline: 2px solid var(--line-color);
  outline-offset: 3px;
  border-radius: 6px;
}

.switcher-header-chevron {
  font-size: 0.75em;
  transition: transform 220ms cubic-bezier(0.25, 1, 0.5, 1);
  display: inline-block;
}
.switcher-header[aria-expanded="true"] .switcher-header-chevron {
  transform: rotate(180deg);
}

/* Sheet — grid-rows 0fr → 1fr animation. The inner wrapper has
   overflow: hidden and min-height: 0 so grid content collapses cleanly. */
.switcher-sheet {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 220ms cubic-bezier(0.25, 1, 0.5, 1);
  width: 100%;
}
.switcher-sheet.open { grid-template-rows: 1fr; }
.switcher-sheet-inner {
  overflow: hidden;
  min-height: 0;
}

.switcher-row {
  appearance: none;
  background: transparent;
  border: none;
  width: 100%;
  padding: 0.6rem 1rem;
  margin: 0;
  font: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.75em;
  text-align: left;
  transition: background-color 140ms ease;
}
.switcher-row:hover { background-color: oklch(from var(--bg) calc(l - 0.03) c h); }
.switcher-row:active { background-color: oklch(from var(--bg) calc(l - 0.06) c h); }
.switcher-row:focus-visible {
  outline: 2px solid var(--line-color);
  outline-offset: -2px;
}

.switcher-row-content {
  display: flex;
  align-items: center;
  gap: 0.6em;
  flex: 1;
  min-width: 0;
}

.switcher-row-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid var(--ink);
  flex-shrink: 0;
}
.switcher-row-dot.active { background-color: var(--ink); }

.switcher-row-text {
  display: flex;
  flex-direction: column;
  gap: 0.1em;
  min-width: 0;
}
.switcher-row-name {
  font-family: 'Big Shoulders Display', sans-serif;
  font-weight: 900;
  font-size: 1.1rem;
  color: var(--ink);
  line-height: 1.1;
}
.switcher-row-line {
  font-family: 'Big Shoulders Text', sans-serif;
  font-weight: 600;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  opacity: 0.85;
  /* Line colour is applied inline via the style attribute in switcher.ts */
}

/* Star button (separate hit target inside each row) */
.switcher-star {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0.35rem;
  margin: 0;
  cursor: pointer;
  color: var(--overground);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 160ms cubic-bezier(0.25, 1.4, 0.3, 1),
              color 160ms ease;
  flex-shrink: 0;
  border-radius: 50%;
}
.switcher-star svg { width: 20px; height: 20px; display: block; }
.switcher-star.filled { color: var(--overground); }
.switcher-star:not(.filled) { color: oklch(from var(--ink) l c h / 0.5); }
.switcher-star:hover:not(.filled) { color: oklch(from var(--ink) l c h / 0.75); }
.switcher-star:active { transform: scale(0.88); transition-duration: 60ms; }
.switcher-star:focus-visible {
  outline: 2px solid var(--overground);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .switcher-header,
  .switcher-header-chevron,
  .switcher-sheet,
  .switcher-row,
  .switcher-star {
    transition: none;
  }
}
```

- [ ] **Step 2: Update train-livery CSS to use `--line-color`**

In `src/styles.css`, find the existing `.strip-train-svg` rules. Change the livery/body colour from the hard-coded `var(--overground)` (or explicit orange) to `currentColor`:

```css
/* Train body + livery now inherit colour from .strip-train via currentColor. */
.strip-train {
  /* ... existing positioning styles ... */
  color: var(--line-color);
}
.strip-train-svg .train-body {
  fill: var(--bg);      /* was: a cream/white tint — keep cream */
}
.strip-train-svg .train-livery {
  fill: currentColor;   /* was: var(--overground) — now per-line */
}
```

Verify by searching the current CSS for `.train-body` and `.train-livery` selectors; change their fill rules to match.

The other train parts (`.train-window` = navy, `.train-cab` = dark, `.train-bogie` = dark) stay as-is.

- [ ] **Step 3: Run tests + build**

Run: `npm test && npm run build`
Expected: all tests pass; tsc clean; build outputs.

- [ ] **Step 4: Manual sanity check (dev server)**

Run: `npm run dev`
Open: `http://localhost:5173`

Verify:
- Header reads "Weaver · East Ave bridge ▾" in burgundy (not orange)
- Trains on both strips have burgundy livery
- Tapping the header expands the sheet; chevron rotates 180°
- Sheet shows East Ave (filled star) and Queens Road (outline star)
- Escape closes the sheet
- Tapping Queens Road row switches viewpoints: header becomes green "Suffragette · Queens Road ▾", Suffragette stops render on the strip, trains have green livery, countdowns show "→ Barking Riverside" / "← Gospel Oak"
- Refresh the page → back to East Ave (favourite preserved, session switch discarded)
- Tap the star on the Queens Road row (without tapping the row): star fills green-to-orange
- Refresh → now Queens Road is the default

- [ ] **Step 5: Commit**

```bash
git add src/styles.css
git commit -m "style: switcher + sheet CSS + line-color-driven train livery

Adds --line-color custom property (burgundy default). .switcher-header
uses it for text colour; .strip-train uses it as currentColor feeding the
SVG .train-livery fill, so switching viewpoints re-liveries the cartoon
trains.

Sheet expansion uses grid-template-rows 0fr → 1fr (no height-measurement
jank). Chevron rotates 180deg on open. Star buttons: filled state uses
var(--overground) so favourites stand out; outline state is muted ink.
Rows show a filled dot for the active viewpoint.

Respects prefers-reduced-motion — all transitions suppressed."
```

---

## Task 8: Update About + Privacy copy

**Files:**
- Modify: `public/about.html`
- Modify: `public/privacy.html`

**Context:** Tiny copy additions so the docs match the new feature. No code.

- [ ] **Step 1: Update `public/about.html`**

Open `public/about.html` and find the main "About" paragraph (around line 20). Add this sentence at the end of the paragraph:

> You can now watch trains from a couple of different spots around E17 — tap the line name at the top to switch between them.

The change to make:
```html
<!-- Original ends: -->
without fishing through TfL's generic departure boards.
</p>

<!-- Change to: -->
without fishing through TfL's generic departure boards. You can now watch trains from a couple of different spots around E17 — tap the line name at the top to switch between them.
</p>
```

- [ ] **Step 2: Update `public/privacy.html`**

Add a new bullet to the "What's stored on your device" list, after the existing `wtt_walking_enabled` bullet:

```html
<li>
  A <code>wtt_favourite_viewpoint</code> flag remembering which viewpoint
  you've starred as your default.
</li>
```

Also bump the "Last updated" date at the bottom of the page from `22 April 2026` to today's date (check via `date "+%d %B %Y"` in your shell).

- [ ] **Step 3: Build + commit**

Run: `npm run build`
Expected: build passes; dist/ has updated about.html and privacy.html.

```bash
git add public/about.html public/privacy.html
git commit -m "docs: mention the viewpoint switcher in about + privacy

About: one-sentence pointer to the new tap-to-switch header.
Privacy: add wtt_favourite_viewpoint to the list of localStorage flags.
Bumps privacy 'Last updated' date."
```

---

## Task 9: Final verification + deploy check

**Files:** none modified — this is an end-to-end check before handing off.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass. Running count: 124 (pre-plan) + ~10 viewpoint + ~10 switcher + updated existing = ~155 tests.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected:
- `tsc --noEmit` passes (no type errors)
- Vite build succeeds
- Bundle sizes: JS ≤ 30 KB raw / ≤ 11 KB gz; CSS ≤ 12 KB raw / ≤ 3.5 KB gz. Spec budgeted +2.9 KB gz; if actuals exceed +4 KB gz, investigate before shipping.

Capture the output numbers for the commit message in Step 6.

- [ ] **Step 3: Manual QA in the dev server**

Run: `npm run dev`
Open: `http://localhost:5173`

Run through this smoke-test checklist — all must work:

1. Page loads → switcher header shows "Weaver · East Ave bridge ▾" in burgundy
2. Strips show Chingford-branch stops (Liv, Bth, Hck, Clp, StJ, WC, WDS, Hig, Chg)
3. Cartoon train livery is burgundy (not orange)
4. Countdown labels read "→ Chingford" and "← Walthamstow Central"
5. Walking time (if enabled) shows distance to East Ave bridge coords
6. Tap the header → sheet expands, chevron rotates, shows 2 viewpoints
7. East Ave row: filled star, filled dot; Queens Road row: outline star, outline dot
8. Tap the Queens Road row (not the star) → sheet closes, header becomes "Suffragette · Queens Road ▾" in green, strip rebuilds with 13 Suffragette stops, trains have green livery, countdowns read "→ Barking Riverside" and "← Gospel Oak", walking time recomputes to Queens Road coords
9. Refresh the page → back to East Ave (favourite preserved)
10. Tap header, tap Queens Road star (not the row) → star fills; sheet stays open; no viewpoint switch
11. Refresh → loads on Queens Road (favourite updated)
12. Tap the East Ave star → it fills; Queens Road star goes outline
13. Refresh → loads on East Ave
14. Keyboard: Tab to the header, Enter opens sheet, Tab cycles through rows + stars, Escape closes sheet, focus returns to header
15. Set `prefers-reduced-motion: reduce` via devtools; re-open sheet — no animation, instant swap
16. Check console: no errors

If ANY step fails, halt and fix before proceeding.

- [ ] **Step 4: Check the TfL stoppoint for Queens Road**

Run this in a terminal to verify the Queens Road stoppoint id is correct:
```bash
curl -s 'https://api.tfl.gov.uk/StopPoint/910GWLTHQRD/Arrivals' | head -c 200
```

Expected: a JSON array starts (`[{"$type":"Tfl.Api.Presentation.Entities.Prediction..."`).

If instead you get `{"timestampUtc":..."message":"The following options are not valid"}` or similar, the stoppoint id is wrong. Search for the correct one:
```bash
curl -s 'https://api.tfl.gov.uk/StopPoint/Search?query=Walthamstow%20Queens%20Road' | head -c 500
```

Look for a result with `"modes":["overground"]` and copy its `"id"` field (e.g. `"910GXXXXXXX"`). Update the `stopPointId` field on the `'queens-road'` viewpoint in `src/viewpoints.ts`, rerun tests + build, commit.

- [ ] **Step 5: Check the Suffragette lineId**

Similar check — fetch arrivals at Queens Road and inspect the `"lineId"` values:
```bash
curl -s 'https://api.tfl.gov.uk/StopPoint/910GWLTHQRD/Arrivals' | grep -oE '"lineId":"[^"]+"' | sort -u
```

Expected: `"lineId":"suffragette"` should appear. If it's different (e.g. `"gospel-oak-barking-riverside"` fallback), update the `lineId` field on the `'queens-road'` viewpoint accordingly.

- [ ] **Step 6: Commit any fixes from Steps 4–5**

If either verification step required a change:
```bash
git add src/viewpoints.ts
git commit -m "fix: verified TfL stoppoint + lineId for Queens Road

Corrected against a live /StopPoint/Arrivals response."
```

If no changes were needed, skip this step.

- [ ] **Step 7: Push to main**

```bash
git push origin main
```

Netlify auto-deploys in ~90 seconds. Visit `https://eastavetrains.co.uk/` and hard-refresh to bypass the service worker cache. Repeat the manual QA checklist (Step 3) against production.

- [ ] **Step 8: Verify the live deploy**

Run:
```bash
curl -sI https://eastavetrains.co.uk/ | head -5
curl -s https://eastavetrains.co.uk/ | grep -oE 'assets/index-[^"]*\.js' | head -1
```

Expected: 200 OK, a fresh JS bundle filename (different from the pre-deploy one). Visit the site in-browser; confirm the switcher renders, trains are burgundy, switching to Queens Road works with live Suffragette data.

---

## Intentional deviations from the spec

Documented here so reviewers don't flag them as regressions:

- **Queens Road direction assignment flipped.** Spec assigned `directions.north = Gospel Oak` (inbound) for Queens Road; plan uses `directions.north = Barking Riverside` (outbound) so the "north = left-to-right on strip" convention holds uniformly across all viewpoints.
- **No focus trap inside the sheet.** Spec called for focus trap + return on close; plan ships without a trap because the sheet is inline (not a modal overlay) — Tab naturally flows to the direction rows beneath, which is fine. Escape + click-outside still close as expected. If QA reveals a problem, add a trap in a follow-up.
- **No standalone `tests/favourite.test.ts`.** Spec listed it as a new test file; plan tests favourite behaviour indirectly via `switcher.test.ts` (mocks for `onSetFavourite` / `onSwitchViewpoint`) and the final manual QA checklist. Matches the codebase convention for `wtt_walking_enabled` / `wtt_fact_index` which don't have dedicated test files either.

---

## Post-plan: things to watch for (not implementation)

- **Suffragette strip density**: 13 stops on a 375px phone = ~26px per stop. Abbreviations may look cramped. If it's ugly in real use, follow up with one of the fallback options from the spec (hide abbreviations on >10-stop lines, 2-letter abbreviations, or only show 7 stops around the anchor).
- **TfL API data quality**: the `direction` field on Suffragette arrivals may not always match Weaver's conventions. If live data ever classifies obviously wrong, inspect a fresh arrivals payload and adjust the `tflDirection` mapping on the queens-road viewpoint.
- **Walking-time UX when far from either viewpoint**: if a user enables walking time from south-west London, both distances are huge. Not a bug — just a UX note.
- **Service worker cache**: the first deploy after shipping this may briefly show the old UI to users who had the previous service worker cached. Expected; resolves on next page open.
