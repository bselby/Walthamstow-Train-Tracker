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
  const step = steps.find((s) => s.fromBerth === event.fromBerth && s.toBerth === event.toBerth);
  if (!step) return null;
  return event.timestamp + step.secondsToViewpoint * 1000;
}

/** The ETA if it should still drive the countdown at `nowMs`, else undefined. */
export function liveBerthEta(etaMs: number | undefined, nowMs: number): number | undefined {
  if (etaMs === undefined) return undefined;
  return nowMs <= etaMs + BERTH_ETA_GRACE_MS ? etaMs : undefined;
}
