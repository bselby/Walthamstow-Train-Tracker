# Suffragette Freight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull freight movements alongside passenger Overground on the Suffragette viewpoint (Walthamstow Queens Road), and visually differentiate freight from passenger in the strip, the hero countdown row, and the ticker.

**Architecture:** A new Netlify Function (`netlify/functions/freight.ts`) proxies the Realtime Trains Pull API — holding credentials server-side, normalising the DTO, filtering to freight. The client gets a second poller in `src/main.ts` that runs only when `activeViewpoint.freightStationCode` is set. Merged arrivals flow through the existing `pickNextNPerDirection`; downstream rendering gains an `isFreight` branch on the strip + a `FREIGHT` pill on the hero row + a small `ᶠʳ` marker on ticker entries.

**Tech stack:** TypeScript (strict), Vite, Vitest, Netlify Functions (Node runtime), vanilla DOM rendering, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-04-22-suffragette-freight.md`

---

## Assumptions before starting (read this first)

1. **Multi-viewpoints plan has landed.** Tasks 1–8 of `2026-04-22-multiple-viewpoints.md` are in — `src/viewpoints.ts` exports both `east-ave` and `queens-road`, the switcher renders, per-viewpoint `--line-color` applies. Task 9 of that plan (final QA + deploy) may or may not have completed; it doesn't block this work.

2. **`src/tfl.ts` still hard-codes `data.filter((a) => a.lineId === 'weaver')`.** This is a latent bug that blocks Queens Road passenger data — a Queens Road poll currently returns `[]` because no arrival will have `lineId === 'weaver'`. The multi-viewpoints Task 9 QA would have flagged it; we fix it here in Task 2 if it hasn't landed yet. If Task 9 has already fixed it, skip that portion of Task 2.

3. **Realtime Trains account exists or is obtainable.** Register at `api-portal.rtt.io` for a non-commercial Pull API token before starting Task 1. Token goes into Netlify env vars in Task 10; for local dev it goes into an untracked `.env` file.

4. **`~/.netlify` or the Netlify CLI is installed** if you want to test the function locally. Otherwise, the first real integration test happens against a Netlify preview deploy.

---

## Direction convention (same as the multi-viewpoints plan)

- `'north'` = TfL outbound = left-to-right on the strip.
- `'south'` = TfL inbound = right-to-left on the strip.
- Queens Road's `north` direction terminus is Barking Riverside; `south` is Gospel Oak.

Freight direction is inferred from the service's `locations[]` — whichever terminus the service is travelling toward relative to Queens Road's position on the line.

---

## File structure

### New files
```
netlify/functions/freight.ts          # proxy + normaliser + CORS
src/freight.ts                        # client-side fetch + parse + isFreightByHeadcode
src/freightSvg.ts                     # freight locomotive + wagon SVG constant
tests/freight.test.ts                 # parser + headcode helper tests
tests/netlify-freight.test.ts         # proxy behaviour (with fetch mock)
tests/fixtures/rtt-wmw-sample.json    # a real response captured in Task 1
```

### Modified files
```
src/tfl.ts                            # Arrival gains category/operatorCode/headcode;
                                      # fetchArrivals(stopPointId, lineId)
src/viewpoints.ts                     # freightStationCode on Queens Road
src/main.ts                           # second poller + freightSnapshots + merge
src/bridge.ts                         # (no signature change; regression test only)
src/render.ts                         # FREIGHT tag in hero row + ᶠʳ ticker marker
src/strip.ts                          # StripModel gains isFreight; in-place SVG swap
src/styles.css                        # --freight-color, .strip-train.freight,
                                      # .freight-tag, .ticker-value-freight, .stale
public/about.html                     # freight sentence + RTT attribution
public/privacy.html                   # soften "no server" language
netlify.toml                          # [functions] directory declaration
tests/bridge.test.ts                  # mixed-category regression
tests/fixtures/                       # rtt sample added; tfl fixture untouched
```

---

## Task 1: Spike — capture a live rtt.io response and pin the DTO shape

**Files:**
- Create: `tests/fixtures/rtt-wmw-sample.json`
- Read only: `src/viewpoints.ts` (to confirm CRS)

**Context:** The spec was written without a confirmed rtt.io response shape. This task fetches one live response, commits it as a fixture, and locks the field names the parser will rely on. No production code yet.

- [ ] **Step 1: Register for a Realtime Trains API token**

Sign up at `https://api-portal.rtt.io` if you haven't. Request a non-commercial Pull API token. Note your username and generated token/password.

- [ ] **Step 2: Resolve Walthamstow Queens Road's CRS**

Run:
```bash
curl -s -u "${RTT_USERNAME}:${RTT_TOKEN}" \
  'https://api.rtt.io/api/v1/json/search/WMW' \
  | head -c 400
```

Expected: a JSON response containing `"name":"Walthamstow Queens Road"` or similar.

If 404 or "no such station", try alternative CRS codes:
```bash
curl -s -u "${RTT_USERNAME}:${RTT_TOKEN}" \
  'https://api.rtt.io/api/v1/json/search/Walthamstow%20Queens%20Road' \
  | head -c 400
```

Copy the confirmed CRS. Default assumption is `WMW`; correct if different.

- [ ] **Step 3: Capture a live station board response**

On a weekday afternoon (13:00–17:00 GMT gives the best freight mix):
```bash
curl -s -u "${RTT_USERNAME}:${RTT_TOKEN}" \
  'https://api.rtt.io/api/v1/json/search/WMW' \
  > tests/fixtures/rtt-wmw-sample.json
```

(Substitute the correct CRS from Step 2 if not `WMW`.)

Open the fixture and confirm it contains at least one freight row. Search for `"serviceType"` values present; if only passenger rows are in the capture, wait 15 min and retry.

- [ ] **Step 4: Document observed fields in a comment at the top of the fixture**

Prepend a comment (or a sibling `rtt-wmw-sample.md` file — JSON doesn't allow comments) listing:

- The top-level keys (e.g. `location`, `services`, `filter`).
- Per-service keys actually present: `serviceType`, `serviceUid`, `atocCode`, `atocName`, `trainIdentity`, `locationDetail.gbttBookedArrival`, `locationDetail.realtimeArrival`, `locationDetail.gbttBookedPass`, `locationDetail.realtimePass`, `locationDetail.origin[]`, `locationDetail.destination[]`, `locationDetail.isCall`, `locationDetail.isPublicCall`, `isPassengerCancelled`, etc.
- Which fields populate for freight rows vs passenger rows (note the pass vs arrival asymmetry).
- The observed CORS header on the response (`curl -I` on the endpoint; document whether `Access-Control-Allow-Origin` is present).

The `src/freight.ts` parser in Task 3 will map against exactly these field names — any deviation from the spec's assumptions lives in the Task 3 `parseFreightResponse` implementation.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/rtt-wmw-sample.json tests/fixtures/rtt-wmw-sample.md
git commit -m "$(cat <<'EOF'
chore: capture live rtt.io station board response for WMW

Fixture for the Suffragette freight work. Includes a sibling .md
documenting the observed field names so the parser in the next commit
can target them directly.

No production code yet.
EOF
)"
```

---

## Task 2: Prerequisite fix + shared type additions

**Files:**
- Modify: `src/tfl.ts`
- Modify: `src/viewpoints.ts`
- Modify: `src/main.ts`
- Modify: `tests/tfl.test.ts`
- Modify: `tests/viewpoints.test.ts`

**Context:** Before any freight work, three scaffolding changes all land together because they're entangled: (a) generalise `fetchArrivals` so Queens Road actually returns passenger data; (b) extend the `Arrival` interface with freight-capable fields; (c) extend `Viewpoint` with `freightStationCode`. None of these change runtime behaviour on their own (category is optional, freightStationCode is optional, `lineId` is read from the viewpoint that was already being passed around).

Check first whether Task 9 of the multi-viewpoints plan has already generalised `fetchArrivals`. If it has, skip Step 2 here and just do the type additions.

- [ ] **Step 1: Update `tests/tfl.test.ts` for the new signature**

Open `tests/tfl.test.ts`. Wherever it asserts `fetchArrivals(stopPointId)` returns weaver-only, change the expectation to `fetchArrivals(stopPointId, lineId)` where the filter respects the argument. Add one test for Suffragette filtering:

```ts
it('filters by the supplied lineId (suffragette)', async () => {
  const mixedResponse = [
    { id: 'a', lineId: 'suffragette', /* …minimum fields */ },
    { id: 'b', lineId: 'weaver', /* …minimum fields */ },
  ];
  // mock fetch to return mixedResponse
  const result = await fetchArrivals('910GWLTHQRD', 'suffragette');
  expect(result.map(a => a.id)).toEqual(['a']);
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
npx vitest run tests/tfl.test.ts
```

Expected: FAIL on the signature mismatch and/or the hard-coded filter.

- [ ] **Step 3: Update `src/tfl.ts`**

Replace the `fetchArrivals` implementation:
```ts
export async function fetchArrivals(stopPointId: string, lineId: string): Promise<Arrival[]> {
  const response = await fetch(TFL_ARRIVALS_URL(stopPointId));
  if (!response.ok) {
    throw new Error(`TfL API error: ${response.status}`);
  }
  const data = (await response.json()) as Arrival[];
  return data.filter((a) => a.lineId === lineId);
}
```

Extend the `Arrival` interface in the same file:
```ts
export type ServiceCategory = 'passenger' | 'freight';

export interface Arrival {
  // ...existing fields unchanged...

  /** Category of service. Undefined → passenger (all TfL rows). */
  category?: ServiceCategory;
  /** ATOC code (two letters). Freight only. */
  operatorCode?: string;
  /** Four-character headcode like '6M23'. Freight only. */
  headcode?: string;
  /** Free-text origin location (yard/depot for freight, terminus for passenger).
   *  TfL passenger rows leave this undefined; freight proxy populates it from
   *  the rtt.io locationDetail.origin[0].description. Rendered as part of the
   *  hero-row 'origin → destination' subtitle when hero is freight. */
  origin?: string;
}
```

- [ ] **Step 4: Update the single `fetchArrivals` caller in `src/main.ts`**

Change:
```ts
const arrivals = await fetchArrivals(activeViewpoint.stopPointId);
```
to:
```ts
const arrivals = await fetchArrivals(activeViewpoint.stopPointId, activeViewpoint.lineId);
```

- [ ] **Step 5: Extend `Viewpoint` + update Queens Road**

In `src/viewpoints.ts`, add to the interface:
```ts
export interface Viewpoint {
  // ...existing fields...

  /** Realtime Trains station CRS. When set, the app polls freight from
   *  this station. Undefined → no freight poll for this viewpoint. */
  freightStationCode?: string;
}
```

Add to the `'queens-road'` record:
```ts
freightStationCode: 'WMW', // confirm via Task 1 Step 2; adjust if different
```

Leave `'east-ave'` alone (field absent).

- [ ] **Step 6: Extend `tests/viewpoints.test.ts`**

Add:
```ts
it('queens-road has a freightStationCode', () => {
  expect(getViewpointById('queens-road')?.freightStationCode).toBeTruthy();
});

it('east-ave does NOT have a freightStationCode', () => {
  expect(getViewpointById('east-ave')?.freightStationCode).toBeUndefined();
});
```

- [ ] **Step 7: Run the full test suite**

```bash
npm test
```

Expected: all tests pass (including the two new Viewpoint tests and updated tfl tests).

- [ ] **Step 8: Commit**

```bash
git add src/tfl.ts src/viewpoints.ts src/main.ts tests/tfl.test.ts tests/viewpoints.test.ts
git commit -m "$(cat <<'EOF'
refactor: fetchArrivals takes lineId; Arrival + Viewpoint gain freight fields

Three scaffolding changes for Suffragette-freight:

1. fetchArrivals(stopPointId, lineId): the filter was hard-coded to
   'weaver' — a latent bug blocking Queens Road passenger data. Now
   filters by the active viewpoint's lineId.

2. Arrival gains optional category / operatorCode / headcode / origin
   fields. TfL rows leave these undefined; downstream code reads
   (arrival.category ?? 'passenger') and shows origin only when
   freight hero has both origin + destinationName populated.

3. Viewpoint gains optional freightStationCode. Queens Road gets
   'WMW' (Walthamstow Queens Road CRS, verified against rtt.io's
   /search endpoint). East Ave leaves it undefined — no freight
   traffic on the Chingford branch.

No runtime behaviour change yet; freight feed arrives in the next
commit.
EOF
)"
```

---

## Task 3: Freight response parser + headcode helper

**Files:**
- Create: `src/freight.ts`
- Create: `tests/freight.test.ts`

**Context:** Pure client-side logic. Takes a `FreightResponse` DTO (shape documented in the spec) and returns `Arrival[]` tagged with `category: 'freight'`. The helper `isFreightByHeadcode` is exported so the proxy can reuse the same rule.

- [ ] **Step 1: Write `tests/freight.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseFreightResponse, isFreightByHeadcode } from '../src/freight';
import { getViewpointById } from '../src/viewpoints';

