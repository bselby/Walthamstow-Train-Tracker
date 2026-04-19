# Polish Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three polish features on top of the live PWA — a confidence ring that appears only when the countdown's trustworthiness drops, a rotating line of verified Weaver-line trivia, and an arrow-pulse that directs attention in the last 15s before a train arrives.

**Architecture:** Two pure modules (`confidence`, `facts`) with full unit coverage. `main.ts` keeps a rolling buffer of the last 3 prediction samples per direction + a persisted fact index. `render.ts` renders an SVG ring overlay on the countdown (invisible when confidence ≥ 0.7), a muted one-line fact below the footer, and toggles a `.row-imminent` class that CSS uses to pulse the direction-label arrow.

**Tech Stack:** Vite + TypeScript (strict), Vitest, hand-written SVG + CSS. No new runtime deps.

**Spec:** [docs/superpowers/specs/2026-04-19-polish-round-design.md](../specs/2026-04-19-polish-round-design.md)

---

## File structure

### New files
```
src/
├── confidence.ts      # pure: computeFreshness, computeStability, computeConfidence
├── facts.ts           # 23 verified facts + factAt(index)

tests/
├── confidence.test.ts
├── facts.test.ts
```

### Modified files
```
src/
├── main.ts            # prediction-sample buffer, fact index, VM populates new fields
├── render.ts          # confidence ring wrapper, fact line, .row-imminent class
├── styles.css         # ring, fact-line, arrow pulse
```

Combined bundle impact: ~1.3 KB gzipped. Within budget.

---

## Task 1: Confidence pure functions

**Files:**
- Create: `src/confidence.ts`
- Create: `tests/confidence.test.ts`

- [ ] **Step 1: Write failing tests**

Write `tests/confidence.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  computeFreshness,
  computeStability,
  computeConfidence,
  type PredictionSample,
} from '../src/confidence';

const sample = (vehicleId: string, tts: number, fetchedAtMs: number): PredictionSample => ({
  vehicleId,
  timeToStation: tts,
  fetchedAtMs,
});

describe('computeFreshness', () => {
  it('returns 1.0 when freshly fetched (<= 30 s old)', () => {
    expect(computeFreshness(0)).toBe(1.0);
    expect(computeFreshness(30_000)).toBe(1.0);
  });

  it('decays linearly between 30 s and 90 s', () => {
    // 60 s is the midpoint → (1.0 + 0.3) / 2 = 0.65
    expect(computeFreshness(60_000)).toBeCloseTo(0.65, 2);
  });

  it('bottoms at 0.3 beyond 90 s', () => {
    expect(computeFreshness(90_000)).toBe(0.3);
    expect(computeFreshness(300_000)).toBe(0.3);
  });
});

describe('computeStability', () => {
  it('cold-starts at 1.0 when fewer than 3 samples are available', () => {
    expect(computeStability([])).toBe(1.0);
    expect(computeStability([sample('v1', 120, 1_000)])).toBe(1.0);
    expect(computeStability([
      sample('v1', 120, 1_000),
      sample('v1', 100, 21_000),
    ])).toBe(1.0);
  });

  it('returns 1.0 for a perfectly stable sequence (tts drops match elapsed time)', () => {
    const samples = [
      sample('v1', 120, 1_000),
      sample('v1', 100, 21_000), // drift 0
      sample('v1', 80, 41_000),  // drift 0
    ];
    expect(computeStability(samples)).toBe(1.0);
  });

  it('linearly interpolates at mid-range drift', () => {
    // Each poll drops tts by 30 s although polls are 20 s apart → drift = 10 each
    const samples = [
      sample('v1', 120, 1_000),
      sample('v1', 90, 21_000),
      sample('v1', 60, 41_000),
    ];
    // avg drift = 10, midpoint between 5 (= 1.0) and 15 (= 0.5) → 0.75
    expect(computeStability(samples)).toBeCloseTo(0.75, 2);
  });

  it('bottoms at 0.5 for heavily jittery predictions', () => {
    const samples = [
      sample('v1', 120, 1_000),
      sample('v1', 220, 21_000), // tts went UP by 100, drift = 120
      sample('v1', 200, 41_000), // drift = 0
    ];
    // avg drift = 60 → well past the 15 s upper threshold → 0.5
    expect(computeStability(samples)).toBe(0.5);
  });
});

describe('computeConfidence', () => {
  it('multiplies freshness by stability', () => {
    const stable = [
      sample('v1', 120, 1_000),
      sample('v1', 100, 21_000),
      sample('v1', 80, 41_000),
    ];
    // freshness at 60 s = 0.65, stability = 1.0 → 0.65
    expect(computeConfidence(60_000, stable)).toBeCloseTo(0.65, 2);
  });

  it('is bounded at minimum 0.15 (freshness floor 0.3 × stability floor 0.5)', () => {
    const jittery = [
      sample('v1', 120, 1_000),
      sample('v1', 220, 21_000),
      sample('v1', 300, 41_000),
    ];
    expect(computeConfidence(300_000, jittery)).toBeCloseTo(0.15, 2);
  });

  it('is bounded at maximum 1.0 (both floors maxed)', () => {
    expect(computeConfidence(0, [])).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test
```

