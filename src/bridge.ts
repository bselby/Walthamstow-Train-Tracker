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

export function pickNextPerDirection(arrivals: Arrival[]): { north?: BridgeEvent; south?: BridgeEvent } {
  const events = arrivals
    .map(toEvent)
    .filter((e) => e.bridgeTimeSeconds >= JUST_CROSSED_WINDOW_SECONDS)
    .sort((a, b) => a.bridgeTimeSeconds - b.bridgeTimeSeconds);

  return {
    north: events.find((e) => e.direction === 'north'),
    south: events.find((e) => e.direction === 'south')
  };
}
