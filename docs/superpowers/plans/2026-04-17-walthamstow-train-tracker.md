# Walthamstow Train Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a phone-installable PWA that shows a two-direction live countdown to the next Weaver-line train crossing the East Avenue bridge in Walthamstow, hosted on Netlify.

**Architecture:** Static Vite+TypeScript SPA that polls the public TfL Unified API directly from the browser every 20 seconds while visible. Pure-function core (direction classifier, bridge-time calculator, display formatter) separated from side-effecting layers (HTTP, timers, DOM). `vite-plugin-pwa` bolts on the manifest, service worker, and install prompt. Netlify auto-deploys from GitHub on every push to `main`.

**Tech Stack:**
- Vite 5 + TypeScript 5 (strict)
- Vitest for unit tests
- `vite-plugin-pwa` for PWA manifest + service worker
- `@vite-pwa/assets-generator` for icon generation from SVG
- Node 20 (pinned via `.nvmrc`)
- npm for package management
- Netlify for hosting, GitHub for source

**Spec:** [docs/superpowers/specs/2026-04-17-walthamstow-train-tracker-design.md](../specs/2026-04-17-walthamstow-train-tracker-design.md)

---

## File structure

```
├── .gitignore
├── .nvmrc                          # "20"
├── netlify.toml                    # build config
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts                  # Vite + PWA plugin config
├── vitest.config.ts                # test config
├── index.html
├── public/
│   ├── icon.svg                    # source icon (generated PNGs live alongside)
│   ├── pwa-192x192.png             # generated
│   ├── pwa-512x512.png             # generated
│   └── apple-touch-icon.png        # generated 180x180
├── src/
│   ├── main.ts                     # entry: wires modules, starts poller, triggers render
│   ├── tfl.ts                      # TfL API types + fetch
│   ├── direction.ts                # Arrival → 'north' | 'south'
│   ├── bridge.ts                   # bridge-time calc + next-event picker
│   ├── freshness.ts                # (lastFetch, now) → freshness state
│   ├── display.ts                  # seconds → display string, age → "updated Xs ago"
│   ├── poller.ts                   # visibility-aware 20s loop
│   ├── render.ts                   # DOM mutation
│   └── styles.css                  # dark, big, mobile-first
└── tests/
    ├── direction.test.ts
    ├── bridge.test.ts
    ├── freshness.test.ts
    ├── display.test.ts
    ├── poller.test.ts
    └── tfl.test.ts
```

Each file has one clear responsibility. Pure modules (`direction`, `bridge`, `freshness`, `display`) are fully unit-tested. Side-effecting modules (`tfl`, `poller`) are tested with mocked globals. Presentation layer (`render`, `main`) is verified manually in the browser.

---

## Task 1: Project scaffolding and git init

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.gitignore`, `.nvmrc`, `index.html`, `src/main.ts`, `src/styles.css`

- [ ] **Step 1: Initialise git**

Run from the project root:

```bash
git init -b main
```

Expected: `Initialized empty Git repository in ...`

- [ ] **Step 2: Create `.gitignore`**

Write `.gitignore`:

```
node_modules
dist
dist-ssr
.DS_Store
*.log
.env
.env.local
.env.*.local
.vite
coverage
```

- [ ] **Step 3: Create `.nvmrc`**

Write `.nvmrc`:

```
20
```

- [ ] **Step 4: Initialise npm project**

Run:

```bash
npm init -y
```

Expected: `package.json` created.

- [ ] **Step 5: Install dependencies**

Run:

```bash
npm install --save-dev vite typescript @types/node vitest jsdom vite-plugin-pwa @vite-pwa/assets-generator
```

Expected: installs complete, no errors. `package-lock.json` created.

- [ ] **Step 6: Write `package.json` scripts**

Replace the `scripts` block in `package.json` with:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "generate-icons": "pwa-assets-generator --preset minimal-2023 public/icon.svg"
  }
}
```

Also add `"type": "module"` at the top level of `package.json` if not already present.

- [ ] **Step 7: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["vitest/globals"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 8: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Walthamstow Trains',
        short_name: 'Trains',
        description: 'Live Weaver-line arrivals over the East Avenue bridge',
        theme_color: '#0a0a0f',
        background_color: '#0a0a0f',
        display: 'fullscreen',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // cache app shell only, never API responses
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://api.tfl.gov.uk',
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ]
});
```

- [ ] **Step 9: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts']
  }
});
```