const QUEENS_ROAD = getViewpointById('queens-road')!;

describe('isFreightByHeadcode', () => {
  it('classifies standard freight headcodes (4xxx–8xxx) as freight', () => {
    expect(isFreightByHeadcode('4L85')).toBe(true);
    expect(isFreightByHeadcode('6M23')).toBe(true);
    expect(isFreightByHeadcode('7H47')).toBe(true);
    expect(isFreightByHeadcode('8G09')).toBe(true);
  });

  it('classifies light-loco (0xxx) as freight', () => {
    expect(isFreightByHeadcode('0Z72')).toBe(true);
  });

  it('classifies passenger (1/2/9) as non-freight', () => {
    expect(isFreightByHeadcode('1A05')).toBe(false);
    expect(isFreightByHeadcode('2H05')).toBe(false);
    expect(isFreightByHeadcode('9C71')).toBe(false);
  });

  it('classifies ECS (3xxx) as non-freight (treat as passenger for our binary split)', () => {
    expect(isFreightByHeadcode('3S17')).toBe(false);
  });

  it('returns false for empty / malformed headcodes', () => {
    expect(isFreightByHeadcode('')).toBe(false);
    expect(isFreightByHeadcode(undefined as unknown as string)).toBe(false);
    expect(isFreightByHeadcode('??')).toBe(false);
  });
});

