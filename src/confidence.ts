/**
 * Confidence model for the NOW ring.
 *
 * confidence = freshness × stability, both bounded in [floor, 1.0].
 *   - freshness decays with data age (lastFetchMs)
 *   - stability measures how consistent the same vehicle's timeToStation has
 *     been across recent polls. A healthy prediction should drop by roughly the
 *     poll interval each tick; big deviations mean TfL is reshuffling the schedule.
 *
 * Both cold-start at 1.0 so a fresh session never looks untrustworthy.
 */

export interface PredictionSample {
  vehicleId: string;
  timeToStation: number;
  fetchedAtMs: number;
}

const FRESHNESS_FULL_MS = 30_000;
const FRESHNESS_MIN_MS = 90_000;
const FRESHNESS_FLOOR = 0.3;

export function computeFreshness(ageMs: number): number {
  if (ageMs <= FRESHNESS_FULL_MS) return 1.0;
  if (ageMs >= FRESHNESS_MIN_MS) return FRESHNESS_FLOOR;
  const t = (ageMs - FRESHNESS_FULL_MS) / (FRESHNESS_MIN_MS - FRESHNESS_FULL_MS);
  return 1.0 - t * (1.0 - FRESHNESS_FLOOR);
}

const STABILITY_LOW_DRIFT_S = 5;
const STABILITY_HIGH_DRIFT_S = 15;
const STABILITY_FLOOR = 0.5;
const STABILITY_MIN_SAMPLES = 3;

export function computeStability(samples: PredictionSample[]): number {
  if (samples.length < STABILITY_MIN_SAMPLES) return 1.0;

  let totalDrift = 0;
  let pairs = 0;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const expectedDeltaS = (curr.fetchedAtMs - prev.fetchedAtMs) / 1000;
    const actualDeltaS = prev.timeToStation - curr.timeToStation;
    totalDrift += Math.abs(expectedDeltaS - actualDeltaS);
    pairs += 1;
  }
  const avgDrift = totalDrift / pairs;

  if (avgDrift <= STABILITY_LOW_DRIFT_S) return 1.0;
  if (avgDrift >= STABILITY_HIGH_DRIFT_S) return STABILITY_FLOOR;
  const t = (avgDrift - STABILITY_LOW_DRIFT_S) / (STABILITY_HIGH_DRIFT_S - STABILITY_LOW_DRIFT_S);
  return 1.0 - t * (1.0 - STABILITY_FLOOR);
}

export function computeConfidence(ageMs: number, samples: PredictionSample[]): number {
  return computeFreshness(ageMs) * computeStability(samples);
}
