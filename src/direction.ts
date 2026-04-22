import type { Arrival } from './tfl';
import type { Viewpoint } from './viewpoints';

export type Direction = 'north' | 'south';

/**
 * Classify an arrival by travel direction relative to a viewpoint.
 *
 * TfL's `direction` field ("outbound" / "inbound") is the authoritative source —
 * it stays correct during engineering works when destinations change to shuttle
 * terminuses. We prefer it whenever TfL returns it.
 *
 * Falls back to destination-name matching against the viewpoint's configured
 * terminus names when `direction` is missing.
 */
export function classifyDirection(arrival: Arrival, viewpoint: Viewpoint): Direction {
  if (arrival.direction === viewpoint.directions.north.tflDirection) return 'north';
  if (arrival.direction === viewpoint.directions.south.tflDirection) return 'south';

  // Destination-name fallback: match against terminus names (case-insensitive substring).
  // NOTE: this relies on each viewpoint's two terminusName values being mutually
  // non-overlapping as substrings. If you add a viewpoint whose north terminus name
  // is a substring of another viewpoint's south terminus (or vice-versa), the
  // fallback can misclassify arrivals when TfL omits the `direction` field.
  // Today's four terminus names (Chingford, Liverpool Street, Barking Riverside,
  // Gospel Oak) are disjoint.
  const dest = arrival.destinationName.toLowerCase();
  const northTerm = viewpoint.directions.north.terminusName.toLowerCase();
  if (dest.includes(northTerm)) return 'north';
  return 'south';
}