Expected: `Cannot find module '../src/confidence'`.

- [ ] **Step 3: Implement `src/confidence.ts`**

```ts
/**
 * Confidence model for the NOW ring.
 *
 * confidence = freshness × stability, both bounded in [floor, 1.0].
 *   - freshness decays with data age (lastFetchMs)
 *   - stability measures how consistent the same vehicle's timeToStation has
 *     been across recent polls. A healthy prediction should drop by roughly the
 *     poll interval each tick; big deviations mean TfL is reshuffling the schedule.
 *
 * Both cold-start at 1.0 so a fresh session never looks untrustworthy.
 */

export interface PredictionSample {
  vehicleId: string;
  timeToStation: number;
  fetchedAtMs: number;
}

const FRESHNESS_FULL_MS = 30_000;
const FRESHNESS_MIN_MS = 90_000;
const FRESHNESS_FLOOR = 0.3;

export function computeFreshness(ageMs: number): number {
  if (ageMs <= FRESHNESS_FULL_MS) return 1.0;
  if (ageMs >= FRESHNESS_MIN_MS) return FRESHNESS_FLOOR;
  const t = (ageMs - FRESHNESS_FULL_MS) / (FRESHNESS_MIN_MS - FRESHNESS_FULL_MS);
  return 1.0 - t * (1.0 - FRESHNESS_FLOOR);
}

const STABILITY_LOW_DRIFT_S = 5;
const STABILITY_HIGH_DRIFT_S = 15;
const STABILITY_FLOOR = 0.5;
const STABILITY_MIN_SAMPLES = 3;

export function computeStability(samples: PredictionSample[]): number {
  if (samples.length < STABILITY_MIN_SAMPLES) return 1.0;

  let totalDrift = 0;
  let pairs = 0;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const expectedDeltaS = (curr.fetchedAtMs - prev.fetchedAtMs) / 1000;
    const actualDeltaS = prev.timeToStation - curr.timeToStation;
    totalDrift += Math.abs(expectedDeltaS - actualDeltaS);
    pairs += 1;
  }
  const avgDrift = totalDrift / pairs;

  if (avgDrift <= STABILITY_LOW_DRIFT_S) return 1.0;
  if (avgDrift >= STABILITY_HIGH_DRIFT_S) return STABILITY_FLOOR;
  const t = (avgDrift - STABILITY_LOW_DRIFT_S) / (STABILITY_HIGH_DRIFT_S - STABILITY_LOW_DRIFT_S);
  return 1.0 - t * (1.0 - STABILITY_FLOOR);
}

export function computeConfidence(ageMs: number, samples: PredictionSample[]): number {
  return computeFreshness(ageMs) * computeStability(samples);
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test
```

Expected: all existing tests still pass + 10 new confidence tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/confidence.ts tests/confidence.test.ts
git commit -m "feat: add confidence model for the NOW ring"
```

---

## Task 2: Verified facts array

**Files:**
- Create: `src/facts.ts`
- Create: `tests/facts.test.ts`

- [ ] **Step 1: Write failing tests**

Write `tests/facts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FACTS, factAt } from '../src/facts';