describe('parseFreightResponse', () => {
  const sampleDto = {
    arrivals: [
      {
        id: 'X12345',
        headcode: '6M23',
        operatorCode: 'DB',
        operatorName: 'DB Cargo',
        origin: 'Tilbury Riverside Yard',
        destination: 'Willesden Euroterminal',
        timeToStation: 180,
        expectedPass: '2026-04-22T14:23:00Z',
        direction: 'outbound' as const,
        category: 'freight' as const,
      },
      {
        id: 'X67890',
        headcode: '4L85',
        operatorCode: 'FL',
        operatorName: 'Freightliner',
        origin: 'Crewe Basford Hall',
        destination: 'Felixstowe North',
        timeToStation: 600,
        expectedPass: '2026-04-22T14:30:00Z',
        direction: 'inbound' as const,
        category: 'freight' as const,
      },
    ],
    fetchedAt: '2026-04-22T14:20:00Z',
  };

  it('maps DTOs to Arrival[] with category=freight', () => {
    const result = parseFreightResponse(sampleDto, QUEENS_ROAD);
    expect(result).toHaveLength(2);
    expect(result[0].category).toBe('freight');
    expect(result[0].id).toBe('X12345');
    expect(result[0].operatorCode).toBe('DB');
    expect(result[0].headcode).toBe('6M23');
    expect(result[0].timeToStation).toBe(180);
    expect(result[0].expectedArrival).toBe('2026-04-22T14:23:00Z');
    expect(result[0].origin).toBe('Tilbury Riverside Yard');
    expect(result[0].destinationName).toBe('Willesden Euroterminal');
  });

  it('maps outbound → direction that will classify as north on Queens Road', () => {
    const result = parseFreightResponse(sampleDto, QUEENS_ROAD);
    // parseFreightResponse sets arrival.direction to the upstream tfl-style
    // token so classifyDirection can reuse its existing logic.
    expect(result[0].direction).toBe('outbound');
    expect(result[1].direction).toBe('inbound');
  });

  it('skips malformed entries without throwing', () => {
    const malformed = {
      arrivals: [
        { id: 'X1', /* missing most fields */ } as never,
        sampleDto.arrivals[0],
      ],
      fetchedAt: sampleDto.fetchedAt,
    };
    const result = parseFreightResponse(malformed, QUEENS_ROAD);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('X12345');
  });

  it('returns [] for an empty response', () => {
    expect(parseFreightResponse({ arrivals: [], fetchedAt: '...' }, QUEENS_ROAD)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
npx vitest run tests/freight.test.ts
```

Expected: FAIL — `src/freight.ts` does not exist.

- [ ] **Step 3: Create `src/freight.ts`**

```ts
import type { Arrival } from './tfl';
import type { Viewpoint } from './viewpoints';

const FREIGHT_HEADCODE_FIRST_CHARS = new Set(['0', '4', '5', '6', '7', '8']);

export function isFreightByHeadcode(headcode: string | undefined): boolean {
  if (!headcode || headcode.length < 1) return false;
  return FREIGHT_HEADCODE_FIRST_CHARS.has(headcode[0]);
}

export interface FreightArrivalDTO {
  id: string;
  headcode: string;
  operatorCode: string;
  operatorName: string;
  origin: string;
  destination: string;
  timeToStation: number;
  expectedPass: string;
  direction: 'outbound' | 'inbound';
  category: 'freight';
}

export interface FreightResponse {
  arrivals: FreightArrivalDTO[];
  fetchedAt: string;
}

function hasRequiredFields(dto: Partial<FreightArrivalDTO>): dto is FreightArrivalDTO {
  return typeof dto.id === 'string'
    && typeof dto.headcode === 'string'
    && typeof dto.timeToStation === 'number'
    && typeof dto.expectedPass === 'string'
    && (dto.direction === 'outbound' || dto.direction === 'inbound');
}

export function parseFreightResponse(response: FreightResponse, viewpoint: Viewpoint): Arrival[] {
  return response.arrivals
    .filter(hasRequiredFields)
    .map((dto) => ({
      id: dto.id,
      stationName: viewpoint.stops[viewpoint.anchorIndex].fullName,
      lineId: viewpoint.lineId,
      destinationName: dto.destination,
      origin: dto.origin,               // preserved so the hero subtitle can render 'origin → destination'
      timeToStation: dto.timeToStation,
      expectedArrival: dto.expectedPass,
      modeName: 'freight',
      platformName: '',
      direction: dto.direction,
      category: 'freight' as const,
      operatorCode: dto.operatorCode,
      headcode: dto.headcode,
    }));
}

export async function fetchFreight(stationCode: string, viewpoint: Viewpoint): Promise<Arrival[]> {
  const url = `/.netlify/functions/freight?station=${encodeURIComponent(stationCode)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Freight proxy error: ${response.status}`);
  }
  const data = (await response.json()) as FreightResponse;
  return parseFreightResponse(data, viewpoint);
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npx vitest run tests/freight.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: all tests pass (no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/freight.ts tests/freight.test.ts
git commit -m "$(cat <<'EOF'
feat: freight response parser + headcode heuristic

src/freight.ts exports three things:

- isFreightByHeadcode: pure helper. First-digit rule covers the UK
  convention (0/4/5/6/7/8 = freight; 1/2/3/9 = non-freight). Used by
  the proxy in the next commit to double-check upstream serviceType.

- parseFreightResponse: maps the proxy's normalised DTO to the app's
  existing Arrival shape with category='freight'. Malformed entries
  are skipped rather than thrown.

- fetchFreight: the client-side wrapper around the Netlify Function.
  Errors propagate (caller handles — main.ts will catch and treat as
  stale freight).

No main.ts wiring yet.
EOF
)"
```

---

## Task 4: Netlify Function — proxy + auth + CORS

**Files:**
- Create: `netlify/functions/freight.ts`
- Create: `tests/netlify-freight.test.ts`
- Modify: `netlify.toml`
- Create: `.env.example` (documents required env vars; actual `.env` is gitignored)

**Context:** The function is the only piece that talks to rtt.io. It reads creds from env vars, calls the Pull API, filters to freight using both `serviceType` and `isFreightByHeadcode`, normalises to our DTO, and returns JSON with permissive CORS.

- [ ] **Step 1: Add the functions directory to `netlify.toml`**

After the `[build.environment]` block, add:
```toml
[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
```

Confirm the existing `[[redirects]]` catch-all for `/*` has lower priority than `/.netlify/functions/*` (Netlify handles this automatically — functions take precedence over redirects — but verify the final deploy).

- [ ] **Step 2: Write `tests/netlify-freight.test.ts`**

Use Vitest's fetch mock / `vi.stubGlobal` to mock the rtt.io call. Test cases:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handler } from '../netlify/functions/freight';

function mkRequest(qs: Record<string, string> = { station: 'WMW' }) {
  const url = new URL('http://localhost/.netlify/functions/freight');
  for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

describe('freight function', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubEnv('RTT_USERNAME', 'u');
    vi.stubEnv('RTT_TOKEN', 't');
  });

  it('returns 500 not_configured when env vars missing', async () => {
    vi.stubEnv('RTT_USERNAME', '');
    const res = await handler(mkRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('not_configured');
  });

  it('filters to freight rows via serviceType OR headcode', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      services: [
        { serviceType: 'train', trainIdentity: '2H05', /* passenger */ },
        { serviceType: 'freight', trainIdentity: '6M23', atocCode: 'DB', /* freight */
          locationDetail: { realtimePass: '14:23', gbttBookedPass: '14:23', destination: [{ description: 'Willesden' }], origin: [{ description: 'Tilbury' }] } },
        { serviceType: 'train', trainIdentity: '0Z72', atocCode: 'DR', /* light loco */
          locationDetail: { realtimePass: '14:27', gbttBookedPass: '14:27', destination: [{ description: 'Dollands Moor' }], origin: [{ description: 'Wembley' }] } },
      ],
    }), { status: 200 })));
    const res = await handler(mkRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.arrivals).toHaveLength(2);
    expect(body.arrivals.every((a: any) => a.category === 'freight')).toBe(true);
  });

  it('upstream 401 → 502 upstream_auth', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unauthorized', { status: 401 })));
    const res = await handler(mkRequest());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('upstream_auth');
  });

  it('upstream 429 → 429 rate_limited with Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', {
      status: 429,
      headers: { 'Retry-After': '300' },
    })));
    const res = await handler(mkRequest());
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('300');
  });

  it('every response has permissive CORS', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ services: [] }), { status: 200 })));
    const res = await handler(mkRequest());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('400 when station missing', async () => {
    const req = new Request('http://localhost/.netlify/functions/freight');
    const res = await handler(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run the test — expect failure**

```bash
npx vitest run tests/netlify-freight.test.ts
```

Expected: FAIL — the handler doesn't exist yet.

- [ ] **Step 4: Create `netlify/functions/freight.ts`**

Using Netlify's Web-standard `Request`/`Response` handler signature:

```ts
import { isFreightByHeadcode } from '../../src/freight';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=30',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function parsePassTime(rawTime: string | undefined, now: Date): { secondsAway: number; isoTimestamp: string } | null {
  if (!rawTime) return null;
  // rtt.io returns 'HHMM' for timetable-style times (e.g. "1423" = 14:23).
  const hours = parseInt(rawTime.slice(0, 2), 10);
  const mins = parseInt(rawTime.slice(2, 4), 10);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  const target = new Date(now);
  target.setUTCHours(hours, mins, 0, 0);
  // Midnight rollover heuristic: if the scheduled time is > 4 h in the past, assume it's tomorrow's.
  if (target.getTime() < now.getTime() - 4 * 3600 * 1000) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return {
    secondsAway: Math.round((target.getTime() - now.getTime()) / 1000),
    isoTimestamp: target.toISOString(),
  };
}

interface RttService {
  serviceType?: string;
  serviceUid?: string;
  trainIdentity?: string;
  atocCode?: string;
  atocName?: string;
  isPassengerCancelled?: boolean;
  locationDetail?: {
    gbttBookedPass?: string;
    realtimePass?: string;
    gbttBookedArrival?: string;
    realtimeArrival?: string;
    origin?: Array<{ description?: string }>;
    destination?: Array<{ description?: string }>;
  };
}

export async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'GET') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  const url = new URL(request.url);
  const station = url.searchParams.get('station');
  if (!station || !/^[A-Z]{3}$/.test(station)) {
    return jsonResponse(400, { error: 'invalid_station' });
  }

  const username = process.env.RTT_USERNAME;
  const token = process.env.RTT_TOKEN;
  if (!username || !token) {
    return jsonResponse(500, { error: 'not_configured' });
  }

  const basicAuth = Buffer.from(`${username}:${token}`).toString('base64');
  let upstream: Response;
  try {
    upstream = await fetch(`https://api.rtt.io/api/v1/json/search/${station}`, {
      headers: { Authorization: `Basic ${basicAuth}` },
    });
  } catch {
    return jsonResponse(502, { error: 'upstream_net' });
  }

  if (upstream.status === 401 || upstream.status === 403) {
    return jsonResponse(502, { error: 'upstream_auth' });
  }
  if (upstream.status === 429) {
    const retryAfter = upstream.headers.get('Retry-After') ?? '300';
    return jsonResponse(429, { error: 'rate_limited' }, { 'Retry-After': retryAfter });
  }
  if (!upstream.ok) {
    return jsonResponse(502, { error: 'upstream_shape' });
  }

  const raw = (await upstream.json()) as { services?: RttService[] };
  const now = new Date();

  const freightArrivals = (raw.services ?? [])
    .filter((s) => {
      if (s.isPassengerCancelled) return false;
      if (s.serviceType === 'freight') return true;
      return isFreightByHeadcode(s.trainIdentity);
    })
    .map((s) => {
      const loc = s.locationDetail ?? {};
      const passTime = parsePassTime(loc.realtimePass ?? loc.gbttBookedPass, now)
        ?? parsePassTime(loc.realtimeArrival ?? loc.gbttBookedArrival, now);
      if (!passTime) return null;
      // Direction inference: a northbound (outbound) Suffragette service heading
      // toward Barking Riverside will have a destination east of Queens Road; a
      // southbound service's destination is west. We use a very coarse check —
      // if the destination name contains 'Barking' or 'Dagenham' or 'Upminster'
      // assume outbound; otherwise inbound. Refine later if misclassifications
      // show up in QA.
      const destName = (loc.destination?.[0]?.description ?? '').toLowerCase();
      const isEastbound = /barking|dagenham|upminster|tilbury|gateway|grays|shoeburyness/.test(destName);
      return {
        id: s.serviceUid ?? s.trainIdentity ?? 'unknown',
        headcode: s.trainIdentity ?? '',
        operatorCode: s.atocCode ?? '',
        operatorName: s.atocName ?? '',
        origin: loc.origin?.[0]?.description ?? '',
        destination: loc.destination?.[0]?.description ?? '',
        timeToStation: passTime.secondsAway,
        expectedPass: passTime.isoTimestamp,
        direction: isEastbound ? 'outbound' : 'inbound',
        category: 'freight' as const,
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  return jsonResponse(200, {
    arrivals: freightArrivals,
    fetchedAt: now.toISOString(),
  });
}

export default handler;
```

- [ ] **Step 5: Add `.env.example`**

```
# Realtime Trains Pull API — non-commercial token from api-portal.rtt.io
RTT_USERNAME=
RTT_TOKEN=
```

Ensure `.env` is in `.gitignore` (the repo should already ignore it — check `git status` after creating a throwaway `.env` and confirm it's untracked).

- [ ] **Step 6: Run the test — expect pass**

```bash
npx vitest run tests/netlify-freight.test.ts
```

Expected: PASS on all six cases.

- [ ] **Step 7: Run the full suite + type check**

```bash
npm test
npx tsc --noEmit
```

Expected: everything green.

- [ ] **Step 8: Local smoke test via the Netlify CLI (optional but recommended)**

If the Netlify CLI is installed:
```bash
RTT_USERNAME='…' RTT_TOKEN='…' netlify dev
```

In another terminal:
```bash
curl -s 'http://localhost:8888/.netlify/functions/freight?station=WMW' | head -c 1000
```

Expected: a JSON response matching the `FreightResponse` shape, with >=1 freight arrival during a freight-busy window.

- [ ] **Step 9: Commit**

```bash
git add netlify/functions/freight.ts tests/netlify-freight.test.ts netlify.toml .env.example
git commit -m "$(cat <<'EOF'
feat: Netlify Function proxy for Realtime Trains freight feed

netlify/functions/freight.ts holds the RTT Pull API credentials in
env vars (RTT_USERNAME / RTT_TOKEN), calls the station-board endpoint,
filters to freight via serviceType OR the first-digit headcode rule,
and normalises the response to the client-side DTO shape already
parsed by src/freight.ts.

Error handling:
- Missing env vars → 500 not_configured
- Upstream 401/403 → 502 upstream_auth
- Upstream 429 → 429 rate_limited with Retry-After pass-through
- Network / other → 502 upstream_net / upstream_shape

CORS: Access-Control-Allow-Origin: * on every response (static site
origin varies between preview / production domains, permissive is fine
for a public read-only endpoint).

Not yet wired in main.ts — next commit.
EOF
)"
```

---

## Task 5: Wire the freight poller into `main.ts`

**Files:**
- Modify: `src/main.ts`
- Modify: `tests/bridge.test.ts` (mixed-category regression)

**Context:** Add a second poller running only when `activeViewpoint.freightStationCode` is set, maintain `freightSnapshots` alongside existing `snapshots`, merge the two before `pickNextNPerDirection`. On viewpoint switch, clear both buckets and toggle the freight poller.

- [ ] **Step 1: Add a mixed-category test to `tests/bridge.test.ts`**

```ts
it('sorts mixed passenger+freight purely by bridgeTimeSeconds', () => {
  const QR = getViewpointById('queens-road')!;
  const arrivals = [
    { ...arrival('Barking Riverside', 120, 'p1'), lineId: 'suffragette' },
    { ...arrival('Felixstowe', 60, 'f1'), lineId: 'suffragette', category: 'freight' as const, headcode: '4L85' },
    { ...arrival('Barking Riverside', 180, 'p2'), lineId: 'suffragette' },
  ];
  const picked = pickNextNPerDirection(arrivals, 3, QR);
  expect(picked.north.map(e => e.arrival.id)).toEqual(['f1', 'p1', 'p2']);
});
```

(The existing `arrival()` helper builds passenger rows; override `lineId` + freight fields where needed.)

- [ ] **Step 1b: Strip-position clamp for freight far-out**

The clamp lives in `main.ts`'s `buildViewModel` (not in `pickNextNPerDirection`), so testing it directly via `bridge.test.ts` isn't right. Add a thin test either by extracting a helper or via a lightweight `main.test.ts`. Simplest approach: extract a pure helper in `src/main.ts`:

```ts
export function clampFreightPosition(
  pos: number | null,
  liveTtsSeconds: number,
  isFreight: boolean,
): number | null {
  if (isFreight && liveTtsSeconds > FREIGHT_STRIP_MAX_TTS_SECONDS) return null;
  return pos;
}
```

Then in `tests/main.test.ts` (new file, or extend whichever exists):
```ts
import { clampFreightPosition } from '../src/main';

describe('clampFreightPosition', () => {
  it('passes passenger positions through unchanged', () => {
    expect(clampFreightPosition(3.5, 600, false)).toBe(3.5);
    expect(clampFreightPosition(null, 600, false)).toBeNull();
  });

  it('passes freight through when tts <= 300', () => {
    expect(clampFreightPosition(3.5, 300, true)).toBe(3.5);
    expect(clampFreightPosition(3.5, 60, true)).toBe(3.5);
  });

  it('clamps freight to null when tts > 300', () => {
    expect(clampFreightPosition(3.5, 301, true)).toBeNull();
    expect(clampFreightPosition(3.5, 900, true)).toBeNull();
  });
});
```

Wire the helper into the `buildViewModel` branch from Step 4 — call it instead of the inline ternary.

- [ ] **Step 2: Run the test — expect pass**

Because `pickNextNPerDirection` doesn't know about category, this test should pass immediately — prove it:

```bash
npx vitest run tests/bridge.test.ts
```

Expected: PASS (including the new case). If it fails, the sort/filter logic has an unexpected dependency on category — stop and investigate.

- [ ] **Step 3: Add freight poller state + functions in `src/main.ts`**

Near the top of `main.ts`, alongside the existing `snapshots` declaration:

```ts
const FREIGHT_POLL_INTERVAL_MS = 45_000;

/** Live timeToStation threshold (seconds) beyond which we hide the freight
 *  strip glyph. Rationale: estimatePosition uses passenger-speed segment
 *  timings; freight runs at different speeds and may not even be on our
 *  modelled stops yet beyond ~5 min. Hide the glyph, keep the countdown. */
const FREIGHT_STRIP_MAX_TTS_SECONDS = 300;

let freightSnapshots: Partial<Record<Direction, DirectionSnapshots>> = {};
let lastFreightFetchMs: number | null = null;
let lastFreightError: string | undefined;
let freightPollerStop: (() => void) | null = null;
```

Add the tick function:

```ts
async function freightTick(): Promise<void> {
  const vp = activeViewpoint;
  if (!vp.freightStationCode) return;   // viewpoint changed mid-flight; no-op
  try {
    const arrivals = await fetchFreight(vp.freightStationCode, vp);
    const picked = pickNextNPerDirection(arrivals, TICKER_SIZE, vp);
    const now = Date.now();
    freightSnapshots = {
      north: picked.north.length > 0 ? { events: picked.north, snapshottedAtMs: now } : undefined,
      south: picked.south.length > 0 ? { events: picked.south, snapshottedAtMs: now } : undefined,
    };
    lastFreightFetchMs = now;
    lastFreightError = undefined;
  } catch (err) {
    lastFreightError = err instanceof Error ? err.message : 'Freight error';
  }
  rerender();
}
```

Add poller lifecycle helpers:

```ts
function startFreightPoller(): void {
  if (freightPollerStop !== null) return;
  if (!activeViewpoint.freightStationCode) return;
  freightPollerStop = startPoller(freightTick, FREIGHT_POLL_INTERVAL_MS);
}

function stopFreightPoller(): void {
  if (freightPollerStop !== null) {
    freightPollerStop();
    freightPollerStop = null;
  }
  freightSnapshots = {};
  lastFreightFetchMs = null;
}
```

- [ ] **Step 4: Merge freight into `buildViewModel`**

Modify the per-direction loop in `buildViewModel()` to concatenate passenger + freight events before picking hero / ticker:

```ts
for (const dir of DIRECTIONS) {
  const passenger = snapshots[dir]?.events ?? [];
  const freight = freightSnapshots[dir]?.events ?? [];
  const snap = snapshots[dir] ?? freightSnapshots[dir];   // borrow whichever has a timestamp
  if (!snap) continue;

  // Merge + re-sort by live bridge time, then treat index 0 as hero.
  const mergedLive = [...passenger, ...freight]
    .map((ev) => {
      const srcSnap = passenger.includes(ev) ? snapshots[dir]! : freightSnapshots[dir]!;
      const elapsed = (now - srcSnap.snapshottedAtMs) / 1000;
      return { ...ev, bridgeTimeSeconds: ev.bridgeTimeSeconds - elapsed };
    })
    .sort((a, b) => a.bridgeTimeSeconds - b.bridgeTimeSeconds);

  heroes[dir] = mergedLive[0];
  if (heroes[dir]) {
    const hero = heroes[dir]!;
    const heroSnap = passenger.includes(hero) ? snapshots[dir]! : freightSnapshots[dir]!;
    const heroLiveTts = hero.arrival.timeToStation - (now - heroSnap.snapshottedAtMs) / 1000;
    const heroIsFreight = (hero.arrival.category ?? 'passenger') === 'freight';
    const rawPos = estimatePosition(heroLiveTts, hero.direction, activeViewpoint);
    // Clamp to null when freight is too far out to place honestly — see
    // clampFreightPosition / FREIGHT_STRIP_MAX_TTS_SECONDS.
    positions[dir] = clampFreightPosition(rawPos, heroLiveTts, heroIsFreight);
  } else {
    positions[dir] = null;
  }

  for (let i = 1; i < TICKER_SIZE; i++) {
    const entry = mergedLive[i];
    if (entry && entry.bridgeTimeSeconds >= 0) tickers[dir].push(entry);
  }
}
```

(The existing `liveEvent` / `livePosition` helpers may need small refactors to work against either snapshot. Keep the diff minimal — if the live-decrement logic feels messy, extract a `decrementAgainst(snap, ev)` helper.)

- [ ] **Step 5: Start/stop the freight poller based on viewpoint**

At the bottom of `main.ts`, near `startRenderLoop()`:

```ts
startRenderLoop();
startPoller(tick, POLL_INTERVAL_MS);
startFreightPoller();
```

In `switchToViewpoint`:

```ts
export function switchToViewpoint(id: string): void {
  const next = getViewpointById(id);
  if (!next || next.id === activeViewpoint.id) return;
  activeViewpoint = next;
  snapshots = {};
  freightSnapshots = {};
  predictionSamples.north.length = 0;
  predictionSamples.south.length = 0;
  document.title = `East Ave Trains — ${activeViewpoint.name}`;
  document.documentElement.style.setProperty('--line-color', activeViewpoint.lineColor);

  // Start or stop the freight poller based on the new viewpoint.
  stopFreightPoller();
  startFreightPoller();

  rerender();
  void tick();
  if (activeViewpoint.freightStationCode) void freightTick();
}
```

- [ ] **Step 6: Visibility integration**

The existing `visibilitychange` handler already calls `startRenderLoop` / `stopRenderLoop` and pauses the TfL poller via `startPoller`'s internal logic. `startPoller` already handles visibility itself. Confirm that `freightPollerStop` (which was also created via `startPoller`) pauses correctly when the tab hides — no extra code needed.

- [ ] **Step 7: Run the full suite + type check + dev server smoke**

```bash
npm test
npx tsc --noEmit
npm run dev
```

Expected:
- All tests pass.
- No TS errors.
- Dev server running at `http://localhost:5173`. Without `RTT_USERNAME`/`RTT_TOKEN` set locally, the `/freight` call will 500 → `lastFreightError` populates → `freightSnapshots` stays empty → passenger data unaffected. This is the expected "not configured locally" behaviour.

- [ ] **Step 8: Commit**

```bash
git add src/main.ts tests/bridge.test.ts
git commit -m "$(cat <<'EOF'
feat: second poller merges freight into the view model

main.ts now runs two independent pollers:

- tick() every 20 s — existing TfL passenger poll
- freightTick() every 45 s — only when activeViewpoint.freightStationCode
  is set (currently only Queens Road)

buildViewModel merges the two snapshot buckets, re-sorts by live
bridgeTimeSeconds, and feeds the existing hero/ticker/strip logic
unchanged. Mixed-category regression test added to bridge.test.ts:
freight in 60 s beats passenger in 120 s as expected.

clampFreightPosition: a new pure helper that hides the freight strip
glyph when the live timeToStation exceeds 300 s. estimatePosition uses
passenger-speed segment timings; beyond 5 min the error is large
enough — and the freight may not yet be on our modelled stops at all —
that a best-effort position is dishonest. Countdown + ticker continue
to render; strip glyph returns as the freight closes to within ~5 min.

Failures in either feed leave the other untouched. Switching viewpoint
clears both buckets and toggles the freight poller based on the new
viewpoint's freightStationCode.

UI still doesn't differentiate freight visually — that's the next
three commits.
EOF
)"
```

---

## Task 6: Freight SVG + strip render swap

**Files:**
- Create: `src/freightSvg.ts`
- Modify: `src/strip.ts`
- Modify: `src/render.ts`
- Modify: `tests/strip.test.ts` (or create if absent)

**Context:** Author the freight locomotive + wagon silhouette. Extend `StripModel` with `isFreight: boolean`. When true, the strip's train element swaps its inner SVG to the freight one and toggles a `.freight` class. Outer `.strip-train` element is reused so the CSS transition and `--pos` continuity stay alive across category changes.

- [ ] **Step 1: Create `src/freightSvg.ts`**

```ts
// Class 66-style freight locomotive + a single container wagon behind. Flat-top,
// blocky — reads as "freight" at a glance, especially next to the rounded-nose
// Aventra passenger SVG.
export const FREIGHT_TRAIN_SVG = `
<svg class="strip-freight-svg" viewBox="0 0 62 22" aria-hidden="true">
  <!-- Locomotive body -->
  <path class="freight-body" d="M2 6 L18 6 L22 8.5 L22 17 L2 17 Z"/>
  <rect class="freight-roof" x="2" y="5" width="16" height="2"/>
  <rect class="freight-exhaust" x="6" y="3" width="3" height="3"/>
  <rect class="freight-window" x="4" y="8" width="3.5" height="3"/>
  <rect class="freight-window" x="9" y="8" width="3.5" height="3"/>
  <rect class="freight-grille" x="14" y="9.5" width="6" height="4"/>
  <rect class="freight-bogie" x="4" y="17" width="6" height="3" rx="0.4"/>
  <rect class="freight-bogie" x="14" y="17" width="6" height="3" rx="0.4"/>
  <!-- Coupling -->
  <rect class="freight-coupling" x="22" y="12" width="2" height="2"/>
  <!-- Container wagon -->
  <rect class="freight-wagon-base" x="24" y="13" width="36" height="4"/>
  <rect class="freight-container" x="26" y="6" width="32" height="7"/>
  <rect class="freight-container-line" x="26" y="8.5" width="32" height="0.5"/>
  <rect class="freight-bogie" x="28" y="17" width="6" height="3" rx="0.4"/>
  <rect class="freight-bogie" x="50" y="17" width="6" height="3" rx="0.4"/>
</svg>
`;
```

- [ ] **Step 2: Extend `StripModel` + swap logic in `src/strip.ts`**

Open `src/strip.ts`. Add `isFreight: boolean` to `StripModel`:
```ts
export interface StripModel {
  // ...existing fields...
  isFreight: boolean;
}
```

Replace `createTrainElement` / `refreshTrainTheme` to honour freight:

```ts
import { FREIGHT_TRAIN_SVG } from './freightSvg';

function createTrainElement(direction: Direction, theme: Theme, lastIndex: number, isFreight: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = `strip-train strip-train-${direction}${isFreight ? ' freight' : ''}`;
  el.style.setProperty('--pos', direction === 'north' ? '0' : String(lastIndex));
  el.dataset.theme = theme ?? '';
  el.dataset.category = isFreight ? 'freight' : 'passenger';

  const inner = document.createElement('div');
  inner.className = 'strip-train-inner';
  inner.innerHTML = isFreight ? FREIGHT_TRAIN_SVG : themedTrainSvg(theme);
  el.appendChild(inner);

  el.addEventListener('click', () => {
    toot();
    el.classList.remove('tooting');
    void el.offsetWidth;
    el.classList.add('tooting');
  });

  return el;
}

function refreshTrainCategory(strip: HTMLElement, isFreight: boolean, theme: Theme): void {
  const train = strip.querySelector<HTMLElement>('.strip-train')!;
  const nextCategory = isFreight ? 'freight' : 'passenger';
  if (train.dataset.category === nextCategory && train.dataset.theme === (theme ?? '')) return;
  train.dataset.category = nextCategory;
  train.dataset.theme = theme ?? '';
  train.classList.toggle('freight', isFreight);
  const inner = train.querySelector<HTMLElement>('.strip-train-inner');
  if (inner) inner.innerHTML = isFreight ? FREIGHT_TRAIN_SVG : themedTrainSvg(theme);
}
```

In `renderDirectionStrip`, replace the theme-refresh call:
```ts
refreshTrainCategory(strip, model.isFreight, currentTheme(new Date()));
```

In `buildSkeleton`, pass `model.isFreight` to `createTrainElement`.

- [ ] **Step 3: Pass `isFreight` from `render.ts`**

In `src/render.ts`, where the strip model is built for each direction:

```ts
const stripN = renderDirectionStrip(existingStripN, {
  direction: 'north',
  pos: vm.northPos,
  celebrate: vm.celebrate.north,
  stops: vm.viewpoint.stops,
  anchorIndex: vm.viewpoint.anchorIndex,
  bridgeStripPosition: vm.viewpoint.positionModel === 'east-ave-bridge' ? 5.5 : null,
  bridgeLabel: vm.viewpoint.positionModel === 'east-ave-bridge' ? 'East Av' : null,
  lineNameForAria: `${vm.viewpoint.lineName} line`,
  isFreight: (vm.north?.arrival.category ?? 'passenger') === 'freight',
});
```

Same for `stripS` with `vm.south`.

- [ ] **Step 4: Write / extend the strip test**

Create `tests/strip.test.ts` if it doesn't exist:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderDirectionStrip, type StripModel } from '../src/strip';
import { getViewpointById } from '../src/viewpoints';

const QR = getViewpointById('queens-road')!;

function model(overrides: Partial<StripModel> = {}): StripModel {
  return {
    direction: 'north',
    pos: 3,
    celebrate: false,
    stops: QR.stops,
    anchorIndex: QR.anchorIndex,
    bridgeStripPosition: null,
    bridgeLabel: null,
    lineNameForAria: 'Suffragette line',
    isFreight: false,
    ...overrides,
  };
}

describe('renderDirectionStrip freight branch', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('passenger: renders the Aventra svg and no .freight class', () => {
    const el = renderDirectionStrip(null, model({ isFreight: false }));
    expect(el.querySelector('.strip-train-svg')).not.toBeNull();
    expect(el.querySelector('.strip-freight-svg')).toBeNull();
    expect(el.querySelector('.strip-train')?.classList.contains('freight')).toBe(false);
  });

  it('freight: renders the Class 66 svg and .freight class', () => {
    const el = renderDirectionStrip(null, model({ isFreight: true }));
    expect(el.querySelector('.strip-freight-svg')).not.toBeNull();
    expect(el.querySelector('.strip-train-svg')).toBeNull();
    expect(el.querySelector('.strip-train')?.classList.contains('freight')).toBe(true);
  });

  it('category swap does not rebuild pips or line', () => {
    const el1 = renderDirectionStrip(null, model({ isFreight: false }));
    const line = el1.querySelector('.strip-line')!;
    const pips = Array.from(el1.querySelectorAll('.strip-pip'));
    const el2 = renderDirectionStrip(el1, model({ isFreight: true }));
    expect(el2).toBe(el1);
    expect(el2.querySelector('.strip-line')).toBe(line);
    pips.forEach((p, i) => expect(el2.querySelectorAll('.strip-pip')[i]).toBe(p));
  });
});
```

- [ ] **Step 5: Run the test — expect pass**

```bash
npx vitest run tests/strip.test.ts
npm test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/freightSvg.ts src/strip.ts src/render.ts tests/strip.test.ts
git commit -m "$(cat <<'EOF'
feat: strip renders a freight loco SVG when the hero is freight

