import { fetchArrivals } from './tfl';
import { pickNextNPerDirection } from './bridge';
import type { BridgeEvent } from './bridge';
import { classifyFreshness } from './freshness';
import { startPoller } from './poller';
import { render, type ViewModel } from './render';
import { formatCountdown } from './display';
import { estimatePosition } from './trainPosition';
import { POLL_INTERVAL_MS } from './constants';
import { getViewpointById, DEFAULT_VIEWPOINT_ID } from './viewpoints';
import type { Viewpoint } from './viewpoints';
import type { Direction } from './direction';
import { subscribe as subscribeLocation, start as startLocation, stop as stopLocation, getState as getLocationState } from './geolocation';
import { walkingEstimate, formatWalkingLabel } from './walkingTime';
import { computeConfidence, type PredictionSample } from './confidence';
import { factAt } from './facts';

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

// Generation counter — incremented on every viewpoint switch. tick() captures
// the current value at invocation time and discards results if it has changed
// by the time the fetch resolves, preventing a stale viewpoint's arrivals from
// overwriting the current viewpoint's state during rapid switches.
let tickGeneration = 0;

const previousKind: Partial<Record<Direction, string>> = {};

const WALKING_STORAGE_KEY = 'wtt_walking_enabled';
const FAVOURITE_STORAGE_KEY = 'wtt_favourite_viewpoint';

// Safe wrappers around localStorage. In Safari private browsing `localStorage`
// exists but `setItem` / `removeItem` throw; in other hardened browsers either
// op can fail. The feature works for the session even if persistence fails —
// the user just has to re-enable on next load.
function safeLocalRead(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeLocalWrite(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    /* storage full / private mode / blocked — swallow, feature still works in-session */
  }
}

function safeLocalRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch {
    /* same as above */
  }
}

// QA / debugging: visiting `?reset=walking` clears the walkingEnabled flag so
// the opt-in row reappears on next load. The param is stripped from the URL
// after reading so a normal refresh doesn't keep resetting.
try {
  const url = new URL(window.location.href);
  if (url.searchParams.get('reset') === 'walking') {
    safeLocalRemove(WALKING_STORAGE_KEY);
    url.searchParams.delete('reset');
    window.history.replaceState({}, '', url.toString());
  }
} catch {
  /* no-op: URL / history API may be unavailable in exotic environments */
}

let walkingEnabled = safeLocalRead(WALKING_STORAGE_KEY) === '1';
const celebrateSetAt: Partial<Record<Direction, number>> = {};

/** Load the stored favourite viewpoint id, validating that it points at a
 *  real viewpoint. Falls back to DEFAULT_VIEWPOINT_ID if missing or stale. */
function loadFavouriteViewpointId(): string {
  const stored = safeLocalRead(FAVOURITE_STORAGE_KEY);
  if (stored && getViewpointById(stored)) return stored;
  return DEFAULT_VIEWPOINT_ID;
}

let favouriteViewpointId = loadFavouriteViewpointId();

// Active viewpoint for this session. Starts at the user's favourite if stored,
// else the default (East Ave).
let activeViewpoint: Viewpoint = getViewpointById(favouriteViewpointId)!;

// Per-direction ring buffer of the last N prediction samples for the hero train.
// Used by confidence.computeStability to detect when TfL is reshuffling the schedule.
const PREDICTION_SAMPLES_KEEP = 3;
const predictionSamples: Record<Direction, PredictionSample[]> = { north: [], south: [] };

