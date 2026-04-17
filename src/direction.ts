import type { Arrival } from './tfl';

export type Direction = 'north' | 'south';

export function classifyDirection(arrival: Arrival): Direction {
  return arrival.destinationName.toLowerCase().includes('chingford') ? 'north' : 'south';
}