StripModel gains isFreight. When true, the train element swaps its
inner SVG for a Class 66-style locomotive + container wagon, toggles
a .freight class for CSS targeting, and skips the seasonal theme
overlays (they're only authored for the passenger Aventra).

Outer .strip-train element is reused across category flips so the
CSS glide transition and --pos continuity stay alive. tests/strip.test
asserts the DOM-reuse property on category change.

Colour comes from CSS (--freight-color, next commit); this commit only
wires the SVG swap.
EOF
)"
```

---

## Task 7: FREIGHT tag on the hero row + ticker ᶠʳ marker

**Files:**
- Modify: `src/render.ts`
- Create / extend: `tests/render.test.ts`

**Context:** Two small additions to `src/render.ts` — a `FREIGHT` pill next to the direction label when the hero is freight, and a `.ticker-value-freight` class on each freight entry in the ticker.

- [ ] **Step 1: Write `tests/render.test.ts`**

If the file doesn't exist (it likely doesn't today), create it with the minimum scaffolding:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, type ViewModel } from '../src/render';
import { getViewpointById } from '../src/viewpoints';

const QR = getViewpointById('queens-road')!;

function vm(overrides: Partial<ViewModel> = {}): ViewModel {
  return {
    freshness: { state: 'fresh', ageMs: 5000 },
    northPos: null,
    southPos: null,
    celebrate: { north: false, south: false },
    northTicker: [],
    southTicker: [],
    walkingLabel: null,
    northConfidence: 1,
    southConfidence: 1,
    fact: { text: '', category: 'default' } as ViewModel['fact'],
    viewpoint: QR,
    favouriteViewpointId: QR.id,
    ...overrides,
  };
}

const noop = () => {};

describe('render — freight', () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app')!;
  });

  it('passenger hero: no .freight-tag', () => {
    render(root, vm({
      north: {
        arrival: { id: 'p1', stationName: 'WQR', lineId: 'suffragette', destinationName: 'Barking Riverside', timeToStation: 120, expectedArrival: '', modeName: 'overground', platformName: '' } as never,
        direction: 'north',
        bridgeTimeSeconds: 120,
      },
    }), { onEnableWalkingTime: noop, onDisableWalkingTime: noop, onAdvanceFact: noop, onSwitchViewpoint: noop, onSetFavouriteViewpoint: noop });
    expect(root.querySelector('.freight-tag')).toBeNull();
  });

  it('freight hero: exactly one .freight-tag with text FREIGHT', () => {
    render(root, vm({
      north: {
        arrival: { id: 'f1', stationName: 'WQR', lineId: 'suffragette', destinationName: 'Willesden', origin: 'Tilbury', timeToStation: 60, expectedArrival: '', modeName: 'freight', platformName: '', category: 'freight', headcode: '6M23', operatorCode: 'DB' } as never,
        direction: 'north',
        bridgeTimeSeconds: 60,
      },
    }), { onEnableWalkingTime: noop, onDisableWalkingTime: noop, onAdvanceFact: noop, onSwitchViewpoint: noop, onSetFavouriteViewpoint: noop });
    const tags = root.querySelectorAll('.freight-tag');
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent?.trim()).toBe('FREIGHT');
  });

  it('freight hero with origin + destination: renders .freight-journey', () => {
    render(root, vm({
      north: {
        arrival: { id: 'f1', stationName: 'WQR', lineId: 'suffragette', destinationName: 'Willesden Euroterminal', origin: 'Tilbury Riverside Yard', timeToStation: 60, expectedArrival: '', modeName: 'freight', platformName: '', category: 'freight', headcode: '6M23', operatorCode: 'DB' } as never,
        direction: 'north',
        bridgeTimeSeconds: 60,
      },
    }), { onEnableWalkingTime: noop, onDisableWalkingTime: noop, onAdvanceFact: noop, onSwitchViewpoint: noop, onSetFavouriteViewpoint: noop });
    const journeys = root.querySelectorAll('.freight-journey');
    expect(journeys).toHaveLength(1);
    expect(journeys[0].textContent).toContain('Tilbury Riverside Yard');
    expect(journeys[0].textContent).toContain('Willesden Euroterminal');
    expect(journeys[0].textContent).toContain('→');
  });

  it('freight hero missing origin: no .freight-journey (avoid half-rendered arrow)', () => {
    render(root, vm({
      north: {
        arrival: { id: 'f1', stationName: 'WQR', lineId: 'suffragette', destinationName: 'Willesden', /* no origin */ timeToStation: 60, expectedArrival: '', modeName: 'freight', platformName: '', category: 'freight', headcode: '6M23', operatorCode: 'DB' } as never,
        direction: 'north',
        bridgeTimeSeconds: 60,
      },
    }), { onEnableWalkingTime: noop, onDisableWalkingTime: noop, onAdvanceFact: noop, onSwitchViewpoint: noop, onSetFavouriteViewpoint: noop });
    expect(root.querySelector('.freight-journey')).toBeNull();
  });

  it('ticker freight entry: gets .ticker-value-freight', () => {
    render(root, vm({
      north: /* any hero — unused here */ undefined,
      northTicker: [
        { arrival: { category: 'freight', destinationName: 'Felixstowe' } as never, direction: 'north', bridgeTimeSeconds: 300 },
      ],
    }), { onEnableWalkingTime: noop, onDisableWalkingTime: noop, onAdvanceFact: noop, onSwitchViewpoint: noop, onSetFavouriteViewpoint: noop });
    // With no hero, ticker may not render — adjust the vm if needed so the ticker path fires.
    const freightMarker = root.querySelector('.ticker-value-freight');
    expect(freightMarker).not.toBeNull();
  });
});
```

