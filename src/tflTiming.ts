import type { Arrival } from './tfl';
import type { BridgeEvent } from './bridge';

/** Matches the just-crossed window in bridge.ts: a train this far past the
 *  viewpoint is no longer shown. */
const PAST_VIEWPOINT_LIMIT_SECONDS = -30;

/** A train TfL drops with more than the viewpoint offset plus this much time
 *  left was cancelled or re-planned, not merely arrived at the station. */
const HOLD_MARGIN_SECONDS = 60;

/**
 * Seconds until the train reaches the station.
 *
 * TfL's `timeToStation` is measured from when TfL built the prediction, which
 * is 54-112 s before we receive it (measured 2026-11-17), so counting down
 * from it runs late by that much. `expectedArrival` is an absolute time and
 * does not age. Only viewpoints whose offsets were tuned against it opt in.
 */
export function secondsToStation(arrival: Arrival, nowMs: number, fromExpectedArrival: boolean): number {
  if (!fromExpectedArrival) return arrival.timeToStation;
  const expectedMs = Date.parse(arrival.expectedArrival);
  if (Number.isNaN(expectedMs)) return arrival.timeToStation;
  return (expectedMs - nowMs) / 1000;
}

/**
 * TfL removes a train from a station's arrivals once it gets there. Where the
 * viewpoint lies beyond the station (positive offset), that happens while the
 * train is still on its way to the viewpoint, and the countdown would jump to
 * the following train. This keeps such a train counting down until it passes.
 *
 * `feedVehicleIds` is every vehicle in the fresh feed for this direction, not
 * only the few picked for display.
 */
export function holdDroppedTrains(
  previous: { events: BridgeEvent[]; snapshottedAtMs: number } | undefined,
  fresh: BridgeEvent[],
  feedVehicleIds: ReadonlySet<string>,
  nowMs: number,
  offsetSeconds: number,
): BridgeEvent[] {
  if (!previous || offsetSeconds <= 0) return fresh;
  const elapsedSeconds = (nowMs - previous.snapshottedAtMs) / 1000;
  const held: BridgeEvent[] = [];
  for (const ev of previous.events) {
    const vehicleId = ev.arrival.vehicleId;
    if (!vehicleId || feedVehicleIds.has(vehicleId)) continue;
    const remaining = ev.bridgeTimeSeconds - elapsedSeconds;
    if (remaining < PAST_VIEWPOINT_LIMIT_SECONDS) continue;
    if (remaining > offsetSeconds + HOLD_MARGIN_SECONDS) continue;
    held.push({
      ...ev,
      arrival: { ...ev.arrival, timeToStation: ev.arrival.timeToStation - elapsedSeconds },
      bridgeTimeSeconds: remaining,
    });
  }
  if (held.length === 0) return fresh;
  return [...held, ...fresh].sort((a, b) => a.bridgeTimeSeconds - b.bridgeTimeSeconds);
}
