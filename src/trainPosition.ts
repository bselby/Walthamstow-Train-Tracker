import type { Direction } from './direction';
import type { Viewpoint, PositionModel } from './viewpoints';

const MAX_REASONABLE_SECONDS = 30 * 60;
const POST_ARRIVAL_WINDOW_SECONDS = 30;

// East-Ave-bridge-specific constants (three-phase northbound: dwell → cross → continue).
const EAST_AVE_BRIDGE_POSITION = 5.5; // between WC (index 5) and Wood Street (index 6)
const EAST_AVE_NB_DWELL_SECONDS = 30;
const EAST_AVE_NB_WC_TO_BRIDGE_SECONDS = 60;
const EAST_AVE_NB_BRIDGE_TO_WDS_SECONDS = 30;
const EAST_AVE_NB_TOTAL_POST_WC_SECONDS =
  EAST_AVE_NB_DWELL_SECONDS + EAST_AVE_NB_WC_TO_BRIDGE_SECONDS + EAST_AVE_NB_BRIDGE_TO_WDS_SECONDS; // = 120

/**
 * Estimate a train's position on a viewpoint's strip as a floating-point
 * index in [0, stops.length - 1], given its remaining timeToStation and
 * direction of travel.
 *
 * Returns null when the prediction falls outside the modelled window (either
 * too-far-future or past the post-arrival window).
 */
export function estimatePosition(
  timeToStationSeconds: number,
  direction: Direction,
  viewpoint: Viewpoint,
): number | null {
  if (timeToStationSeconds > MAX_REASONABLE_SECONDS) return null;

  // Post-arrival: train has reached (or passed) the anchor station.
  if (timeToStationSeconds < 0) {
    return postArrivalPosition(timeToStationSeconds, direction, viewpoint);
  }

  // Pre-arrival: interpolate along segments from the approaching side.
  return preArrivalPosition(timeToStationSeconds, direction, viewpoint);
}

function preArrivalPosition(tts: number, direction: Direction, viewpoint: Viewpoint): number {
  const { stops, segments, anchorIndex } = viewpoint;
  const lastIndex = stops.length - 1;

  // Northbound trains approach the anchor from lower indices (south-ish on strip).
  // Southbound trains approach from higher indices.
  // Build a list of segments to step through, starting at the anchor and walking
  // AWAY from it in the approach direction.
  const segmentsToWalk =
    direction === 'north'
      ? [...segments].reverse().filter((s) => s.farIndex <= anchorIndex)
      : segments.filter((s) => s.nearIndex >= anchorIndex);

  let accumulated = 0;
  for (const seg of segmentsToWalk) {
    // tts is TIME REMAINING to the anchor, so higher tts = further from anchor.
    // At tts=accumulated the train has just crossed from this segment into the one
    // closer to the anchor, so its position = `toward` (the anchor-side endpoint).
    // At tts=accumulated+seg.seconds the train is about to enter this segment from
    // the far side, so position = `away`.
    const toward = direction === 'north' ? seg.farIndex : seg.nearIndex;
    const away = direction === 'north' ? seg.nearIndex : seg.farIndex;

    if (tts <= accumulated + seg.seconds) {
      const progress = (tts - accumulated) / seg.seconds;
      return toward + progress * (away - toward);
    }
    accumulated += seg.seconds;
  }

  // Beyond all modelled segments: clamp to the far terminus.
  return direction === 'north' ? 0 : lastIndex;
}

function postArrivalPosition(tts: number, direction: Direction, viewpoint: Viewpoint): number | null {
  if (viewpoint.positionModel === 'east-ave-bridge') {
    return eastAveBridgePostArrival(tts, direction, viewpoint);
  }
  // 'station' model: both directions park at the anchor for a short post-arrival window.
  if (tts < -POST_ARRIVAL_WINDOW_SECONDS) return null;
  return viewpoint.anchorIndex;
}

function eastAveBridgePostArrival(tts: number, direction: Direction, viewpoint: Viewpoint): number | null {
  if (direction === 'south') {
    // Southbound has already crossed the bridge before reaching WC — park briefly at WC.
    if (tts < -POST_ARRIVAL_WINDOW_SECONDS) return null;
    return viewpoint.anchorIndex;
  }
  // Northbound: three-phase model.
  if (tts < -EAST_AVE_NB_TOTAL_POST_WC_SECONDS) return null;
  const elapsed = -tts;

  // Phase 1: dwelling at WC.
  if (elapsed <= EAST_AVE_NB_DWELL_SECONDS) return viewpoint.anchorIndex;

  // Phase 2: moving from WC to the bridge.
  const postDwell = elapsed - EAST_AVE_NB_DWELL_SECONDS;
  if (postDwell <= EAST_AVE_NB_WC_TO_BRIDGE_SECONDS) {
    const progress = postDwell / EAST_AVE_NB_WC_TO_BRIDGE_SECONDS;
    return viewpoint.anchorIndex + progress * (EAST_AVE_BRIDGE_POSITION - viewpoint.anchorIndex);
  }

  // Phase 3: past the bridge, continuing to Wood Street.
  const postBridge = postDwell - EAST_AVE_NB_WC_TO_BRIDGE_SECONDS;
  const progress = postBridge / EAST_AVE_NB_BRIDGE_TO_WDS_SECONDS;
  return EAST_AVE_BRIDGE_POSITION + progress * (viewpoint.anchorIndex + 1 - EAST_AVE_BRIDGE_POSITION);
}

// Export for tests / future use.
export type { PositionModel };