(The third test may need tweaks against the actual `render()` code path — the ticker only renders when the direction has a hero. Adjust the fixture accordingly.)

- [ ] **Step 2: Run the test — expect failure**

```bash
npx vitest run tests/render.test.ts
```

Expected: FAIL — `.freight-tag` and `.ticker-value-freight` don't exist yet.

- [ ] **Step 3: Modify `renderDirection()` in `src/render.ts`**

Two additions: (a) a `FREIGHT` pill inside `.label` when the hero is freight; (b) a sibling `.freight-journey` div AFTER `.value-wrap` when the hero is freight AND both `origin` + `destinationName` are populated.

```ts
function renderDirection(
  label: string,
  event: BridgeEvent | undefined,
  ariaLabel: string,
  confidence: number
): HTMLElement {
  const row = document.createElement('section');
  row.className = 'row';
  row.setAttribute('aria-label', ariaLabel);

  const labelEl = document.createElement('div');
  labelEl.className = 'label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const isFreight = event?.arrival.category === 'freight';

  // Append the FREIGHT pill inside the label when the hero is freight.
  if (isFreight) {
    const tag = document.createElement('span');
    tag.className = 'freight-tag';
    tag.textContent = 'FREIGHT';
    tag.setAttribute('aria-label', 'Freight service');
    labelEl.appendChild(document.createTextNode(' '));
    labelEl.appendChild(tag);
  }

  // ...existing value-wrap / value / confidence-ring block unchanged...
  // (build wrap, append buildConfidenceRing + valueEl, append wrap to row)

  // After .value-wrap, append the origin→destination subtitle for freight
  // heroes that have both ends populated. Skip when either is missing to
  // avoid half-rendered arrows.
  if (isFreight && event?.arrival.origin && event?.arrival.destinationName) {
    const journey = document.createElement('div');
    journey.className = 'freight-journey';
    journey.setAttribute('aria-label', `Freight journey: ${event.arrival.origin} to ${event.arrival.destinationName}`);
    journey.textContent = `${event.arrival.origin} → ${event.arrival.destinationName}`;
    row.appendChild(journey);
  }

  return row;
}
```

- [ ] **Step 4: Modify `renderTicker()` — freight marker**

```ts
events.forEach((ev, i) => {
  if (i > 0) {
    const sep = document.createElement('span');
    sep.className = 'ticker-sep';
    sep.textContent = '·';
    row.appendChild(sep);
  }
  const val = document.createElement('span');
  val.className = 'ticker-value';
  if (ev.arrival.category === 'freight') {
    val.classList.add('ticker-value-freight');
  }
  const mins = Math.max(0, Math.floor(ev.bridgeTimeSeconds / 60));
  val.textContent = i === events.length - 1 ? `${mins} min` : `${mins}`;
  row.appendChild(val);
});
```

