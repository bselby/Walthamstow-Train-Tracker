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
