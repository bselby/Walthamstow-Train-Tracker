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

export function pickNextNPerDirection(
  arrivals: Arrival[],
  n: number
): { north: BridgeEvent[]; south: BridgeEvent[] } {
  const events = arrivals
    .map(toEvent)
    .filter((e) => e.bridgeTimeSeconds >= JUST_CROSSED_WINDOW_SECONDS)
    .sort((a, b) => a.bridgeTimeSeconds - b.bridgeTimeSeconds);

  return {
    north: events.filter((e) => e.direction === 'north').slice(0, n),
    south: events.filter((e) => e.direction === 'south').slice(0, n),
  };
}

export function pickNextPerDirection(arrivals: Arrival[]): { north?: BridgeEvent; south?: BridgeEvent } {
  const nexts = pickNextNPerDirection(arrivals, 1);
  return { north: nexts.north[0], south: nexts.south[0] };
}