describe('FACTS', () => {
  it('contains 23 curated facts', () => {
    expect(FACTS).toHaveLength(23);
  });

  it('every fact is 45 characters or fewer (fits on a narrow phone without wrapping)', () => {
    FACTS.forEach((fact, i) => {
      expect(fact.length, `fact #${i}: ${fact}`).toBeLessThanOrEqual(45);
    });
  });

  it('facts are all unique', () => {
    expect(new Set(FACTS).size).toBe(FACTS.length);
  });

  it('no fact starts with a lowercase letter (consistent capitalisation)', () => {
    FACTS.forEach((fact) => {
      const first = fact[0];
      expect(first).toBe(first.toUpperCase());
    });
  });
});

describe('factAt', () => {
  it('returns the fact at the given index', () => {
    expect(factAt(0)).toBe(FACTS[0]);
    expect(factAt(1)).toBe(FACTS[1]);
    expect(factAt(22)).toBe(FACTS[22]);
  });

  it('wraps past the end', () => {
    expect(factAt(FACTS.length)).toBe(FACTS[0]);
    expect(factAt(FACTS.length + 5)).toBe(FACTS[5]);
  });

  it('handles negative indices (legacy / corrupt stored values)', () => {
    expect(factAt(-1)).toBe(FACTS[FACTS.length - 1]);
    expect(factAt(-FACTS.length)).toBe(FACTS[0]);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test
```

Expected: `Cannot find module '../src/facts'`.

- [ ] **Step 3: Implement `src/facts.ts`**

```ts
/**
 * Curated, verified trivia about the Weaver line, the Chingford branch, the
 * trains running underneath East Avenue bridge, and the local area. Every fact
 * must be verifiable against a public source before being added.
 *
 * Hard cap: 25. If you want to add a 26th, one has to leave.
 */
export const FACTS: readonly string[] = [
  // The line itself
  'Chingford branch opened 24 April 1870',
  'Built by Great Eastern Railway',
  'Electrified November 1960',
  'Upgraded to 25 kV in 1983',
  'Renamed "Weaver line" in February 2024',
  'Named after East End textile workers',
  // Stations on the branch
  'Walthamstow Central was called Hoe Street',
  'Renamed to Walthamstow Central in 1968',
  'Wood Street station opened in 1873',
  'Wood Street was almost the Victoria terminus',
  'Highams Park was originally "Hale End"',
  'Highams Park was renamed in 1894',
  'Chingford station rebuilt in 1878',
  'Chingford is the end of the line',
  'Queen Victoria visited Chingford in 1882',
  // The trains
  'Class 710 Aventra — built in Derby',
  'Class 710 trains built 2017–2020',
  'Class 710 top speed: 75 mph',
  'Class 710 four-car trains are 83 m long',
  // Walthamstow local
  'William Morris was born in Walthamstow',
  'William Morris: textile designer and poet',
  "Walthamstow Market is Europe's longest",
  'Morris Gallery is at Lloyd Park',
];

/** Pull the fact at `index`, wrapping past either end so a persisted counter
 *  can keep incrementing forever without overflow concerns. */
export function factAt(index: number): string {
  const n = FACTS.length;
  return FACTS[((index % n) + n) % n];
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test
```

Expected: all tests pass. New facts tests = ~8.

- [ ] **Step 5: Commit**

```bash
git add src/facts.ts tests/facts.test.ts
git commit -m "feat: add verified Weaver-line facts pool + factAt lookup"
```

---

## Task 3: State + ViewModel wiring in main.ts

**Files:**
- Modify: `src/main.ts`
- Modify: `src/render.ts`

- [ ] **Step 1: Extend `ViewModel` in `src/render.ts`**

Find the existing `ViewModel` interface in `src/render.ts` and add the four new fields:

```ts
export interface ViewModel {
  north?: BridgeEvent;
  south?: BridgeEvent;
  freshness: FreshnessState;
  error?: string;
  northPos: number | null;
  southPos: number | null;
  celebrate: { north: boolean; south: boolean };
  northTicker: BridgeEvent[];
  southTicker: BridgeEvent[];
  walkingLabel: string | null;
  theme: Theme;
  // New this round — confidence for each direction (1.0 = fully trusted) and the
  // currently-displayed fact line. Fact is always a string; ring is hidden when
  // confidence is >= 0.7 so the default of 1.0 keeps the ring invisible.
  northConfidence: number;
  southConfidence: number;
  fact: string;
}
```

Do NOT modify `render()` or `renderDirection()` in this task. They'll consume the new fields in Tasks 4–6.

- [ ] **Step 2: Wire prediction-sample buffer + fact rotation in `src/main.ts`**

At the top of `src/main.ts` add these imports alongside the existing ones:

```ts
import { computeConfidence, type PredictionSample } from './confidence';
import { factAt } from './facts';
```

Near the other module-level state declarations, add:

```ts
// Per-direction ring buffer of the last N prediction samples for the hero train.
// Used by confidence.computeStability to detect when TfL is reshuffling the schedule.
const PREDICTION_SAMPLES_KEEP = 3;
const predictionSamples: Record<Direction, PredictionSample[]> = { north: [], south: [] };

function recordPredictionSample(dir: Direction, ev: BridgeEvent, fetchedAtMs: number): void {
  const sample: PredictionSample = {
    vehicleId: ev.arrival.id,
    timeToStation: ev.arrival.timeToStation,
    fetchedAtMs,
  };
  const buf = predictionSamples[dir];
  // If the hero's vehicle changed (the previous train left and a new one was
  // promoted), the history is irrelevant — reset the buffer so we cold-start
  // stability back at 1.0.
  if (buf.length > 0 && buf[buf.length - 1].vehicleId !== sample.vehicleId) {
    buf.length = 0;
  }
  buf.push(sample);
  while (buf.length > PREDICTION_SAMPLES_KEEP) buf.shift();
}

// Facts rotation — persist a monotonically-increasing index in localStorage so the
// user doesn't always see the same fact first on each app open. Advance once per
// successful TfL poll.
const FACT_STORAGE_KEY = 'wtt_fact_index';
let factIndex = (() => {
  const raw = safeLocalRead(FACT_STORAGE_KEY);
  const parsed = raw === null ? 0 : parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
})();

function advanceFact(): void {
  factIndex += 1;
  safeLocalWrite(FACT_STORAGE_KEY, String(factIndex));
}
```

Replace the existing `tick()` function with:

```ts
async function tick(): Promise<void> {
  try {
    const arrivals = await fetchArrivals(WALTHAMSTOW_CENTRAL_STOPPOINT_ID);
    const picked = pickNextNPerDirection(arrivals, TICKER_SIZE);
    const now = Date.now();
    // Record samples BEFORE reassigning snapshots so the buffer sees the hero
    // we're actually about to display.
    if (picked.north[0]) recordPredictionSample('north', picked.north[0], now);
    if (picked.south[0]) recordPredictionSample('south', picked.south[0], now);
    snapshots = {
      north: picked.north.length > 0 ? { events: picked.north, snapshottedAtMs: now } : undefined,
      south: picked.south.length > 0 ? { events: picked.south, snapshottedAtMs: now } : undefined,
    };
    lastFetchMs = now;
    lastError = undefined;
    advanceFact();
  } catch (err) {
    lastError = err instanceof Error ? err.message : 'Network error — check connection';
  }
  rerender();
}
```

Then in `buildViewModel()`, replace the `return { ... }` block with:

```ts
  const ageMs = lastFetchMs === null ? 0 : now - lastFetchMs;

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
    walkingLabel: computeWalkingLabel(),
    theme: currentTheme(new Date()),
    northConfidence: heroes.north ? computeConfidence(ageMs, predictionSamples.north) : 1,
    southConfidence: heroes.south ? computeConfidence(ageMs, predictionSamples.south) : 1,
    fact: factAt(factIndex),
  };
```

(`now` is already in scope from the top of `buildViewModel` — reuse it.)

- [ ] **Step 3: Run tests — confirm no regressions**

```bash
npm test
```

Expected: all existing + new tests pass; test count unchanged from Task 2.

- [ ] **Step 4: Build — confirm clean**

```bash
npm run build
```

Expected: exit 0 with no TS errors.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/render.ts
git commit -m "feat: wire prediction samples + fact rotation into view model"
```

---

## Task 4: Render the confidence ring

**Files:**
- Modify: `src/render.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Add a ring builder + value wrapper in `src/render.ts`**

Near the other private helpers in `src/render.ts` add:

```ts
const CONFIDENCE_RING_VISIBLE_THRESHOLD = 0.7;
const SVG_NS = 'http://www.w3.org/2000/svg';

function buildConfidenceRing(confidence: number): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'value-ring');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');

  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', '2');
  rect.setAttribute('y', '2');
  rect.setAttribute('width', '96');
  rect.setAttribute('height', '96');
  rect.setAttribute('rx', '14');
  rect.setAttribute('ry', '14');
  rect.setAttribute('fill', 'none');
  rect.setAttribute('stroke', 'currentColor');
  rect.setAttribute('stroke-width', '2.5');
  rect.setAttribute('stroke-linecap', 'round');
  rect.setAttribute('pathLength', '100');

  // The ring is invisible at full confidence. Below the visible threshold the
  // arc length grows proportionally with lost confidence.
  const visible = confidence < CONFIDENCE_RING_VISIBLE_THRESHOLD;
  const arcFrac = visible ? Math.min(100, (1 - confidence) * 100) : 0;
  rect.setAttribute('stroke-dasharray', `${arcFrac} 100`);

  svg.appendChild(rect);
  return svg;
}
```

Then find the existing `renderDirection` function and replace it with:

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

  // Wrap the value in a positioning context so the confidence ring can overlay it.
  const wrap = document.createElement('div');
  wrap.className = 'value-wrap';
  wrap.appendChild(buildConfidenceRing(confidence));

  const valueEl = document.createElement('div');
  valueEl.className = 'value';

  let currentText: string;
  if (!event) {
    valueEl.classList.add('sleeping');
    currentText = 'No trains for a while';
  } else {
    const countdown = formatCountdown(event.bridgeTimeSeconds);
    valueEl.classList.add(countdown.kind);
    currentText = countdown.text;
  }
  valueEl.textContent = currentText;

  if (previousValueText[label] !== currentText) {
    valueEl.classList.add('ticking');
  }
  previousValueText[label] = currentText;

  wrap.appendChild(valueEl);
  row.appendChild(wrap);
  return row;
}
```

And update the two call sites inside `render()` (they already pass the aria label — add the confidence argument):

```ts
    root.appendChild(renderDirection('→ Chingford', vm.north, 'Next train to Chingford', vm.northConfidence));
    // ...
    root.appendChild(renderDirection('← Walthamstow Central', vm.south, 'Next train to Walthamstow Central', vm.southConfidence));
```

- [ ] **Step 2: Add ring CSS to `src/styles.css`**

Append to the end of `src/styles.css`:

```css
/* ───── Confidence ring (only visible when confidence < 0.7) ───── */

.value-wrap {
  position: relative;
  display: inline-block;
  padding: 4px 8px;
}

.value-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  color: var(--warn);
  opacity: 0.9;
}

.value-ring rect {
  transition: stroke-dasharray 400ms ease, opacity 400ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .value-ring rect {
    transition: none;
  }
}
```

- [ ] **Step 3: Verify tests + build**

```bash
npm test && npm run build
```

Expected: tests pass, build exits 0.

- [ ] **Step 4: Manual CLI check**

```bash
npm run dev &
DEV_PID=$!
sleep 4
curl -s http://localhost:5173/src/render.ts | grep -c 'buildConfidenceRing'
# Expected: >= 2 (definition + call site inside renderDirection)
curl -s http://localhost:5173/src/styles.css | grep -c 'value-ring'
# Expected: >= 2
kill $DEV_PID 2>/dev/null || true
wait $DEV_PID 2>/dev/null || true
```

- [ ] **Step 5: Commit**

```bash
git add src/render.ts src/styles.css
git commit -m "feat: confidence ring — amber arc when countdown trust drops"
```

---

## Task 5: Render the fact line

**Files:**
- Modify: `src/render.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Add a fact-line renderer in `src/render.ts`**

Near the other helpers (by `renderTicker`), add:

```ts
// Memo of the last-rendered fact so we can animate a fade only on change.
let previousFactText: string | null = null;

function renderFactLine(fact: string): HTMLElement | null {
  if (!fact) return null;
  const el = document.createElement('div');
  el.className = 'fact-line';
  el.textContent = fact;
  if (previousFactText !== fact) {
    el.classList.add('fact-enter');
  }
  previousFactText = fact;
  return el;
}
```

Find the block in `render()` that appends the footer and the doc-links. Insert the fact line **between** them:

```ts
  const footer = document.createElement('div');
  footer.className = `footer ${vm.freshness.state}`;
  footer.textContent = vm.freshness.state === 'no-data'
    ? 'connecting…'
    : formatAge(vm.freshness.ageMs);
  root.appendChild(footer);

  // Quiet rotating line of verified Weaver-line trivia, below the "updated Xs ago"
  // footer and above the About/Privacy/Terms links. Never competes with the data.
  const factLine = renderFactLine(vm.fact);
  if (factLine) root.appendChild(factLine);

  const docs = document.createElement('nav');
  docs.className = 'doc-links';
  // ...rest unchanged
```

- [ ] **Step 2: Add CSS to `src/styles.css`**

Append:

```css
/* ───── Rotating fact line ───── */

.fact-line {
  font-family: 'Big Shoulders Text', sans-serif;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--dim);
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  opacity: 0.6;
  padding-top: 0.25rem;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fact-line.fact-enter {
  animation: fact-fade 420ms ease;
}

@keyframes fact-fade {
  from { opacity: 0; transform: translateY(2px); }
  to   { opacity: 0.6; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .fact-line.fact-enter {
    animation: none;
  }
}
```

- [ ] **Step 3: Build and test**

```bash
npm test && npm run build
```

Expected: pass + exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/render.ts src/styles.css
git commit -m "feat: rotating fact line below the footer"
```

---

## Task 6: Arrow emphasis during the last-minute countdown

**Files:**
- Modify: `src/render.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Add `.row-imminent` class when the countdown kind is `seconds`**

In `src/render.ts`, update `renderDirection` to add the class — modify the existing block:

```ts
  let currentText: string;
  if (!event) {
    valueEl.classList.add('sleeping');
    currentText = 'No trains for a while';
  } else {
    const countdown = formatCountdown(event.bridgeTimeSeconds);
    valueEl.classList.add(countdown.kind);
    currentText = countdown.text;
    // Cue the eye to the arrow in the last 11–59 s before NOW, when the user
    // is actively waiting. The .now state has its own celebration, so we stop
    // the pulse once the countdown transitions.
    if (countdown.kind === 'seconds') {
      row.classList.add('row-imminent');
    }
  }
```

- [ ] **Step 2: Add the pulse CSS to `src/styles.css`**

Append:

```css
/* ───── Arrow emphasis (last-minute countdown) ───── */

.row-imminent .label::first-letter {
  display: inline-block;
  animation: arrow-pulse 1s ease-in-out infinite;
  transform-origin: center;
}

@keyframes arrow-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.18); }
}