function recordPredictionSample(dir: Direction, ev: BridgeEvent, fetchedAtMs: number): void {
  // Fall back to the prediction id if TfL doesn't ship a vehicleId for this
  // arrival (shouldn't happen in prod — the real feed always sets it — but
  // test fixtures and edge cases might). The stability score just degrades
  // gracefully in that case: the buffer resets on every poll, stability stays 1.0.
  const sample: PredictionSample = {
    vehicleId: ev.arrival.vehicleId ?? ev.arrival.id,
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

export function enableWalkingTime(): void {
  walkingEnabled = true;
  safeLocalWrite(WALKING_STORAGE_KEY, '1');
  startLocation();
}

export function disableWalkingTime(): void {
  walkingEnabled = false;
  safeLocalRemove(WALKING_STORAGE_KEY);
  stopLocation();
}

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
  // Clear snapshots AND lastFetchMs so the freshness state flips to 'no-data'
  // and the UI shows "Connecting to TfL…" — otherwise the previous viewpoint's
  // fresh poll satisfies classifyFreshness and we flash "No trains right now"
  // for up to a few hundred ms until the new tick resolves. Also reset
  // prediction samples since they're keyed on the old vehicleIds.
  snapshots = {};
  lastFetchMs = null;
  lastError = undefined;
  predictionSamples.north.length = 0;
  predictionSamples.south.length = 0;
  // Invalidate any in-flight tick so it discards its results when it resolves.
  tickGeneration++;
  // Update the document title: viewpoint name first so browser tabs are readable.
  document.title = `East Ave Trains — ${activeViewpoint.lineName} · ${activeViewpoint.name}`;
  // Update the --line-color CSS custom property so the header + train livery
  // pick up the new colour immediately.
  document.documentElement.style.setProperty('--line-color', activeViewpoint.lineColor);
  rerender();
  // Fire an immediate fetch against the new stoppoint — don't wait for the
  // next scheduled poll (20 s away).
  void tick();
}

function computeWalkingLabel(): string | null {
  if (!walkingEnabled) return null;
  const { status, position } = getLocationState();
  if (status === 'unavailable') return null;                 // API missing — hide feature
  if (status === 'denied') return 'Location unavailable';    // user refused
  if (status === 'no-signal') return 'No GPS signal';        // granted but can't lock
  // If we have a position from a previous fix we can keep showing the estimate
  // even while the watch is paused (tab-hidden → visible, or between reacquires).
  // Only fall back to "Locating…" when we truly have nothing yet.
  if (position === null) return 'Locating…';
  const est = walkingEstimate(position, activeViewpoint.coords);
  return formatWalkingLabel(est);
}

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
  return estimatePosition(currentTts, ev.direction, activeViewpoint);
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
      delete previousKind[dir];
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
    northConfidence: heroes.north ? computeConfidence(ageMs, predictionSamples.north) : 1,
    southConfidence: heroes.south ? computeConfidence(ageMs, predictionSamples.south) : 1,
    fact: factAt(factIndex),
    viewpoint: activeViewpoint,
    favouriteViewpointId,
  };
}

function rerender(): void {
  render(root, buildViewModel(), {
    onEnableWalkingTime: enableWalkingTime,
    onDisableWalkingTime: disableWalkingTime,
    onAdvanceFact: () => {
      // Tap on the fact line — advance + repaint immediately so the tap feels
      // instant (not "next time the 1 s loop fires"). Persisted index survives
      // across sessions so the next fact doesn't keep resetting.
      advanceFact();
      rerender();
    },
    onSwitchViewpoint: switchToViewpoint,
    onSetFavouriteViewpoint: setFavouriteViewpoint,
  });
}

async function tick(): Promise<void> {
  const gen = tickGeneration;
  try {
    const arrivals = await fetchArrivals(activeViewpoint.stopPointId, activeViewpoint.lineId);
    const picked = pickNextNPerDirection(arrivals, TICKER_SIZE, activeViewpoint);
    const now = Date.now();
    // Bail if the viewpoint switched while the fetch was in flight — these
    // arrivals belong to the old viewpoint and must not overwrite current state.
    if (gen !== tickGeneration) return;
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
    // Discard errors from stale in-flight ticks.
    if (gen !== tickGeneration) return;
    lastError = err instanceof Error ? err.message : 'Network error — check connection';
    // If we have no data yet (e.g. right after a viewpoint switch cleared
    // lastFetchMs), retry in 3 s rather than leaving the user stuck on the
    // error screen for the full 20 s poll interval.
    if (lastFetchMs === null) setTimeout(() => { void tick(); }, 3000);
  }
  rerender();
}

if (walkingEnabled) startLocation();

// Re-render whenever the geolocation state changes so the walking label
// reflects locating → granted → position transitions.
subscribeLocation(() => rerender());

// Visibility-aware rerender loop — pause when hidden so we don't run the 1s
// tick in background (browser throttles it anyway, but this makes intent
// explicit and frees a timer slot). Also pauses location watching.
let renderIntervalId: ReturnType<typeof setInterval> | null = null;
function startRenderLoop(): void {
  if (renderIntervalId !== null) return;
  rerender();
  renderIntervalId = setInterval(rerender, 1000);
}
function stopRenderLoop(): void {
  if (renderIntervalId !== null) {
    clearInterval(renderIntervalId);
    renderIntervalId = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    startRenderLoop();
    if (walkingEnabled) startLocation();
  } else {
    stopRenderLoop();
    if (walkingEnabled) stopLocation();
  }
});

// Sync CSS + title to the booted viewpoint. These normally update on switch,
// but first-paint needs them too.
document.documentElement.style.setProperty('--line-color', activeViewpoint.lineColor);
document.title = `East Ave Trains — ${activeViewpoint.name}`;

startRenderLoop();
startPoller(tick, POLL_INTERVAL_MS);
