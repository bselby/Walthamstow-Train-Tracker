import type { Arrival } from './tfl';

export type Direction = 'north' | 'south';

/**
 * Classify an arrival by travel direction past the East Avenue bridge.
 *
 * TfL's `direction` field ("outbound" / "inbound") is the authoritative source —
 * it stays correct during engineering works when destinations change to
 * shuttle-terminus stations like Wood Street or Highams Park. We prefer it
 * whenever TfL returns it and fall back to destination-name parsing so older
 * fixtures (and any API change that drops the field) still classify correctly.
 */
export function classifyDirection(arrival: Arrival): Direction {
  if (arrival.direction === 'outbound') return 'north';
  if (arrival.direction === 'inbound') return 'south';
  return arrival.destinationName.toLowerCase().includes('chingford') ? 'north' : 'south';
}