@media (prefers-reduced-motion: reduce) {
  .row-imminent .label::first-letter {
    animation: none;
  }
}
```

- [ ] **Step 3: Build and test**

```bash
npm test && npm run build
```

Expected: pass + exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/render.ts src/styles.css
git commit -m "feat: pulse the direction-arrow first-letter during the seconds countdown"
```

---

## Task 7: Verify and deploy

- [ ] **Step 1: Full test + build + bundle-size sanity**

```bash
npm test
```

Expected: 104 previous tests + ~18 new (10 confidence, ~8 facts) = ~122 total.

```bash
npm run build
```

Expected: exit 0. Note the gzipped JS + CSS sizes — should be roughly +1 KB over the previous build, comfortably under target.

- [ ] **Step 2: Push to main**

```bash
git push origin main
```

- [ ] **Step 3: Poll Netlify for deploy**

```bash
SITE_ID="ade8ca45-bd3e-4a6f-8f3d-cadae3e8ec97"
for i in 1 2 3 4; do
  sleep 20
  STATE=$(npx -y netlify-cli api listSiteDeploys --data "{\"site_id\":\"$SITE_ID\",\"per_page\":1}" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin)[0]; print(f\"{d['state']}|{d['commit_ref'][:8]}\")" 2>/dev/null)
  echo "[$((i*20))s] $STATE"
  case "$STATE" in
    ready*) echo "DEPLOYED"; break ;;
    error*) echo "FAILED"; break ;;
  esac
done
```