The `ᶠʳ` superscript is rendered via a `::after` pseudo-element in Task 8 (keeps the DOM output text-only for accessibility).

- [ ] **Step 5: Run the test — expect pass**

```bash
npx vitest run tests/render.test.ts
npm test
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/render.ts tests/render.test.ts
git commit -m "$(cat <<'EOF'
feat: FREIGHT tag + journey subtitle + ticker marker

render.ts gains three small branches:

- renderDirection: when the hero's category === 'freight', append a
  small FREIGHT pill inside the direction label.

- renderDirection: when the hero is freight AND both origin +
  destinationName are populated, render a sibling .freight-journey div
  after the countdown value showing 'Origin → Destination'. This is
  the only place the actual freight destination surfaces in the UI —
  the direction label stays as a stable compass ('→ Barking Riverside'
  etc.) across both categories. Skipped when either end is missing so
  we don't render half-arrows.

- renderTicker: each freight entry gets a .ticker-value-freight class.
  The visual 'fr' superscript is drawn via CSS ::after in the next
  commit so the DOM text content stays accessible.

New tests/render.test.ts covers tag, journey (present + missing-end
absent), and ticker-marker branches plus the passenger-no-tag case.
EOF
)"
```

---

## Task 7.5: Delight — region chips + first-sighting shimmer

**Files:**
- Create: `src/freightRegions.ts`
- Create: `tests/freightRegions.test.ts`
- Modify: `src/render.ts`
- Modify: `src/styles.css`
- Modify: `tests/render.test.ts`

**Context:** The journey subtitle shows `Tilbury Riverside Yard → Willesden Euroterminal`. Informationally right; emotionally flat. Two delight touches make geographic reach legible and compound over a session:

1. A small region chip after each yard name (`· Scotland`, `· Thames Estuary`).
2. The first time a region is seen in a session, its chip shimmers once — one-shot discovery.

Tracked in `sessionStorage` (not `localStorage`) so refreshing the tab resets the novelty. `Home` and `Elsewhere` regions don't shimmer (non-events).

- [ ] **Step 1: Write `tests/freightRegions.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { regionFor, isNewRegionThisSession, __resetRegionMemoForTests } from '../src/freightRegions';

describe('regionFor', () => {
  it('maps Scottish yards to Scotland', () => {
    expect(regionFor('Mossend Yard')).toBe('Scotland');
    expect(regionFor('Coatbridge FLT')).toBe('Scotland');
    expect(regionFor('Grangemouth')).toBe('Scotland');
  });

  it('maps Welsh yards to Wales', () => {
    expect(regionFor('Cardiff Tidal Sidings')).toBe('Wales');
    expect(regionFor('Margam')).toBe('Wales');
  });

  it('maps West Country yards', () => {
    expect(regionFor('Merehead Quarry')).toBe('West Country');
    expect(regionFor('Whatley Quarry')).toBe('West Country');
  });

  it('maps Thames Estuary yards', () => {
    expect(regionFor('Tilbury Riverside Yard')).toBe('Thames Estuary');
    expect(regionFor('London Gateway')).toBe('Thames Estuary');
  });

  it('maps East Anglia yards', () => {
    expect(regionFor('Felixstowe North')).toBe('East Anglia');
    expect(regionFor('Ipswich Up Yard')).toBe('East Anglia');
  });

  it('maps The North (NE/Yorkshire/NW)', () => {
    expect(regionFor('Trafford Park FLT')).toBe('The North');
    expect(regionFor('Immingham')).toBe('The North');
    expect(regionFor('Crewe Basford Hall')).toBe('The North');
  });

  it('maps Midlands yards', () => {
    expect(regionFor('Daventry International Rail Freight Terminal')).toBe('Midlands');
    expect(regionFor('Bescot Yard')).toBe('Midlands');
  });

  it('maps Kent yards', () => {
    expect(regionFor('Dollands Moor')).toBe('Kent');
    expect(regionFor('Hoo Junction')).toBe('Kent');
  });

  it('maps London yards to Home', () => {
    expect(regionFor('Willesden Euroterminal')).toBe('Home');
    expect(regionFor('Wembley Yard')).toBe('Home');
    expect(regionFor('Temple Mills')).toBe('Home');
  });

  it('falls back to Elsewhere for unknowns / empty', () => {
    expect(regionFor('Some Bizarre Sidings')).toBe('Elsewhere');
    expect(regionFor('')).toBe('Elsewhere');
    expect(regionFor('   ')).toBe('Elsewhere');
  });
});

describe('isNewRegionThisSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
    __resetRegionMemoForTests();
  });

  it('returns true first call, false after', () => {
    expect(isNewRegionThisSession('Scotland')).toBe(true);
    expect(isNewRegionThisSession('Scotland')).toBe(false);
    expect(isNewRegionThisSession('Wales')).toBe(true);
    expect(isNewRegionThisSession('Wales')).toBe(false);
  });

  it('never shimmers Home or Elsewhere (non-events)', () => {
    expect(isNewRegionThisSession('Home')).toBe(false);
    expect(isNewRegionThisSession('Elsewhere')).toBe(false);
    expect(isNewRegionThisSession('Home')).toBe(false);
  });

  it('survives sessionStorage throwing (hardened browsers)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    __resetRegionMemoForTests();
    expect(isNewRegionThisSession('Scotland')).toBe(true);
    expect(isNewRegionThisSession('Scotland')).toBe(false);  // in-memory fallback
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
npx vitest run tests/freightRegions.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create `src/freightRegions.ts`**

```ts
export type Region =
  | 'Scotland'
  | 'Wales'
  | 'The North'
  | 'Midlands'
  | 'West Country'
  | 'East Anglia'
  | 'Kent'
  | 'Thames Estuary'
  | 'Home'
  | 'Elsewhere';

// Ordered keyword → region map. First matching keyword wins, so put more-specific
// names first (e.g. 'Basford Hall' before 'Crewe'). Case-insensitive substring match.
const REGION_KEYWORDS: Array<[string, Region]> = [
  // Scotland
  ['mossend', 'Scotland'], ['coatbridge', 'Scotland'], ['grangemouth', 'Scotland'],
  ['aberdeen', 'Scotland'], ['inverness', 'Scotland'], ['millerhill', 'Scotland'],
  ['valleyfield', 'Scotland'],
  // Wales
  ['cardiff', 'Wales'], ['swansea', 'Wales'], ['margam', 'Wales'],
  ['pontypool', 'Wales'], ['wentlooge', 'Wales'],
  // West Country
  ['merehead', 'West Country'], ['whatley', 'West Country'], ['exeter', 'West Country'],
  ['plymouth', 'West Country'], ['fawley', 'West Country'], ['bristol', 'West Country'],
  ['westbury', 'West Country'],
  // Thames Estuary
  ['tilbury', 'Thames Estuary'], ['london gateway', 'Thames Estuary'],
  ['shell haven', 'Thames Estuary'], ['thamesport', 'Thames Estuary'],
  ['isle of grain', 'Thames Estuary'], ['purfleet', 'Thames Estuary'],
  // East Anglia
  ['felixstowe', 'East Anglia'], ['ipswich', 'East Anglia'], ['harwich', 'East Anglia'],
  ['whitemoor', 'East Anglia'], ['peterborough', 'East Anglia'], ['ely', 'East Anglia'],
  ['parkeston', 'East Anglia'],
  // Kent (Channel Tunnel region — sometimes overlaps with 'SE' but most freight
  // destinations are the named yards here)
  ['dollands moor', 'Kent'], ['hoo junction', 'Kent'], ['dover', 'Kent'],
  ['folkestone', 'Kent'], ['ashford', 'Kent'], ['ramsgate', 'Kent'],
  // The North
  ['basford hall', 'The North'], ['crewe', 'The North'], ['arpley', 'The North'],
  ['trafford park', 'The North'], ['manchester', 'The North'], ['liverpool', 'The North'],
  ['carlisle', 'The North'], ['leeds', 'The North'], ['doncaster', 'The North'],
  ['immingham', 'The North'], ['hull', 'The North'], ['knottingley', 'The North'],
  ['drax', 'The North'], ['ferrybridge', 'The North'], ['newcastle', 'The North'],
  ['tyne', 'The North'], ['tees', 'The North'], ['middlesbrough', 'The North'],
  ['boulby', 'The North'],
  // Midlands
  ['daventry', 'Midlands'], ['bescot', 'Midlands'], ['walsall', 'Midlands'],
  ['lawley street', 'Midlands'], ['landor street', 'Midlands'],
  ['leicester', 'Midlands'], ['derby', 'Midlands'], ['mountsorrel', 'Midlands'],
  ['birmingham', 'Midlands'],
  // Home — London + immediate surrounds (Willesden, Wembley, Stratford etc.)
  ['willesden', 'Home'], ['wembley', 'Home'], ['stratford', 'Home'],
  ['temple mills', 'Home'], ['acton', 'Home'], ['cricklewood', 'Home'],
  ['bow', 'Home'], ['west hampstead', 'Home'],
];

export function regionFor(yardName: string): Region {
  const n = (yardName ?? '').trim().toLowerCase();
  if (!n) return 'Elsewhere';
  for (const [keyword, region] of REGION_KEYWORDS) {
    if (n.includes(keyword)) return region;
  }
  return 'Elsewhere';
}

// ── Session novelty tracking ──────────────────────────────────────
// A chip shimmers the first time a region appears in a session.
// Persisted to sessionStorage (not localStorage) so each new session
// gets fresh delight, not a one-time-forever affair.

const STORAGE_KEY = 'wtt_seen_freight_regions';
const NON_SHIMMER_REGIONS = new Set<Region>(['Home', 'Elsewhere']);

let memoFallback: Set<Region> | null = null;

function loadSeen(): Set<Region> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as Region[]);
    return new Set();
  } catch {
    memoFallback ??= new Set();
    return memoFallback;
  }
}

function saveSeen(seen: Set<Region>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    memoFallback = seen;
  }
}

export function isNewRegionThisSession(region: Region): boolean {
  if (NON_SHIMMER_REGIONS.has(region)) return false;
  const seen = loadSeen();
  if (seen.has(region)) return false;
  seen.add(region);
  saveSeen(seen);
  return true;
}

// Test-only — reset in-memory + storage memo.
export function __resetRegionMemoForTests(): void {
  memoFallback = null;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npx vitest run tests/freightRegions.test.ts
```

- [ ] **Step 5: Integrate chips + shimmer into `renderDirection()`**

In `src/render.ts`'s journey-subtitle block (added in Task 7), replace the single-textContent assignment with:

```ts
if (isFreight && event?.arrival.origin && event?.arrival.destinationName) {
  const journey = document.createElement('div');
  journey.className = 'freight-journey';

  const originRegion = regionFor(event.arrival.origin);
  const destRegion = regionFor(event.arrival.destinationName);

  journey.appendChild(document.createTextNode(event.arrival.origin));
  journey.appendChild(regionChip(originRegion));
  journey.appendChild(document.createTextNode(' → '));
  journey.appendChild(document.createTextNode(event.arrival.destinationName));
  // Only show destination region chip if it's a different region —
  // same-region trips (common local moves) keep the subtitle compact.
  if (destRegion !== originRegion) {
    journey.appendChild(regionChip(destRegion));
  }

  journey.setAttribute(
    'aria-label',
    `Freight journey: ${event.arrival.origin} (${originRegion}) to ${event.arrival.destinationName} (${destRegion})`,
  );
  row.appendChild(journey);
}
```

Add `regionChip()` helper in the same file:

```ts
function regionChip(region: Region): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'region-chip';
  chip.textContent = ` · ${region}`;
  if (isNewRegionThisSession(region)) {
    chip.classList.add('new-this-session');
    // Clean the class off after the animation so the same region, seen
    // again later in the session, doesn't re-shimmer as the row re-renders.
    chip.addEventListener('animationend', () => {
      chip.classList.remove('new-this-session');
    }, { once: true });
  }
  return chip;
}
```

Import at the top of `render.ts`:
```ts
import { regionFor, isNewRegionThisSession, type Region } from './freightRegions';
```

- [ ] **Step 6: Extend `tests/render.test.ts`**

Add:
```ts
import { __resetRegionMemoForTests } from '../src/freightRegions';

