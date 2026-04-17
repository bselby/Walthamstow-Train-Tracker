import type { Direction } from './direction';
import { SEGMENTS_NORTH_OF_WC, SEGMENTS_SOUTH_OF_WC } from './stops';

const MAX_REASONABLE_SECONDS = 30 * 60;

// Northbound trains, once they've arrived at WC (tts=0), continue north toward
// Wood Street. The bridge-crossing happens ~90s after WC arrival, and the
// train reaches Wood Street ~120s after WC. During this post-WC window
// `pickNextPerDirection` keeps the train in scope (bridgeTime >= -30 ≡ tts >= -120).
const NORTHBOUND_POST_WC_SECONDS = 120;

// Southbound trains briefly remain in scope after arriving at WC (bridgeTime >= -30
// ≡ tts >= -10). During that short window we park the train at WC rather than
// modelling continuation toward St James Street — the moment is too brief to glide.
const SOUTHBOUND_POST_WC_SECONDS = 30;

/**
 * Estimate a train's position on the Chingford branch as a floating-point
 * index in [0, 8], given its remaining time to Walthamstow Central and
 * its direction of travel.
 *
 * Returns null when the prediction is outside the modelled range.
 * Negative `timeToStationSeconds` values are allowed:
 *   - Northbound: tts ∈ [-120, 0] maps to position [5, 6] (train continuing past WC).
 *   - Southbound: tts ∈ [-30, 0] parks the train at WC (position 5).
 */
export function estimatePosition(
  timeToStationSeconds: number,
  direction: Direction
): number | null {
  if (timeToStationSeconds > MAX_REASONABLE_SECONDS) return null;

  // Post-WC extension: train has arrived at Walthamstow Central and is continuing.
  if (timeToStationSeconds < 0) {
    if (direction === 'north') {
      if (timeToStationSeconds < -NORTHBOUND_POST_WC_SECONDS) return null;
      const progress = -timeToStationSeconds / NORTHBOUND_POST_WC_SECONDS;
      return 5 + progress * (6 - 5);
    }
    // Southbound
    if (timeToStationSeconds < -SOUTHBOUND_POST_WC_SECONDS) return null;
    return 5;
  }

  // Normal case: train is still approaching WC.
  const segments = direction === 'south' ? SEGMENTS_NORTH_OF_WC : SEGMENTS_SOUTH_OF_WC;

  let accumulated = 0;
  for (const seg of segments) {
    if (timeToStationSeconds <= accumulated + seg.seconds) {
      const progress = (timeToStationSeconds - accumulated) / seg.seconds;
      return seg.nearIndex + progress * (seg.farIndex - seg.nearIndex);
    }
    accumulated += seg.seconds;
  }

  // Beyond all modelled pre-WC segments but within the reasonable-range cap:
  // clamp to the farthest terminus in the direction of approach.
  return direction === 'south' ? 8 : 0;
}
