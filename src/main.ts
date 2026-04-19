import { fetchArrivals } from './tfl';
import { pickNextNPerDirection } from './bridge';
import type { BridgeEvent } from './bridge';
import { classifyFreshness } from './freshness';
import { startPoller } from './poller';
import { render, type ViewModel } from './render';
import { formatCountdown } from './display';
import { estimatePosition } from './trainPosition';
import { currentTheme } from './season';
import { WALTHAMSTOW_CENTRAL_STOPPOINT_ID, POLL_INTERVAL_MS, EAST_AVE_BRIDGE } from './constants';
import type { Direction } from './direction';
import { subscribe as subscribeLocation, start as startLocation, stop as stopLocation, getState as getLocationState } from './geolocation';
import { walkingEstimate, formatWalkingLabel } from './walkingTime';

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

const WALKING_STORAGE_KEY = 'wtt_walking_enabled';

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

function computeWalkingLabel(): string | null {
  if (!walkingEnabled) return null;
  const { status, position } = getLocationState();
  if (status === 'unavailable') return null;
  if (status === 'denied') return 'Location unavailable';
  if (status === 'locating' || position === null) return 'Locating…';
  const est = walkingEstimate(position, EAST_AVE_BRIDGE);
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
    walkingLabel: computeWalkingLabel(),
    theme: currentTheme(new Date()),
  };
}

function rerender(): void {
  render(root, buildViewModel(), {
    onEnableWalkingTime: enableWalkingTime,
    onDisableWalkingTime: disableWalkingTime,
  });
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

setInterval(rerender, 1000);
startPoller(tick, POLL_INTERVAL_MS);
