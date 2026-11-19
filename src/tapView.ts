// Small pure helpers main.ts uses to wire the "train's here" tap: the view of
// one direction's slot, TfL's expected arrival for the tapped train, and the
// device id. Kept out of main.ts, which runs side effects on import.
import type { BridgeEvent } from './bridge';
import { canOfferTap, passKey, TAP_LEAD_SECONDS, type TapPass } from './tap';
import type { Direction } from './direction';
import type { Viewpoint } from './viewpoints';
import { askKind, buttonsEnabled, hasTapped, type AskKind, type TapState } from './tapStore';
import type { TapDirectionView } from './tapUi';

/**
 * One direction's slot. `thanks` while the minute after the tap runs and the
 * latest tap is the one made here (the pass itself may already have expired);
 * otherwise, at a spot that can be tuned and unless the user said no, a
 * button for an untapped pass, a placeholder until the button is due, else
 * an empty reserved slot. `none` (no slot) only
 * where timing is off.
 */
export function tapDirectionView(input: {
  pass: TapPass | null;
  tapState: TapState;
  thanksUntilMs: number | undefined;
  thanksPassKey: string | undefined;
  nowMs: number;
  /** The spot has a timing of ours to tune (canTuneViewpoint). */
  canTune: boolean;
  /** From msUntilButton: null when no button is coming for this train. */
  msUntilButton: number | null;
  /** The send of the tap being thanked failed. */
  offline: boolean;
}): TapDirectionView {
  const { pass, tapState, thanksUntilMs, thanksPassKey, nowMs } = input;
  const none: TapDirectionView = {
    state: 'none', passKey: null, destination: null, entry: null, msUntilButton: null, offline: false,
  };
  const last = tapState.lastTap;
  if (thanksUntilMs !== undefined && nowMs < thanksUntilMs && last && last.passKey === thanksPassKey) {
    return {
      ...none,
      state: 'thanks',
      passKey: last.passKey,
      destination: pass?.destination ?? null,
      entry: { tapMs: last.tapMs, predictedMs: last.predictedMs, tapsBefore: last.tapsBefore },
      offline: input.offline,
    };
  }
  if (!input.canTune || !buttonsEnabled(tapState)) return none;
  // From here timing is on at this spot: the slot is always drawn, empty
  // ('reserved') when there is nothing to show, so the card never changes height.
  const reserved: TapDirectionView = { ...none, state: 'reserved' };
  if (pass) {
    const key = passKey(pass);
    if (!hasTapped(tapState, key)) {
      return { ...none, state: 'button', passKey: key, destination: pass.destination };
    }
    return reserved;
  }
  // Anyone who hasn't said no (helping, or not yet answered) sees when the
  // button comes, so the reserved space is never blank while a train is due.
  if (input.msUntilButton !== null && input.msUntilButton > 0) {
    return { ...none, state: 'placeholder', msUntilButton: input.msUntilButton };
  }
  return reserved;
}

/**
 * Who sees the full help box. A newcomer sees it once, in the card whose
 * button opens first; the other card's slot stays, empty, at the same fixed
 * height, so nothing on the page moves on those visits. Everyone else gets no
 * slot at all while waiting: the space closes up, and the button opens it
 * when it is due, pushing what is below it down (Ben, 2026-11-19).
 */
export function settleHelpBoxes(
  views: Record<Direction, TapDirectionView>,
  fullBox: boolean,
): Record<Direction, TapDirectionView> {
  const empty = (v: TapDirectionView): TapDirectionView =>
    v.state === 'placeholder' ? { ...v, state: 'reserved', msUntilButton: null } : v;
  const closed = (v: TapDirectionView): TapDirectionView =>
    v.state === 'placeholder' || v.state === 'reserved' ? { ...v, state: 'none', msUntilButton: null } : v;
  const { north, south } = views;
  if (!fullBox) return { north: closed(north), south: closed(south) };
  if (north.state === 'placeholder' && south.state === 'placeholder') {
    const southFirst = (south.msUntilButton ?? Infinity) < (north.msUntilButton ?? Infinity);
    return southFirst ? { north: empty(north), south } : { north, south: empty(south) };
  }
  return { north, south };
}

/** How long until this train's button opens, or null when it will get none
 *  (no train, freight, or a spot with nothing of ours to check). */
export function msUntilButton(
  viewpoint: Viewpoint,
  direction: Direction,
  hero: BridgeEvent | undefined,
): number | null {
  if (!hero || !canOfferTap(viewpoint, direction, hero)) return null;
  return Math.max(0, (hero.bridgeTimeSeconds - TAP_LEAD_SECONDS) * 1000);
}

/** The ask card below the cards: none where no tap can be offered, and none
 *  while a thank-you shows. */
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
