// Arrivals for the home list. Viewpoints share TfL stops, so each stop is
// asked once per poll and its answer feeds every viewpoint on it. TfL only:
// no freight and no signalling steps, so home never touches the Realtime
// Trains quota and a row can differ slightly from its countdown screen.
import type { Arrival } from './tfl';
import { snapshotViewpoint, type ViewpointSnapshots } from './snapshots';
import type { Viewpoint } from './viewpoints';

/** Home polls every 30 s, and never more than 8 stops: at most 16 requests a
 *  minute against TfL's anonymous limit of 50 (api-portal.tfl.gov.uk/products,
 *  checked 2026-11-17). */
export const HOME_POLL_INTERVAL_MS = 30_000;
export const HOME_MAX_STOPS = 8;
/** After three missed polls a row stops showing a countdown it can't stand behind. */
export const HOME_STALE_MS = 90_000;

/** Trains kept per direction: the next one, and spares for when it passes
 *  between polls. */
const PER_DIRECTION = 3;

export type HomeSnapshots = Record<string, { snapshots: ViewpointSnapshots; fetchedAtMs: number }>;

export type NextTrain =
  | { state: 'loading' }
  | { state: 'stale' }
  | { state: 'none' }
  | { state: 'due'; seconds: number };

/** Distinct stops in row order, so the cap drops the rows furthest down. */
export function stopsToPoll(viewpoints: readonly Viewpoint[], max: number = HOME_MAX_STOPS): string[] {
  const stops: string[] = [];
  for (const v of viewpoints) {
    if (!stops.includes(v.stopPointId)) stops.push(v.stopPointId);
  }
  return stops.slice(0, max);
}

/** Fold one stop's arrivals into every viewpoint on that stop. */
export function applyStopArrivals(
  current: HomeSnapshots,
  viewpoints: readonly Viewpoint[],
  stopPointId: string,
  arrivals: Arrival[],
  nowMs: number,
): HomeSnapshots {
  const next: HomeSnapshots = { ...current };
  for (const v of viewpoints) {
    if (v.stopPointId !== stopPointId) continue;
    const lineArrivals = arrivals.filter((a) => a.lineId === v.lineId);
    next[v.id] = {
      snapshots: snapshotViewpoint(current[v.id]?.snapshots ?? {}, lineArrivals, v, nowMs, PER_DIRECTION),
      fetchedAtMs: nowMs,
    };
  }
  return next;
}

/** The next train past a viewpoint in either direction, counted down from
 *  when its data was fetched. */
export function nextTrain(entry: HomeSnapshots[string] | undefined, nowMs: number): NextTrain {
  if (!entry) return { state: 'loading' };
  if (nowMs - entry.fetchedAtMs > HOME_STALE_MS) return { state: 'stale' };
  let soonest: number | null = null;
  for (const snap of [entry.snapshots.north, entry.snapshots.south]) {
    if (!snap) continue;
    const elapsed = (nowMs - snap.snapshottedAtMs) / 1000;
    for (const ev of snap.events) {
      const seconds = ev.bridgeTimeSeconds - elapsed;
      if (seconds >= 0 && (soonest === null || seconds < soonest)) soonest = seconds;
    }
  }
  return soonest === null ? { state: 'none' } : { state: 'due', seconds: soonest };
}

/** One poll: every stop asked at once; a stop that fails keeps its old data. */
export async function pollHome(
  viewpoints: readonly Viewpoint[],
  current: HomeSnapshots,
  fetchStop: (stopPointId: string) => Promise<Arrival[]>,
  now: () => number,
): Promise<{ snapshots: HomeSnapshots; failed: number; polled: number }> {
  const stops = stopsToPoll(viewpoints);
  const results = await Promise.allSettled(stops.map((id) => fetchStop(id)));
  const nowMs = now();
  let snapshots = current;
  let failed = 0;
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      snapshots = applyStopArrivals(snapshots, viewpoints, stops[i], result.value, nowMs);
    } else {
      failed += 1;
    }
  });
  return { snapshots, failed, polled: stops.length };
}
