// Turns one poll's TfL arrivals into what the countdown shows: for each
// direction, the next few trains with their time to the viewpoint, stamped
// with when they were fetched. Shared by the countdown screen and the home
// list so that a spot's row and its countdown agree.
import type { Arrival } from './tfl';
import { pickNextNPerDirection, type BridgeEvent } from './bridge';
import { classifyDirection, type Direction } from './direction';
import { holdDroppedTrains, secondsToStation } from './tflTiming';
import type { Viewpoint } from './viewpoints';

export interface DirectionSnapshot {
  events: BridgeEvent[];
  snapshottedAtMs: number;
}

export type ViewpointSnapshots = Partial<Record<Direction, DirectionSnapshot>>;

const DIRECTIONS: readonly Direction[] = ['north', 'south'];

/**
 * `lineArrivals` are this viewpoint's line only. `previous` is the last
 * result for the same viewpoint: a train TfL has dropped on reaching the
 * station is carried over from it until it passes the viewpoint.
 */
export function snapshotViewpoint(
  previous: ViewpointSnapshots,
  lineArrivals: Arrival[],
  viewpoint: Viewpoint,
  nowMs: number,
  perDirection: number,
): ViewpointSnapshots {
  const fromExpected = viewpoint.timeFromExpectedArrival === true;
  const arrivals = lineArrivals.map((a) => ({ ...a, timeToStation: secondsToStation(a, nowMs, fromExpected) }));
  const picked = pickNextNPerDirection(arrivals, perDirection, viewpoint);
  const next: ViewpointSnapshots = {};
  for (const dir of DIRECTIONS) {
    const feedVehicleIds = new Set(
      arrivals
        .filter((a) => classifyDirection(a, viewpoint) === dir && a.vehicleId)
        .map((a) => a.vehicleId as string),
    );
    const events = holdDroppedTrains(
      previous[dir],
      picked[dir],
      feedVehicleIds,
      nowMs,
      viewpoint.directions[dir].offsetSeconds,
    ).slice(0, perDirection);
    next[dir] = events.length > 0 ? { events, snapshottedAtMs: nowMs } : undefined;
  }
  return next;
}