- [ ] **Step 10: Write `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0a0a0f" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <title>Walthamstow Trains</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <main id="app" aria-live="polite"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 11: Write placeholder `src/main.ts`**

```ts
const app = document.getElementById('app')!;
app.textContent = 'Walthamstow Trains — initialising…';
```

- [ ] **Step 12: Write placeholder `src/styles.css`**

```css
:root { color-scheme: dark; }
html, body { margin: 0; padding: 0; background: #0a0a0f; color: #fff; font-family: system-ui, sans-serif; }
#app { padding: 2rem; font-size: 1.5rem; }
```

- [ ] **Step 13: Verify dev server boots**

Run:

```bash
npm run dev
```

Expected: server starts on `http://localhost:5173`, visiting it shows "Walthamstow Trains — initialising…". Stop the server with Ctrl+C.

- [ ] **Step 14: Verify build succeeds**

Run:

```bash
npm run build
```

Expected: exits 0, `dist/` directory created with `index.html` and hashed JS/CSS.

- [ ] **Step 15: Commit**

```bash
git add .
git commit -m "chore: scaffold Vite + TypeScript + PWA project"
```

---

## Task 2: Discover the Weaver-line StopPoint ID

The TfL API uses StopPoint IDs that vary by mode. `940GZZLUWHC` is Underground-only and will NOT return Weaver-line arrivals. The correct ID for Walthamstow Central on the Weaver line must be discovered empirically.

**Files:**
- Create: `src/constants.ts`

- [ ] **Step 1: Search StopPoints for Walthamstow Central**

Run:

```bash
curl -s "https://api.tfl.gov.uk/StopPoint/Search?query=Walthamstow%20Central&modes=overground" | head -200
```

Expected: JSON with a `matches` array. Each match has an `id` field. The Walthamstow Central hub used by the Overground/Weaver line typically has an ID like `910GWLTHQRD` (Walthamstow Queens Road — wrong station), `910GWLHMSTQ`, or a hub ID like `HUBWHC`. Note the `id` value for the match whose `name` is exactly "Walthamstow Central".

- [ ] **Step 2: Validate the candidate ID returns Weaver-line arrivals**

Replace `<ID>` with the candidate from step 1:

```bash
curl -s "https://api.tfl.gov.uk/StopPoint/<ID>/Arrivals" | python3 -m json.tool | head -100
```

Expected: a JSON array of arrivals. To confirm this is the correct ID, check that at least one entry has:
- `"modeName": "overground"` (or `"elizabeth-line"` — but Weaver-line services are tagged `overground`)
- `"lineId": "weaver"` OR `"lineName": "Weaver"`
- `"destinationName"` values that include `"Chingford"` or a southbound terminus

If the response is empty, try the next candidate ID from step 1. If no candidate returns Weaver-line data, try the hub endpoint:

```bash
curl -s "https://api.tfl.gov.uk/StopPoint/HUBWHC/Arrivals" | python3 -m json.tool | head -100
```

Also try querying without mode filter to see all IDs:

```bash
curl -s "https://api.tfl.gov.uk/StopPoint/Search?query=Walthamstow%20Central" | python3 -m json.tool
```

Pick the single ID whose `/Arrivals` endpoint returns Weaver-line services including Chingford-bound trains.

- [ ] **Step 3: Record a sample arrival response for tests**

From the working ID, capture the first 2-3 arrivals into a fixture file:

```bash
mkdir -p tests/fixtures
curl -s "https://api.tfl.gov.uk/StopPoint/<CONFIRMED_ID>/Arrivals" > tests/fixtures/arrivals-sample.json
```

This fixture will be used by later tests. Keep it small — if the API returns 20 arrivals, trim to a handful by hand-editing, keeping at least one Chingford-bound and one southbound entry.

- [ ] **Step 4: Create `src/constants.ts`**

Replace `<CONFIRMED_ID>` with the ID validated in step 2:

```ts
export const WALTHAMSTOW_CENTRAL_STOPPOINT_ID = '<CONFIRMED_ID>';

export const TFL_ARRIVALS_URL = (stopPointId: string) =>
  `https://api.tfl.gov.uk/StopPoint/${stopPointId}/Arrivals`;

// Bridge-time offsets derived from field observation on East Avenue.
// Northbound: trains stop at Walthamstow Central, then cross the bridge 90s after arriving.
// Southbound: trains cross the bridge 20s before arriving at Walthamstow Central.
export const NORTHBOUND_OFFSET_SECONDS = 90;
export const SOUTHBOUND_OFFSET_SECONDS = -20;

export const POLL_INTERVAL_MS = 20_000;
export const STALE_THRESHOLD_MS = 60_000;
export const NO_TRAINS_WINDOW_SECONDS = 30 * 60; // 30 minutes
```

- [ ] **Step 5: Commit**

```bash
git add src/constants.ts tests/fixtures/arrivals-sample.json
git commit -m "feat: add TfL constants with verified Walthamstow Central stop ID"
```

---

## Task 3: TfL API client and types

**Files:**
- Create: `src/tfl.ts`, `tests/tfl.test.ts`

- [ ] **Step 1: Write failing test for `fetchArrivals`**

Write `tests/tfl.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchArrivals } from '../src/tfl';

