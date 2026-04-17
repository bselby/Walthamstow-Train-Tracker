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

  // Active celebration (1 second window after each direction's 'now' edge).
  // Each direction celebrates independently — both bridges can jiggle at once.
  const celebrate: ViewModel['celebrate'] = { north: false, south: false };
  for (const dir of DIRECTIONS) {
    const setAt = celebrateSetAt[dir];
    if (setAt !== undefined && now - setAt < CELEBRATE_DURATION_MS) {
      celebrate[dir] = true;
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
