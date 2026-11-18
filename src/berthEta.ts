/** A signalling berth step that tells us a train is a known time from the viewpoint. */
export interface BerthStep {
  fromBerth: string;
  toBerth: string;
  /** Seconds from the step firing (the train passing that signal) to the
   *  front of the train reaching the viewpoint. Measured from the step itself,
   *  so it does not depend on the SMART platform offset or its sign. */
  secondsToViewpoint: number;
}

export interface BerthStepEvent {
  fromBerth: string;
  toBerth: string;
  /** Unix ms timestamp of the step, from the TD message. */
  timestamp: number;
  /** The train's headcode from the TD message, e.g. 2T45. */
  trainId: string;
}

/** Headcodes starting 1, 2 or 9 are passenger trains. The rest are light
 *  engines, empty stock, freight and engineering trains (0, 3 to 8), which
 *  the countdown is not about and TfL does not predict. */
export function isPassengerHeadcode(trainId: string): boolean {
  return /^[129]/.test(trainId);
}

/** How long after the predicted crossing a berth ETA keeps driving the
 *  countdown. Long enough to show NOW / just crossed for the train it was
 *  about; short enough that the following train is never shown as "just
 *  crossed" on the strength of a stale ETA. */
export const BERTH_ETA_GRACE_MS = 15_000;

/** Unix ms time the train reaches the viewpoint, or null when the step is not
 *  one this direction watches. */
export function berthEtaFromStep(
  event: BerthStepEvent,
  steps: readonly BerthStep[] | undefined,
): number | null {
  if (!steps) return null;
  if (!isPassengerHeadcode(event.trainId)) return null;
  const step = steps.find((s) => s.fromBerth === event.fromBerth && s.toBerth === event.toBerth);
  if (!step) return null;
  return event.timestamp + step.secondsToViewpoint * 1000;
}

/** The ETA if it should still drive the countdown at `nowMs`, else undefined. */
export function liveBerthEta(etaMs: number | undefined, nowMs: number): number | undefined {
  if (etaMs === undefined) return undefined;
  return nowMs <= etaMs + BERTH_ETA_GRACE_MS ? etaMs : undefined;
}

/** TfL's prediction for a train can lag the train itself by a minute or two.
 *  A prediction this close after a berth ETA is the same train, not the next. */
const SAME_TRAIN_WINDOW_MS = 3 * 60_000;
/** How long a berth ETA is remembered for that purpose. */
const BERTH_ETA_MEMORY_MS = 5 * 60_000;

/** True when a TfL-predicted crossing belongs to a train that a berth step has
 *  already timed past the viewpoint, so it must not come back as a countdown. */
export function alreadyPassedPerBerth(
  predictedCrossingMs: number,
  etaMs: number | undefined,
  nowMs: number,
): boolean {
  if (etaMs === undefined) return false;
  if (nowMs <= etaMs + BERTH_ETA_GRACE_MS) return false;
  if (nowMs > etaMs + BERTH_ETA_MEMORY_MS) return false;
  return predictedCrossingMs < etaMs + SAME_TRAIN_WINDOW_MS;
}