describe('fetchArrivals', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns parsed arrivals on 200', async () => {
    const payload = [
      {
        id: '1',
        stationName: 'Walthamstow Central',
        lineId: 'weaver',
        destinationName: 'Chingford',
        timeToStation: 120,
        expectedArrival: '2026-04-17T10:00:00Z',
        modeName: 'overground',
        platformName: 'Platform 1'
      }
    ];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload
    });

    const result = await fetchArrivals('STOPID');

    expect(result).toHaveLength(1);
    expect(result[0].destinationName).toBe('Chingford');
    expect(result[0].timeToStation).toBe(120);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.tfl.gov.uk/StopPoint/STOPID/Arrivals'
    );
  });

  it('throws when response is not ok', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503
    });

    await expect(fetchArrivals('STOPID')).rejects.toThrow(/503/);
  });

  it('filters out arrivals without a lineId of weaver', async () => {
    const payload = [
      { id: '1', lineId: 'weaver', destinationName: 'Chingford', timeToStation: 60, expectedArrival: 'x', modeName: 'overground', platformName: 'P1', stationName: 'WC' },
      { id: '2', lineId: 'victoria', destinationName: 'Brixton', timeToStation: 30, expectedArrival: 'y', modeName: 'tube', platformName: 'P2', stationName: 'WC' }
    ];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload
    });

    const result = await fetchArrivals('STOPID');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npm test
```

Expected: fails with "Cannot find module '../src/tfl'".

- [ ] **Step 3: Implement `src/tfl.ts`**

```ts
import { TFL_ARRIVALS_URL } from './constants';

export interface Arrival {
  id: string;
  stationName: string;
  lineId: string;
  destinationName: string;
  timeToStation: number; // seconds until arrival at the station
  expectedArrival: string; // ISO 8601
  modeName: string;
  platformName: string;
}

export async function fetchArrivals(stopPointId: string): Promise<Arrival[]> {
  const response = await fetch(TFL_ARRIVALS_URL(stopPointId));
  if (!response.ok) {
    throw new Error(`TfL API error: ${response.status}`);
  }
  const data = (await response.json()) as Arrival[];
  return data.filter((a) => a.lineId === 'weaver');
}
```

- [ ] **Step 4: Run test, confirm pass**

```bash
npm test
```

Expected: all 3 tests in `tfl.test.ts` pass.

- [ ] **Step 5: Commit**

```bash
git add src/tfl.ts tests/tfl.test.ts
git commit -m "feat: add TfL arrivals client with weaver-line filter"
```

---

## Task 4: Direction classifier

**Files:**
- Create: `src/direction.ts`, `tests/direction.test.ts`

- [ ] **Step 1: Write failing test**

Write `tests/direction.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyDirection } from '../src/direction';
import type { Arrival } from '../src/tfl';

function arrival(destinationName: string): Arrival {
  return {
    id: '1',
    stationName: 'Walthamstow Central',
    lineId: 'weaver',
    destinationName,
    timeToStation: 0,
    expectedArrival: '2026-04-17T10:00:00Z',
    modeName: 'overground',
    platformName: 'Platform 1'
  };
}

