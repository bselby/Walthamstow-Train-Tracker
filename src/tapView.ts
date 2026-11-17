// Small pure helpers main.ts uses to wire the "train's here" tap: the view of
// one direction's slot, TfL's expected arrival for the tapped train, and the
// device id. Kept out of main.ts, which runs side effects on import.
import type { BridgeEvent } from './bridge';
import { passKey, type TapPass } from './tap';
import { askKind, buttonsEnabled, hasTapped, type AskKind, type TapState } from './tapStore';
import type { TapDirectionView } from './tapUi';

/**
 * One direction's slot. `thanks` while the minute after the tap runs and the
 * latest tap is the one made here (the pass itself may already have expired);
 * otherwise a button for an untapped pass, unless the user said "Not now".
 */
export function tapDirectionView(input: {
  pass: TapPass | null;
  tapState: TapState;
  thanksUntilMs: number | undefined;
  thanksPassKey: string | undefined;
  nowMs: number;
}): TapDirectionView {
  const { pass, tapState, thanksUntilMs, thanksPassKey, nowMs } = input;
  const last = tapState.lastTap;
  if (thanksUntilMs !== undefined && nowMs < thanksUntilMs && last && last.passKey === thanksPassKey) {
    return {
      state: 'thanks',
      passKey: last.passKey,
      destination: pass?.destination ?? null,
      entry: { tapMs: last.tapMs, predictedMs: last.predictedMs, tapsBefore: last.tapsBefore },
    };
  }
  if (pass && buttonsEnabled(tapState)) {
    const key = passKey(pass);
    if (!hasTapped(tapState, key)) {
      return { state: 'button', passKey: key, destination: pass.destination, entry: null };
    }
  }
  return { state: 'none', passKey: null, destination: null, entry: null };
}

/** The ask card below the panels: none where no tap can be offered, and none
 *  while a thank-you shows, since both would carry the same ticket. */
export function tapAsk(input: {
  tapState: TapState;
  nowMs: number;
  offerable: boolean;
  views: readonly TapDirectionView[];
}): AskKind {
  if (!input.offerable) return null;
  if (input.views.some((v) => v.state === 'thanks')) return null;
  return askKind(input.tapState, input.nowMs);
}

/** TfL's expected arrival (Unix ms) for this vehicle in the snapshot, or null. */
export function tflExpectedArrivalMs(
  events: readonly BridgeEvent[] | undefined,
  vehicleId: string | null,
): number | null {
  if (!events || vehicleId === null) return null;
  const match = events.find((e) => e.arrival.vehicleId === vehicleId);
  if (!match) return null;
  const ms = Date.parse(match.arrival.expectedArrival);
  return Number.isFinite(ms) ? ms : null;
}

/** A random device id matching /^[a-z0-9-]{8,64}$/. */
export function newDeviceId(
  randomUUID: (() => string) | undefined = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? () => crypto.randomUUID()
    : undefined,
): string {
  if (randomUUID) return randomUUID().toLowerCase();
  const part = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `${part()}-${part()}-${part()}`;
}