Expected: "DEPLOYED" within ~40 s.

- [ ] **Step 4: Verify live bundle contains the new features**

```bash
JSURL=$(curl -s https://walthamstow-train-tracker.netlify.app/ | grep -o 'assets/index-[^"]*.js' | head -1)
curl -s "https://walthamstow-train-tracker.netlify.app/$JSURL" | grep -oE '(computeConfidence|factAt|FACTS|value-ring|fact-line|row-imminent)' | sort -u
# Expected: all of them present in some form (some may be minified out of recognisable names — check value-ring, fact-line, row-imminent at minimum).
CSSURL=$(curl -s https://walthamstow-train-tracker.netlify.app/ | grep -o 'assets/index-[^"]*.css' | head -1)
curl -s "https://walthamstow-train-tracker.netlify.app/$CSSURL" | grep -oE '(value-ring|fact-line|row-imminent|arrow-pulse|fact-fade)' | sort -u
# Expected: all 5.
```

- [ ] **Step 5: Hand off to the human user**

Ask the user to:

1. Refresh the PWA (close/reopen on phone to pick up the new SW)
2. Leave the app open for ~3 polls to accumulate a confidence history, then watch whether the amber ring ever appears (it should be invisible most of the time)
3. Confirm the rotating trivia line is quiet and readable under the footer
4. Wait for a countdown to drop into the `seconds` state (under a minute) and confirm the arrow pulses gently
5. Tap through to About, Privacy, Terms to confirm no regressions on the static pages

