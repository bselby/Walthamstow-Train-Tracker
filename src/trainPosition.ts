import type { Direction } from './direction';
import { SEGMENTS_NORTH_OF_WC, SEGMENTS_SOUTH_OF_WC } from './stops';

const MAX_REASONABLE_SECONDS = 30 * 60;

/**
 * Estimate a train's position on the Chingford branch as a floating-point
 * index in [0, 8], given its remaining time to Walthamstow Central and
 * its direction of travel.
 *
 * Returns null when the prediction is outside the modelled range
 * (negative or more than 30 minutes away).
 */
export function estimatePosition(
  timeToStationSeconds: number,
  direction: Direction
): number | null {
  if (timeToStationSeconds < 0) return null;
  if (timeToStationSeconds > MAX_REASONABLE_SECONDS) return null;

  const segments = direction === 'south' ? SEGMENTS_NORTH_OF_WC : SEGMENTS_SOUTH_OF_WC;

  let accumulated = 0;
  for (const seg of segments) {
    if (timeToStationSeconds <= accumulated + seg.seconds) {
      const progress = (timeToStationSeconds - accumulated) / seg.seconds;
      return seg.nearIndex + progress * (seg.farIndex - seg.nearIndex);
    }
    accumulated += seg.seconds;
  }

  // Beyond all modelled segments but within the reasonable-range cap:
  // clamp to the farthest terminus in the direction of approach.
  return direction === 'south' ? 8 : 0;
}