describe('classifyDirection', () => {
  it('classifies Chingford as north', () => {
    expect(classifyDirection(arrival('Chingford'))).toBe('north');
  });

  it('classifies Chingford Rail Station as north (case-insensitive substring)', () => {
    expect(classifyDirection(arrival('Chingford Rail Station'))).toBe('north');
  });

  it('classifies Liverpool Street as south', () => {
    expect(classifyDirection(arrival('Liverpool Street'))).toBe('south');
  });

  it('classifies Clapton as south', () => {
    expect(classifyDirection(arrival('Clapton'))).toBe('south');
  });

  it('classifies empty destination as south (safe default — show it and let the user see)', () => {
    expect(classifyDirection(arrival(''))).toBe('south');
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npm test
```

Expected: fails with "Cannot find module '../src/direction'".

- [ ] **Step 3: Implement `src/direction.ts`**

```ts
import type { Arrival } from './tfl';

export type Direction = 'north' | 'south';

export function classifyDirection(arrival: Arrival): Direction {
  return arrival.destinationName.toLowerCase().includes('chingford') ? 'north' : 'south';
}
```

- [ ] **Step 4: Run test, confirm pass**

```bash
npm test
```

Expected: all tests pass including the 5 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/direction.ts tests/direction.test.ts
git commit -m "feat: add direction classifier based on destination name"
```

---

## Task 5: Bridge-time calculation and next-event picker

**Files:**
- Create: `src/bridge.ts`, `tests/bridge.test.ts`

- [ ] **Step 1: Write failing tests**

Write `tests/bridge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeBridgeTime, pickNextPerDirection } from '../src/bridge';
import type { Arrival } from '../src/tfl';

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
  it('adds 90s for northbound (train leaves WC then reaches bridge)', () => {
    expect(computeBridgeTime(arrival('Chingford', 120))).toBe(210);
  });

  it('subtracts 20s for southbound (train crosses bridge before arriving at WC)', () => {
    expect(computeBridgeTime(arrival('Liverpool Street', 120))).toBe(100);
  });

  it('handles a northbound train already at platform (timeToStation = 0)', () => {
    expect(computeBridgeTime(arrival('Chingford', 0))).toBe(90);
  });

  it('handles a southbound train already at platform (returns -20, i.e. just crossed)', () => {
    expect(computeBridgeTime(arrival('Liverpool Street', 0))).toBe(-20);
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

    const result = pickNextPerDirection(arrivals);

    expect(result.north?.arrival.id).toBe('n2');
    expect(result.north?.bridgeTimeSeconds).toBe(150); // 60 + 90
    expect(result.south?.arrival.id).toBe('s2');
    expect(result.south?.bridgeTimeSeconds).toBe(180); // 200 - 20
  });

  it('excludes arrivals whose bridge time is too far in the past (< -30s)', () => {
    const arrivals = [
      arrival('Liverpool Street', -100, 's-gone'), // bridge time -120, excluded
      arrival('Liverpool Street', 200, 's-next')   // bridge time 180, kept
    ];

    const result = pickNextPerDirection(arrivals);

    expect(result.south?.arrival.id).toBe('s-next');
  });

  it('keeps a southbound train that just crossed (bridge time between -30 and 0)', () => {
    const arrivals = [
      arrival('Liverpool Street', 10, 's-just-crossed') // bridge time -10
    ];

    const result = pickNextPerDirection(arrivals);

    expect(result.south?.arrival.id).toBe('s-just-crossed');
    expect(result.south?.bridgeTimeSeconds).toBe(-10);
  });

  it('returns undefined for a direction with no valid arrivals', () => {
    const arrivals = [arrival('Chingford', 120, 'n1')];

    const result = pickNextPerDirection(arrivals);

    expect(result.north?.arrival.id).toBe('n1');
    expect(result.south).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npm test
```

Expected: fails with "Cannot find module '../src/bridge'".

- [ ] **Step 3: Implement `src/bridge.ts`**

```ts
import type { Arrival } from './tfl';
import { classifyDirection, type Direction } from './direction';
import { NORTHBOUND_OFFSET_SECONDS, SOUTHBOUND_OFFSET_SECONDS } from './constants';

export interface BridgeEvent {
  arrival: Arrival;
  direction: Direction;
  bridgeTimeSeconds: number;
}

export function computeBridgeTime(arrival: Arrival): number {
  const direction = classifyDirection(arrival);
  const offset = direction === 'north' ? NORTHBOUND_OFFSET_SECONDS : SOUTHBOUND_OFFSET_SECONDS;
  return arrival.timeToStation + offset;
}

const JUST_CROSSED_WINDOW_SECONDS = -30;

function toEvent(arrival: Arrival): BridgeEvent {
  return {
    arrival,
    direction: classifyDirection(arrival),
    bridgeTimeSeconds: computeBridgeTime(arrival)
  };
}

export function pickNextPerDirection(arrivals: Arrival[]): { north?: BridgeEvent; south?: BridgeEvent } {
  const events = arrivals
    .map(toEvent)
    .filter((e) => e.bridgeTimeSeconds >= JUST_CROSSED_WINDOW_SECONDS)
    .sort((a, b) => a.bridgeTimeSeconds - b.bridgeTimeSeconds);

  return {
    north: events.find((e) => e.direction === 'north'),
    south: events.find((e) => e.direction === 'south')
  };
}
```

- [ ] **Step 4: Run test, confirm pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/bridge.ts tests/bridge.test.ts
git commit -m "feat: add bridge-time calculation and per-direction picker"
```

---

## Task 6: Freshness tracker

**Files:**
- Create: `src/freshness.ts`, `tests/freshness.test.ts`

- [ ] **Step 1: Write failing tests**

Write `tests/freshness.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyFreshness } from '../src/freshness';

describe('classifyFreshness', () => {
  it('returns no-data when lastFetch is null', () => {
    expect(classifyFreshness(null, Date.now())).toEqual({ state: 'no-data' });
  });

  it('returns fresh when age is under threshold', () => {
    const now = 1_000_000;
    const lastFetch = now - 30_000; // 30s ago
    expect(classifyFreshness(lastFetch, now)).toEqual({ state: 'fresh', ageMs: 30_000 });
  });

  it('returns stale when age is over threshold', () => {
    const now = 1_000_000;
    const lastFetch = now - 90_000; // 90s ago
    expect(classifyFreshness(lastFetch, now)).toEqual({ state: 'stale', ageMs: 90_000 });
  });

  it('treats exactly-threshold age as fresh (boundary)', () => {
    const now = 1_000_000;
    const lastFetch = now - 60_000;
    expect(classifyFreshness(lastFetch, now)).toEqual({ state: 'fresh', ageMs: 60_000 });
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npm test
```

Expected: fails with "Cannot find module '../src/freshness'".

- [ ] **Step 3: Implement `src/freshness.ts`**

```ts
import { STALE_THRESHOLD_MS } from './constants';

export type FreshnessState =
  | { state: 'no-data' }
  | { state: 'fresh'; ageMs: number }
  | { state: 'stale'; ageMs: number };

export function classifyFreshness(lastFetchMs: number | null, nowMs: number): FreshnessState {
  if (lastFetchMs === null) return { state: 'no-data' };
  const ageMs = nowMs - lastFetchMs;
  if (ageMs <= STALE_THRESHOLD_MS) return { state: 'fresh', ageMs };
  return { state: 'stale', ageMs };
}
```

- [ ] **Step 4: Run test, confirm pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/freshness.ts tests/freshness.test.ts
git commit -m "feat: add freshness classifier"
```

---

## Task 7: Display formatting

**Files:**
- Create: `src/display.ts`, `tests/display.test.ts`

- [ ] **Step 1: Write failing tests**

Write `tests/display.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatCountdown, formatAge, type CountdownLabel } from '../src/display';

describe('formatCountdown', () => {
  it('shows NOW when 10s or less', () => {
    expect(formatCountdown(10)).toEqual<CountdownLabel>({ kind: 'now', text: 'NOW' });
    expect(formatCountdown(0)).toEqual<CountdownLabel>({ kind: 'now', text: 'NOW' });
    expect(formatCountdown(5)).toEqual<CountdownLabel>({ kind: 'now', text: 'NOW' });
  });

  it('shows "just crossed" for 0 down to -30s', () => {
    expect(formatCountdown(-5)).toEqual<CountdownLabel>({ kind: 'just-crossed', text: 'just crossed' });
    expect(formatCountdown(-30)).toEqual<CountdownLabel>({ kind: 'just-crossed', text: 'just crossed' });
  });

  it('shows whole seconds for 11s to 59s', () => {
    expect(formatCountdown(11)).toEqual<CountdownLabel>({ kind: 'seconds', text: '11 sec' });
    expect(formatCountdown(59)).toEqual<CountdownLabel>({ kind: 'seconds', text: '59 sec' });
  });

  it('shows whole minutes for 60s and above, rounded down', () => {
    expect(formatCountdown(60)).toEqual<CountdownLabel>({ kind: 'minutes', text: '1 min' });
    expect(formatCountdown(119)).toEqual<CountdownLabel>({ kind: 'minutes', text: '1 min' });
    expect(formatCountdown(120)).toEqual<CountdownLabel>({ kind: 'minutes', text: '2 min' });
    expect(formatCountdown(600)).toEqual<CountdownLabel>({ kind: 'minutes', text: '10 min' });
  });
});

describe('formatAge', () => {
  it('formats seconds under 60s', () => {
    expect(formatAge(5_000)).toBe('updated 5s ago');
    expect(formatAge(59_000)).toBe('updated 59s ago');
    expect(formatAge(0)).toBe('updated 0s ago');
  });

  it('formats minutes for 60s and above', () => {
    expect(formatAge(60_000)).toBe('updated 1m ago');
    expect(formatAge(180_000)).toBe('updated 3m ago');
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npm test
```

Expected: fails with "Cannot find module '../src/display'".

- [ ] **Step 3: Implement `src/display.ts`**

```ts
export type CountdownLabel =
  | { kind: 'now'; text: string }
  | { kind: 'just-crossed'; text: string }
  | { kind: 'seconds'; text: string }
  | { kind: 'minutes'; text: string };

export function formatCountdown(bridgeTimeSeconds: number): CountdownLabel {
  if (bridgeTimeSeconds < 0) {
    return { kind: 'just-crossed', text: 'just crossed' };
  }
  if (bridgeTimeSeconds <= 10) {
    return { kind: 'now', text: 'NOW' };
  }
  if (bridgeTimeSeconds < 60) {
    return { kind: 'seconds', text: `${Math.floor(bridgeTimeSeconds)} sec` };
  }
  return { kind: 'minutes', text: `${Math.floor(bridgeTimeSeconds / 60)} min` };
}

export function formatAge(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `updated ${seconds}s ago`;
  return `updated ${Math.floor(seconds / 60)}m ago`;
}
```

- [ ] **Step 4: Run test, confirm pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/display.ts tests/display.test.ts
git commit -m "feat: add countdown and age formatters"
```

---

## Task 8: Visibility-aware poller

**Files:**
- Create: `src/poller.ts`, `tests/poller.test.ts`

- [ ] **Step 1: Write failing tests**

Write `tests/poller.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startPoller } from '../src/poller';

describe('startPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fires tick immediately on start', async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    startPoller(tick, 20_000);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('fires tick again after the interval', async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    startPoller(tick, 20_000);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(tick).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it('pauses when document becomes hidden and resumes on visible', async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    startPoller(tick, 20_000);
    expect(tick).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(1); // no further calls while hidden

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(tick).toHaveBeenCalledTimes(2); // immediate tick on resume
  });

  it('stop() cancels further ticks', async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    const stop = startPoller(tick, 20_000);
    expect(tick).toHaveBeenCalledTimes(1);

    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npm test
```

Expected: fails with "Cannot find module '../src/poller'".

- [ ] **Step 3: Implement `src/poller.ts`**

```ts
export type TickFn = () => Promise<void>;

export function startPoller(tick: TickFn, intervalMs: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const runTick = () => {
    tick().catch(() => {
      // swallow — the tick function is responsible for surfacing errors via state
    });
  };

  const start = () => {
    if (timer !== null || stopped) return;
    runTick();
    timer = setInterval(runTick, intervalMs);
  };

  const pause = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };

  const onVisibilityChange = () => {
    if (stopped) return;
    if (document.visibilityState === 'visible') {
      start();
    } else {
      pause();
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);

  if (document.visibilityState === 'visible') {
    start();
  }

  return () => {
    stopped = true;
    pause();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
```

- [ ] **Step 4: Run test, confirm pass**

```bash
npm test
```

Expected: all 4 poller tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/poller.ts tests/poller.test.ts
git commit -m "feat: add visibility-aware polling loop"
```

---

## Task 9: DOM renderer

The renderer is a thin, side-effecting module with no branching logic worth unit-testing — its correctness is best verified by looking at the page. It consumes a typed `ViewModel` and mutates the DOM to match.

**Files:**
- Create: `src/render.ts`

- [ ] **Step 1: Implement `src/render.ts`**

```ts
import type { BridgeEvent } from './bridge';
import type { FreshnessState } from './freshness';
import { formatCountdown, formatAge } from './display';

export interface ViewModel {
  north?: BridgeEvent;
  south?: BridgeEvent;
  freshness: FreshnessState;
  error?: string;
}

export function render(root: HTMLElement, vm: ViewModel): void {
  root.innerHTML = '';

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

  const footer = document.createElement('div');
  footer.className = `footer ${vm.freshness.state}`;
  footer.textContent = vm.freshness.state === 'no-data'
    ? 'connecting…'
    : formatAge(vm.freshness.ageMs);
  root.appendChild(footer);
}

function renderDirection(label: string, event: BridgeEvent | undefined): HTMLElement {
  const row = document.createElement('section');
  row.className = 'row';

  const labelEl = document.createElement('div');
  labelEl.className = 'label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const valueEl = document.createElement('div');
  valueEl.className = 'value';

  if (!event) {
    valueEl.classList.add('sleeping');
    valueEl.textContent = '— no trains for a while 💤';
  } else {
    const countdown = formatCountdown(event.bridgeTimeSeconds);
    valueEl.classList.add(countdown.kind);
    valueEl.textContent = countdown.text;
  }

  row.appendChild(valueEl);
  return row;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/render.ts
git commit -m "feat: add DOM renderer for view model"
```

---

## Task 10: Main wiring

Connects everything: poller → fetch → pick next per direction → build view model → render.

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Rewrite `src/main.ts`**

Replace the placeholder content with:

```ts
import { fetchArrivals } from './tfl';
import { pickNextPerDirection } from './bridge';
import { classifyFreshness } from './freshness';
import { startPoller } from './poller';
import { render, type ViewModel } from './render';
import { WALTHAMSTOW_CENTRAL_STOPPOINT_ID, POLL_INTERVAL_MS } from './constants';
import type { BridgeEvent } from './bridge';

const root = document.getElementById('app')!;

let lastFetchMs: number | null = null;
let lastEvents: { north?: BridgeEvent; south?: BridgeEvent } = {};
let lastError: string | undefined;

function buildViewModel(): ViewModel {
  return {
    north: lastEvents.north,
    south: lastEvents.south,
    freshness: classifyFreshness(lastFetchMs, Date.now()),
    error: lastFetchMs === null ? lastError : undefined
  };
}

function rerender(): void {
  render(root, buildViewModel());
}

async function tick(): Promise<void> {
  try {
    const arrivals = await fetchArrivals(WALTHAMSTOW_CENTRAL_STOPPOINT_ID);
    lastEvents = pickNextPerDirection(arrivals);
    lastFetchMs = Date.now();
    lastError = undefined;
  } catch (err) {
    lastError = err instanceof Error ? err.message : 'Network error — check connection';
  }
  rerender();
}

// Re-render every second so countdowns tick down and the "updated Xs ago" label advances,
// independent of the 20s poll interval.
setInterval(rerender, 1000);

startPoller(tick, POLL_INTERVAL_MS);
```

- [ ] **Step 2: Verify build and tests still pass**

```bash
npm test && npm run build
```

Expected: all tests pass, TypeScript compiles, `dist/` is rebuilt.

- [ ] **Step 3: Manual verification in dev**

```bash
npm run dev
```

Open `http://localhost:5173` in a browser. Expected observations:
- Two rows appear labelled "→ Chingford" and "← Walthamstow Central"
- Each shows a time countdown or a sleeping state
- Footer shows "updated Xs ago" incrementing every second
- Open DevTools Network tab: a request to `api.tfl.gov.uk/StopPoint/<ID>/Arrivals` fires on load, then again every 20 seconds
- Switch to another tab and back — polling pauses and resumes (network tab confirms)

Stop the server with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire TfL fetch, poller, and renderer together"
```

---

## Task 11: Production styling

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Rewrite `src/styles.css`**

```css
:root {
  color-scheme: dark;
  --bg: #0a0a0f;
  --fg: #f4f4f7;
  --dim: #8a8a96;
  --accent: #7dd3fc;
  --now: #4ade80;
  --warn: #fbbf24;
  --error: #f87171;
  --gap: clamp(1rem, 3vw, 2rem);
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  height: 100%;
  overscroll-behavior: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-text-size-adjust: 100%;
}

#app {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--gap);
  min-height: 100dvh;
  padding: calc(var(--gap) + env(safe-area-inset-top)) var(--gap) calc(var(--gap) + env(safe-area-inset-bottom));
}

.row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.label {
  font-size: 1.25rem;
  color: var(--dim);
  font-weight: 500;
  letter-spacing: 0.02em;
}

.value {
  font-size: clamp(3.5rem, 14vw, 6rem);
  font-weight: 700;
  line-height: 1;
  color: var(--fg);
  font-variant-numeric: tabular-nums;
}

.value.now {
  color: var(--now);
  animation: pulse 1s ease-in-out infinite;
}

.value.just-crossed {
  color: var(--dim);
  font-size: clamp(1.5rem, 6vw, 2.5rem);
  font-weight: 500;
}

.value.sleeping {
  color: var(--dim);
  font-size: clamp(1rem, 4vw, 1.5rem);
  font-weight: 400;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.footer {
  margin-top: auto;
  font-size: 0.875rem;
  color: var(--dim);
  text-align: center;
}

.footer.stale {
  color: var(--warn);
}

.footer.stale::before {
  content: '⚠ ';
}

.footer.no-data {
  color: var(--dim);
}

.empty {
  text-align: center;
  color: var(--dim);
  font-size: 1.25rem;
}

.empty a {
  color: var(--accent);
  display: inline-block;
  margin-top: 1rem;
}

.error {
  color: var(--error);
  font-size: 1.25rem;
  text-align: center;
}
```

- [ ] **Step 2: Manual verification**

```bash
npm run dev
```

Open `http://localhost:5173` on desktop. Resize browser to iPhone dimensions (375×812 in DevTools device mode). Expected:
- Two rows centred vertically
- Large, bold countdown numbers
- "NOW" state (if currently showing) pulses
- Footer sits at bottom with "updated Xs ago"
- No horizontal scroll at narrow widths
- Dark background, no white flashes on load

Stop the server.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: add dark mobile-first styling"
```

---

## Task 12: PWA icons and install

**Files:**
- Create: `public/icon.svg`
- Generate: `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/apple-touch-icon.png`

- [ ] **Step 1: Write `public/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0a0a0f"/>
  <g fill="#7dd3fc">
    <rect x="96" y="200" width="320" height="112" rx="24"/>
    <circle cx="160" cy="360" r="24" fill="#0a0a0f"/>
    <circle cx="352" cy="360" r="24" fill="#0a0a0f"/>
    <rect x="144" y="224" width="96" height="48" rx="8" fill="#0a0a0f"/>
    <rect x="272" y="224" width="96" height="48" rx="8" fill="#0a0a0f"/>
  </g>
</svg>
```

- [ ] **Step 2: Generate PWA icon PNGs**

Run from the project root:

```bash
npx -y @vite-pwa/assets-generator@latest --preset minimal-2023 public/icon.svg
```

Expected: creates `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/apple-touch-icon.png`, and a few other sizes. If it fails (some systems lack `sharp` native bindings), fall back to manually converting via ImageMagick:

```bash
# Fallback only if the above fails:
command -v magick && {
  magick public/icon.svg -resize 192x192 public/pwa-192x192.png
  magick public/icon.svg -resize 512x512 public/pwa-512x512.png
  magick public/icon.svg -resize 180x180 public/apple-touch-icon.png
}
```

If neither works, the user will need to supply these three PNGs manually — document that in the commit message and proceed.

- [ ] **Step 3: Verify PWA manifest serves correctly**

```bash
npm run build && npm run preview
```

Expected: preview server on `http://localhost:4173`. Open DevTools → Application → Manifest:
- Name "Walthamstow Trains" appears
- Icons show 192 and 512 sizes
- "Add to home screen" prompt eligible (warning if not)

Then DevTools → Application → Service Workers: worker is `activated and running`.

Stop the preview server.

- [ ] **Step 4: Commit**

```bash
git add public/
git commit -m "feat: add PWA icons and manifest assets"
```

---

## Task 13: Netlify build config

**Files:**
- Create: `netlify.toml`

- [ ] **Step 1: Write `netlify.toml`**

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- [ ] **Step 2: Commit**

```bash
git add netlify.toml
git commit -m "chore: add Netlify build config"
```

---

## Task 14: Create GitHub repo and push

This task has two paths depending on whether `gh` CLI is installed and authenticated. Check first, then pick the path.

- [ ] **Step 1: Check `gh` availability**

Run:

```bash
gh auth status
```

Expected outcomes:
- **(A)** Output starts with "Logged in to github.com" → proceed to Step 2A.
- **(B)** `command not found` or "You are not logged into any GitHub hosts" → proceed to Step 2B.

- [ ] **Step 2A: Create repo via `gh` CLI**

```bash
gh repo create walthamstow-train-tracker --private --source=. --remote=origin --push
```

Expected: repo created, `origin` remote added, `main` branch pushed. The command output includes the repo URL — save this for Task 15.

Skip Step 2B.

- [ ] **Step 2B: Create repo manually (fallback)**

Instruct the user:

1. Go to https://github.com/new
2. Repository name: `walthamstow-train-tracker`
3. Visibility: Private (or Public — doesn't matter for Netlify)
4. Do NOT initialize with README, .gitignore, or licence (the local repo already has commits)
5. Click "Create repository"
6. Copy the `git remote add origin ...` line from the "push an existing repository" instructions

Then, with the URL captured:

```bash
git remote add origin <PASTE_URL_HERE>
git push -u origin main
```

Expected: all commits pushed to `main` on GitHub.

- [ ] **Step 3: Verify push succeeded**

```bash
git remote -v
```

Expected: `origin` remote shows `github.com/<user>/walthamstow-train-tracker`.

---

## Task 15: Connect Netlify and deploy

- [ ] **Step 1: Check for Netlify CLI**

Run:

```bash
netlify --version
```

Expected outcomes:
- **(A)** Version number printed → proceed to Step 2A.
- **(B)** `command not found` → proceed to Step 2B.

- [ ] **Step 2A: Deploy via Netlify CLI**

```bash
netlify login
```

A browser tab opens for OAuth. Complete login.

```bash
netlify init
```

Choose:
- "Create & configure a new site"
- Team: (your personal team)
- Site name: `walthamstow-trains` (or leave blank for a generated one)
- Build command: (auto-detected from netlify.toml, press Enter)
- Directory: (auto-detected, press Enter)
- Netlify functions folder: (press Enter, none needed)

Expected: site created, linked to the GitHub repo, first build triggered. The CLI prints the site URL (e.g. `https://walthamstow-trains.netlify.app`).

Skip Step 2B.

- [ ] **Step 2B: Connect Netlify manually (fallback)**

Instruct the user:

1. Go to https://app.netlify.com/start
2. Click "Deploy with GitHub"
3. Authorise Netlify if prompted
4. Select the `walthamstow-train-tracker` repo
5. Build settings should auto-populate from `netlify.toml` (command: `npm run build`, publish: `dist`). Leave them.
6. Click "Deploy site"
7. Once the first deploy finishes, go to Site configuration → Change site name and set it to something memorable, e.g. `walthamstow-trains`

- [ ] **Step 3: Verify deploy**

Visit the Netlify URL printed above. Expected:
- Page loads over HTTPS
- Two countdowns visible, footer showing "updated Xs ago"
- Opening DevTools Network tab confirms requests to `api.tfl.gov.uk` succeed
- DevTools → Application → Manifest: PWA manifest detected, install option available

- [ ] **Step 4: Install on phone**

On the user's iPhone:
1. Open Safari, navigate to the Netlify URL
2. Tap the Share button → "Add to Home Screen"
3. Confirm the home-screen icon appears and launches the app fullscreen

On Android / Chrome:
1. Open Chrome, navigate to the URL
2. Menu (⋮) → "Install app" / "Add to Home screen"
3. Confirm same behaviour

- [ ] **Step 5: Done**

The feature is live. Pushing further commits to `main` triggers auto-deploy.

---

## Self-review notes

**Spec coverage check:**
- ✅ Two-direction countdown: Tasks 5, 9, 10
- ✅ Auto-refresh every 20s: Task 8, constants in Task 2
- ✅ "Updated Xs ago" with stale warning: Tasks 6, 7, 9
- ✅ PWA install: Tasks 1 (config), 12 (icons)
- ✅ "Just crossed", "NOW", sleeping, no-trains, error states: Tasks 7, 9, 10
- ✅ Bridge-time offsets (+90s north, -20s south): Task 2 constants, Task 5 logic
- ✅ StopPoint ID verified empirically: Task 2
- ✅ Direction classification: Task 4
- ✅ Netlify + GitHub setup with CLI and manual fallbacks: Tasks 13, 14, 15
- ✅ Service worker does NOT cache TfL API: Task 1 `vite.config.ts` `NetworkOnly` rule
- ✅ Node 20 pinned: `.nvmrc` (Task 1) and `netlify.toml` (Task 13)

**Type consistency check:**
- `Arrival` interface defined once in `tfl.ts`, imported everywhere
- `Direction` type defined once in `direction.ts`
- `BridgeEvent` defined once in `bridge.ts`, used in `render.ts` via import
- `FreshnessState` defined once in `freshness.ts`, used in `render.ts`
- `CountdownLabel` defined once in `display.ts`, used only within `display.ts`
- `ViewModel` defined once in `render.ts`
- Constant names (`POLL_INTERVAL_MS`, `STALE_THRESHOLD_MS`, offsets, stop ID) used consistently

**No placeholders:** All code is complete. The only literal placeholder is `<CONFIRMED_ID>` in Task 2, which is intentionally discovered at runtime — the task includes the exact curl commands and decision rule to find it.