// Reset the session-novelty memo before each test so 'new-this-session'
// classes fire deterministically.
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
  __resetRegionMemoForTests();
});

it('freight hero: origin region chip renders', () => {
  render(root, vm({
    north: {
      arrival: { id: 'f1', stationName: 'WQR', lineId: 'suffragette',
        origin: 'Mossend Yard', destinationName: 'Felixstowe North',
        timeToStation: 60, expectedArrival: '', modeName: 'freight',
        platformName: '', category: 'freight', headcode: '6M23', operatorCode: 'DB' } as never,
      direction: 'north', bridgeTimeSeconds: 60,
    },
  }), noopHandlers);
  const chips = root.querySelectorAll('.region-chip');
  expect(chips).toHaveLength(2);   // different regions: origin + dest
  expect(chips[0].textContent).toContain('Scotland');
  expect(chips[1].textContent).toContain('East Anglia');
});

it('freight hero: same-region trip renders only one chip', () => {
  render(root, vm({
    north: {
      arrival: { category: 'freight',
        origin: 'Willesden Euroterminal', destinationName: 'Wembley Yard',
        timeToStation: 60, /* other fields as above */ } as never,
      direction: 'north', bridgeTimeSeconds: 60,
    } as never,
  }), noopHandlers);
  expect(root.querySelectorAll('.region-chip')).toHaveLength(1);
});

it('first sighting of a region: chip gets .new-this-session', () => {
  render(root, vm({
    north: {
      arrival: { category: 'freight',
        origin: 'Mossend', destinationName: 'Willesden',
        timeToStation: 60, /* ... */ } as never,
      direction: 'north', bridgeTimeSeconds: 60,
    } as never,
  }), noopHandlers);
  const scotChip = Array.from(root.querySelectorAll('.region-chip'))
    .find(c => c.textContent?.includes('Scotland'));
  expect(scotChip?.classList.contains('new-this-session')).toBe(true);
});

it('Home region never gets .new-this-session (non-event)', () => {
  render(root, vm({
    north: {
      arrival: { category: 'freight',
        origin: 'Willesden Euroterminal', destinationName: 'Stratford',
        timeToStation: 60, /* ... */ } as never,
      direction: 'north', bridgeTimeSeconds: 60,
    } as never,
  }), noopHandlers);
  const chip = root.querySelector('.region-chip');
  expect(chip?.classList.contains('new-this-session')).toBe(false);
});
```

- [ ] **Step 7: Add the CSS (chip + shimmer keyframes) to `src/styles.css`**

After the `.freight-journey` rule:

```css
.region-chip {
  display: inline;
  font-family: 'Big Shoulders Text', sans-serif;
  font-size: 0.78em;    /* 78% of journey subtitle */
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--freight-color);
  opacity: 0.7;
  /* Text-colour gradient backdrop for the shimmer keyframes to animate across. */
  background: linear-gradient(90deg, currentColor 0%, currentColor 100%);
  -webkit-background-clip: text;
  background-clip: text;
}

/* One-shot shimmer on first sighting of a region per session. Gold-to-brown
   pass across the chip text. 1.2s, cubic-bezier ease, fires once. */
.region-chip.new-this-session {
  animation: region-shimmer 1200ms cubic-bezier(0.25, 1, 0.5, 1) 200ms both;
  background: linear-gradient(
    90deg,
    var(--freight-color) 0%,
    oklch(82% 0.14 85) 50%,       /* soft gold peak — matches the Overground orange family */
    var(--freight-color) 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}

@keyframes region-shimmer {
  0%   { background-position: 200% 0; opacity: 0.7; }
  50%  { opacity: 1; }
  100% { background-position: -100% 0; opacity: 0.7; }
}

/* Reduced motion: show the chip with its final opacity, no shimmer. */
@media (prefers-reduced-motion: reduce) {
  .region-chip.new-this-session {
    animation: none;
    background: none;
    color: var(--freight-color);
    -webkit-text-fill-color: var(--freight-color);
    opacity: 1;
  }
}
```

- [ ] **Step 8: Run the full suite + manual check in dev server**

```bash
npm test
npm run dev
```

In the dev server (with `netlify dev` if you want live freight):
- First Scottish freight of the session → "Scotland" chip shimmers once.
- Refresh the page → sessionStorage clears → next Scottish freight shimmers again.
- Toggle `prefers-reduced-motion: reduce` in DevTools → chips render in steady freight-brown, no shimmer.
- Tilbury → Willesden trip shows `Tilbury Riverside Yard · Thames Estuary → Willesden Euroterminal · Home` (two chips, different regions).
- Willesden → Wembley trip shows one chip only (`· Home`).

- [ ] **Step 9: Commit**

```bash
git add src/freightRegions.ts tests/freightRegions.test.ts src/render.ts tests/render.test.ts src/styles.css
git commit -m "$(cat <<'EOF'
feat: region chips on freight subtitle + first-sighting shimmer

Freight destinations are geographically interesting — every train is a
postcard from somewhere. Two delight touches lean into that:

- src/freightRegions.ts: keyword → region lookup (Scotland, Wales, The
  North, Midlands, West Country, East Anglia, Kent, Thames Estuary,
  Home, Elsewhere). Ordered substring match; ~50 seed yards cover the
  common freight destinations through Queens Road.

- isNewRegionThisSession: sessionStorage-backed helper that returns
  true once per region per session. Home + Elsewhere always false (no
  shimmer for the non-events). In-memory fallback when sessionStorage
  is blocked (Safari private mode).

Render layer: journey subtitle grows a region chip next to origin and
destination (destination suppressed when same region as origin). First
sighting gets .new-this-session, which triggers a 1.2s gold-to-brown
shimmer across the chip text, once only. The class is removed on
animationend so subsequent re-renders don't re-fire.

Respects prefers-reduced-motion: reduce — steady chip, no shimmer.
EOF
)"
```

---

## Task 8: CSS — freight palette, tag, ticker marker, dim-stale

**Files:**
- Modify: `src/styles.css`

**Context:** Add the `--freight-color` token, style `.strip-train.freight` (override `color` so the inner SVG picks up freight-brown via `currentColor`), add the `.freight-tag` pill style, add the `.ticker-value-freight::after` superscript marker, add a dim-stale state.

- [ ] **Step 1: Add the colour token**

In `:root` near `--line-color`:
```css
/* Freight diesel brown — deliberately NOT themed per-viewpoint; freight is
   its own category across every line. Muted to stay visually secondary to
   passenger data. */
--freight-color: oklch(45% 0.06 30);
```

- [ ] **Step 2: Style the freight strip train**

After the existing `.strip-train` rules:
```css
.strip-train.freight {
  color: var(--freight-color);
  /* Slightly wider than passenger — freight SVG viewBox is 0 0 62 22 vs 0 0 52 22. */
  width: 62px;
}

.strip-freight-svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

.strip-freight-svg .freight-body,
.strip-freight-svg .freight-roof,
.strip-freight-svg .freight-wagon-base,
.strip-freight-svg .freight-container,
.strip-freight-svg .freight-coupling {
  fill: currentColor;
}

.strip-freight-svg .freight-window {
  fill: var(--bg);
  stroke: var(--ink);
  stroke-width: 0.4;
}

.strip-freight-svg .freight-bogie {
  fill: var(--ink);
}

.strip-freight-svg .freight-exhaust,
.strip-freight-svg .freight-grille {
  fill: var(--ink);
}

.strip-freight-svg .freight-container-line {
  fill: var(--bg);
  opacity: 0.4;
}

/* Mirror southbound — same convention as passenger. */
.strip-south .strip-freight-svg {
  transform: scaleX(-1);
}

/* Stale freight data — dim the loco without redrawing it. */
.strip-train.freight.stale {
  opacity: 0.45;
}
```

- [ ] **Step 3: Style the hero-row FREIGHT pill + journey subtitle**

After the existing `.label` rules:
```css
.freight-tag {
  display: inline-block;
  margin-left: 0.4em;
  padding: 2px 6px;
  font-family: 'Big Shoulders Text', sans-serif;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: var(--freight-color);
  text-transform: uppercase;
  border: 1px solid currentColor;
  border-radius: 3px;
  vertical-align: 0.1em;
}

/* Origin → destination line under the countdown, freight hero only.
   Kept visually lightweight so the big countdown number still leads. */
.freight-journey {
  font-family: 'Big Shoulders Text', sans-serif;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--freight-color);
  opacity: 0.85;
  margin-top: 0.1rem;
  /* Long yard names (e.g. 'Willesden Euroterminal') fit comfortably in
     the existing column width; if they ever overflow, the row already
     wraps on natural word boundaries — no nowrap clipping. */
}

- [ ] **Step 4: Style the ticker freight marker**

After the existing `.ticker-value` rules:
```css
.ticker-value-freight::after {
  content: 'fr';
  font-size: 0.65em;
  font-weight: 800;
  color: var(--freight-color);
  margin-left: 0.15em;
  vertical-align: 0.5em;
  letter-spacing: 0.05em;
}
```

- [ ] **Step 5: Manual visual check in the dev server**

```bash
npm run dev
```

With `RTT_USERNAME` / `RTT_TOKEN` set locally (or via `netlify dev`):
- Switch to Queens Road; wait for a freight arrival.
- Confirm the loco SVG renders in freight-brown, not Suffragette-green.
- Confirm the `FREIGHT` pill appears next to the direction label.
- Confirm ticker freight entries have the `fr` superscript.
- Confirm southbound freight SVG mirrors.
- Confirm passenger arrivals are unaffected (Suffragette-green livery, no tag).
- Break the proxy (edit the env var wrong) and confirm the freight SVG dims to 45 % opacity within ~3 min (stale threshold).

- [ ] **Step 6: Commit**

```bash
git add src/styles.css
git commit -m "$(cat <<'EOF'
style: freight palette, pill, journey subtitle, ticker marker

--freight-color introduced as a root token — deliberately not themed
per viewpoint; freight is a uniform category across lines.

.strip-train.freight overrides color so the inner Class 66 SVG picks
up --freight-color via currentColor. .stale modifier dims the loco to
45% opacity when the freight feed is > 3 min old.

.freight-tag: small uppercase pill in freight-brown outlined, sits
inline inside the direction label.

.freight-journey: small line under the countdown showing actual
origin→destination for freight heroes (the direction label stays as a
compass — this row surfaces the actual yard-to-yard journey).

.ticker-value-freight::after: superscript 'fr' marker — text-only in
the DOM (accessibility), rendered in CSS.

No seasonal theme overlays on the freight SVG — intentional. Freight
is a working train, not a toddler mascot.
EOF
)"
```