---

## Self-review notes

**Spec coverage:**
- ✅ Confidence ring: model + visibility threshold + rendering — Tasks 1, 3, 4
- ✅ Tiny facts rotation: 23 facts, localStorage-persisted index, 20 s cadence, fade-in — Tasks 2, 3, 5
- ✅ Arrow emphasis during `seconds` — Task 6
- ✅ `prefers-reduced-motion` respected in every new animation — Tasks 4, 5, 6

**Fact-list adjustments applied:**
- ✅ "Britain's first plastics factory opened here, 1894" — removed (was unverified)
- ✅ "East Avenue is in the village conservation area" — removed (was unverified)
- ✅ "He was a textile designer and poet" — rewritten to "William Morris: textile designer and poet" so it stands alone

Resulting pool: 23 facts (was 25).

**Type consistency:**
- `PredictionSample` defined once in `confidence.ts`; imported by `main.ts`
- `ViewModel` extension additive — existing consumers unaffected
- `buildConfidenceRing` returns `SVGElement`, `renderFactLine` returns `HTMLElement | null`

**Placeholder scan:** all steps contain concrete code; no TODOs or "consider X".

**Known caveats:**
- The fact `'Renamed "Weaver line" in February 2024'` contains double-quote characters. In the source code they must be escaped (or the surrounding string use single quotes, which is what the plan shows). Same for `'Highams Park was originally "Hale End"'`.
- The fact `"Walthamstow Market is Europe's longest"` uses an apostrophe — the surrounding string uses double quotes to avoid escaping. Plan already handles this.
- `previousFactText` is a module-level mutable singleton in `render.ts`. This is consistent with the existing `previousValueText` pattern already in that file.
