import type { Direction } from './direction';
import { SEGMENTS_NORTH_OF_WC, SEGMENTS_SOUTH_OF_WC } from './stops';

const MAX_REASONABLE_SECONDS = 30 * 60;

// Northbound trains dwell at Walthamstow Central for ~30s after arrival, then
// travel a further ~60s to cross the East Avenue bridge (total bridge-time
// offset = 90s, matching constants.ts NORTHBOUND_OFFSET_SECONDS). After the
// bridge, ~30s more travel before leaving our tracking window at the Wood
// Street approach. Modelling the dwell explicitly makes the train visually
// STOP at WC rather than gliding through — and means at bridgeTime=0 (the
// "NOW" celebration moment) the train actually lands on the bridge glyph.
const NORTHBOUND_DWELL_SECONDS = 30;
const NORTHBOUND_WC_TO_BRIDGE_SECONDS = 60;
const NORTHBOUND_BRIDGE_TO_WDS_SECONDS = 30;
const NORTHBOUND_POST_WC_TOTAL = NORTHBOUND_DWELL_SECONDS
  + NORTHBOUND_WC_TO_BRIDGE_SECONDS
  + NORTHBOUND_BRIDGE_TO_WDS_SECONDS; // = 120s, matches pickNextPerDirection window

// Bridge is visually drawn at strip position 5.5 (halfway between WC and Wds).
// The northbound model above parks the train there at exactly bridgeTime=0.
const BRIDGE_STRIP_POSITION = 5.5;

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
      if (timeToStationSeconds < -NORTHBOUND_POST_WC_TOTAL) return null;
      const elapsed = -timeToStationSeconds;
      // Phase 1: dwelling at WC platform.
      if (elapsed <= NORTHBOUND_DWELL_SECONDS) return 5;
      // Phase 2: departed WC, travelling to the bridge (position 5 → 5.5).
      const postDwell = elapsed - NORTHBOUND_DWELL_SECONDS;
      if (postDwell <= NORTHBOUND_WC_TO_BRIDGE_SECONDS) {
        const progress = postDwell / NORTHBOUND_WC_TO_BRIDGE_SECONDS;
        return 5 + progress * (BRIDGE_STRIP_POSITION - 5);
      }
      // Phase 3: past the bridge, continuing to Wood Street (position 5.5 → 6).
      const postBridge = postDwell - NORTHBOUND_WC_TO_BRIDGE_SECONDS;
      const progress = postBridge / NORTHBOUND_BRIDGE_TO_WDS_SECONDS;
      return BRIDGE_STRIP_POSITION + progress * (6 - BRIDGE_STRIP_POSITION);
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