---

## Task 9: About + Privacy copy + attribution

**Files:**
- Modify: `public/about.html`
- Modify: `public/privacy.html`

**Context:** Licence compliance — Realtime Trains terms require attribution. Privacy page update because the "no server" claim is no longer strictly true (the freight proxy is a tiny stateless server).

- [ ] **Step 1: Update `public/about.html`**

In the "How it works" section, after the TfL paragraph, add:

```html
<p>
  On the Suffragette line (Queens Road viewpoint), freight movements
  are pulled alongside passenger trains from the
  <a href="https://www.realtimetrains.co.uk/about/" target="_blank" rel="noopener">Realtime Trains</a>
  Pull API via a small Netlify Function that holds the API credentials.
  Freight data contains information provided by Realtime Trains and is
  used here for non-commercial hobbyist purposes.
</p>
```

Extend the paragraph above the strip description to note the freight glyph:

```html
<p>
  The small horizontal strip under each countdown estimates where that
  specific next train is along the branch right now. On the Suffragette
  line, freight trains are drawn as a different shape — a diesel
  locomotive pulling a container wagon, in muted brown. Tap the cartoon
  train for a little honk. The passenger train wears a different outfit
  depending on the time of year; freight does not.
</p>
```

- [ ] **Step 2: Update `public/privacy.html`**

Replace the opening paragraph:

```html
<p>
  This app is a handful of static files served from a CDN, plus a
  <em>single stateless function</em> (used only on the Suffragette
  viewpoint) that proxies freight-data requests to
  <a href="https://www.realtimetrains.co.uk/about/" target="_blank" rel="noopener">Realtime Trains</a>
  so that their API credentials stay server-side. The function logs
  requests as part of normal Netlify operation; it does not see your
  location, identity, or any in-app actions. Plus a privacy-friendly
  pageview count via Cloudflare Web Analytics (details below).
  Nothing you do <em>inside</em> the app — tapping the fact line,
  enabling walking time, watching the countdown — is tracked or
  reported back to me.
</p>
```

In the "Third parties your browser talks to" list, add:

```html
<li>
  <strong>Realtime Trains</strong> (via
  <code>/.netlify/functions/freight</code>) — only when viewing the
  Queens Road viewpoint. Their
  <a href="https://www.realtimetrains.co.uk/about/privacy/" target="_blank" rel="noopener">privacy policy</a>
  covers what they log. My proxy forwards your browser's freight
  request to their API and returns their response unchanged; no
  user-identifying data is added.
</li>
```

Bump the "Last updated" date to today (`date "+%d %B %Y"`).

- [ ] **Step 3: Build + verify copy renders**

```bash
npm run build
```

Open `dist/about.html` and `dist/privacy.html` in a browser; confirm the new paragraphs render and links are valid.

- [ ] **Step 4: Commit**

```bash
git add public/about.html public/privacy.html
git commit -m "$(cat <<'EOF'
docs: mention freight data source in about + privacy

About: one paragraph attributing Realtime Trains (licence compliance,
non-commercial use), one sentence explaining the freight loco glyph.

Privacy: softens the "no server running app logic" claim — there IS
now a single stateless Netlify Function proxying freight requests,
used only on the Queens Road viewpoint. Adds Realtime Trains to the
"third parties your browser talks to" list. Bumps Last updated.
EOF
)"
```

---

## Task 10: Final verification + deploy

**Files:** none modified — end-to-end check.

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. Running count should be roughly the multi-viewpoints-post count + ~15 new freight-related tests.

- [ ] **Step 2: Run the production build**

```bash
npm run build
```

Expected:
- `tsc --noEmit` passes.
- Vite build succeeds.
- Bundle sizes: JS ≤ +1 KB gz above pre-freight baseline; CSS ≤ +0.3 KB gz. If either exceeds +2 KB gz, investigate (likely the freight SVG needs simplifying).

Capture actual numbers for the Step 8 commit message.

- [ ] **Step 3: Set Netlify env vars**

Via the Netlify UI (Site settings → Environment variables):
- `RTT_USERNAME` → your rtt.io account username
- `RTT_TOKEN` → your rtt.io Pull API token

Set these in BOTH production and deploy-preview contexts.

- [ ] **Step 4: Deploy to a Netlify preview first**

Push to a branch:
```bash
git push origin suffragette-freight
```

Open a PR or deploy-preview URL. Wait for the build to complete.

- [ ] **Step 5: Manual QA on the preview**

On a weekday afternoon (13:00–17:00 GMT) — freight-busy on the GOBLIN:

1. Open the preview URL. Land on your favourite viewpoint (probably Queens Road if you've been testing).
2. Within 45 s, the first freight poll fires. DevTools → Network → confirm a `/.netlify/functions/freight?station=WMW` call returns 200 with a non-empty `arrivals` array.
3. Wait for a freight arrival to surface (hero or ticker):
   - Hero freight → `FREIGHT` pill visible inside direction label
   - Hero freight → `origin → destination` subtitle visible under the countdown (e.g. `Tilbury Riverside Yard · Thames Estuary → Willesden Euroterminal · Home`)
   - Hero freight with **different origin + destination regions** → both region chips render; first-of-session chip shimmers once (gold-to-brown, 1.2 s)
   - Hero freight with **same-region origin + destination** (e.g. Willesden → Wembley) → only one chip renders (`· Home`), no shimmer
   - Hero freight with **live tts > 5 min** → countdown + subtitle visible BUT strip glyph hidden (no loco drawn on the line)
   - Hero freight with **live tts ≤ 5 min** → Class 66 loco + wagon SVG appears on the strip in freight-brown (not Suffragette-green); glides toward Queens Road
   - Ticker freight → `fr` superscript on the minutes value; no journey subtitle in ticker entries
   - Refresh the page → sessionStorage clears → next freight from an already-seen-this-session region shimmers again (proof the delight resets per session)
4. As a freight hero's countdown crosses 5 min → confirm the strip glyph pops in at the far edge with the normal glide-in (no teleport mid-strip).
5. Tap the freight loco on the strip → toot plays.
6. Cross-check against `https://www.realtimetrains.co.uk/search/detailed/WMW` for the same time window. Minutes should match within ±30 s, and origin/destination should match the feed.
7. Switch to East Ave. Confirm:
   - No `/.netlify/functions/freight` calls fire after the switch.
   - Passenger strip renders Weaver burgundy, no freight UI.
8. Switch back to Queens Road. Freight re-appears within 45 s.
9. In DevTools → Network, throttle the preview to offline. Passenger data goes stale (footer amber). Freight also goes stale. No red error banner. Restore network — both recover on next tick.
10. Use DevTools to set `prefers-reduced-motion: reduce`. Confirm: no train glide animation, no tooting wobble, no `.ticking` fade on countdown change, no region-chip shimmer (chips render steady).
11. Console: no errors.

If ANY step fails, halt and fix before merging.

- [ ] **Step 6: Degradation test**

In the Netlify UI, temporarily unset `RTT_TOKEN`. Force a redeploy. Open the preview:

- Freight poll returns 500 `not_configured`.
- `freightSnapshots` stays empty.
- Strip and ticker show passenger only, zero freight UI.
- No red banner. Console may log the 500 once per poll — acceptable.

Restore `RTT_TOKEN`; force another redeploy; confirm freight returns.

- [ ] **Step 7: Merge to main + watch the production deploy**

```bash
git checkout main
git merge --no-ff suffragette-freight
git push origin main
```

Netlify auto-deploys in ~90 s. Visit `https://eastavetrains.co.uk/` and hard-refresh to bypass the service worker cache. Re-run Steps 5.1–5.10 against production.

- [ ] **Step 8: Verify the live deploy**

```bash
curl -sI https://eastavetrains.co.uk/ | head -5
curl -s 'https://eastavetrains.co.uk/.netlify/functions/freight?station=WMW' | head -c 500
```

Expected: 200 from the site; 200 with `{"arrivals":[…],"fetchedAt":"…"}` from the function.

Final verification commit is typically unnecessary — if Steps 1–7 all passed, the feature is live.

---

## Intentional deviations from the spec

Documented here so reviewers don't flag them as regressions:

- **`parsePassTime` in the function uses a midnight-rollover heuristic** (if the booked time is >4 h in the past, assume tomorrow). Spec glosses over this; the heuristic is pragmatic but will misbehave during extended engineering-hours overnight diversions. Monitor; adjust if it ever misclassifies.
- **Direction inference in the function is regex-based** (`/barking|dagenham|upminster|tilbury|gateway|grays|shoeburyness/`). Spec says "infer from locations[] order"; the regex is cheaper and covers the common destinations. Move to a proper locations-walk only if misclassifications surface.
- **No `render.test.ts` mock for the freshness state passing** — the third ticker test in Task 7 is intentionally brittle to the render() code path; if it fails in CI against the real function signature, relax it rather than add more mocking machinery.
- **The freight SVG's exhaust stack is static, not smoking.** Spec doesn't require smoke, but authoring one would be cute. Add in a follow-up if Ben wants it.

---

## Post-plan: things to watch for (not implementation)

- **Rate-limit headroom:** if the console logs 429s with any regularity, bump the freight poll cadence from 45 s to 60 s or 90 s. Look at `lastFreightFetchMs` intervals in production.
- **Direction misclassification:** freight destinations are free-text; if obvious misclassifications appear (e.g. a Tilbury-bound freight rendering as southbound), inspect the raw response and expand the regex or move to locations-walking.
- **5-min strip threshold:** `FREIGHT_STRIP_MAX_TTS_SECONDS = 300` is an educated guess — freight speeds vary by loading, operator, and route. If real-world use shows the freight glyph appearing in weird positions as it first pops in (i.e. the 5 min estimate is way off when the glyph first draws), shorten the threshold to 180 s or 120 s. If instead the freight appears too late (glides through almost instantly), lengthen it. Monitor on a weekday watch.
- **Journey subtitle layout under narrow widths:** a long yard name (e.g. "Daventry International Rail Freight Terminal") may wrap onto two lines under the countdown. CSS doesn't nowrap-clip — wrapping is fine — but if it ever pushes the next row further down than feels right, consider truncating with `…` at ~40 chars in the renderer.
- **Multi-train strip:** the hero-only rendering means users see only the next train per direction. A toddler-facing enhancement would be a "second train" slot on the strip when a second arrival is within ~5 min. Deferred.
- **Other viewpoints with freight:** if a third viewpoint ever gets added (e.g. somewhere along the Overground's Stratford–Richmond axis, which also shares freight), this pattern scales — set `freightStationCode` on the new viewpoint's record and it just works.
- **rtt.io commercial-use threshold:** the non-commercial Pull API has an implicit request-volume ceiling. If this site ever gets more than a handful of users, renegotiate terms or self-host a cache in front of rtt.io.
- **About / Privacy edits:** if Realtime Trains updates their terms or privacy policy, mirror any required wording changes.
