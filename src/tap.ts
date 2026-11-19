import type { BridgeEvent } from './bridge';
import type { Direction } from './direction';
import type { Viewpoint } from './viewpoints';
import { haversineMetres } from './walkingTime';

/** A pass is offered from this many seconds before the train is due. */
export const TAP_LEAD_SECONDS = 30;
/** ...and stays tappable this many seconds after the predicted time. */
export const TAP_LINGER_SECONDS = 45;

/** Within this of the spot counts as there: the button only shows there, and
 *  each tap says whether the phone was (Ben, 2026-11-19: 100 m, to allow for
 *  a phone's location being a little off). */
export const AT_VIEWPOINT_METRES = 100;

export const LEVELS: readonly { name: string; taps: number; kit: string }[] = [
  { name: 'Spotter', taps: 1, kit: 'Notebook at the ready.' },
  { name: 'Guard', taps: 5, kit: 'Whistle and flag at the ready.' },
  { name: 'Signaller', taps: 15, kit: 'Keys to the signal box.' },
  { name: 'Driver', taps: 30, kit: 'Cap on, timetable in hand.' },
  { name: 'Station Master', taps: 60, kit: 'Top hat optional.' },
];

export interface TapPass {
  viewpointId: string;
  direction: Direction;
  vehicleId: string | null;
  berthTrainId: string | null;
  destination: string;
  shownAtMs: number;
  predictedAtShowMs: number;
  latestPredictedMs: number;
}

/** A tap is only worth offering where the app's time is an estimate to test:
 *  not for freight, and not at a station viewpoint whose offset is zero (there
 *  the time is TfL's own figure, with nothing of ours to check). */
export function canOfferTap(
  viewpoint: Viewpoint,
  direction: Direction,
  hero: BridgeEvent | undefined,
): boolean {
  if (!hero) return false;
  if (hero.arrival.category === 'freight') return false;
  const atStation =
    viewpoint.positionModel === 'station' && viewpoint.directions[direction].offsetSeconds === 0;
  return !atStation;
}

/** True where this viewpoint has a timing of ours to tune in either direction.
 *  Unlike canOfferTap it does not depend on which train is showing, so the
 *  ticket strip does not come and go with the trains. */
export function canTuneViewpoint(viewpoint: Viewpoint): boolean {
  if (viewpoint.positionModel !== 'station') return true;
  return (['north', 'south'] as const).some((d) => viewpoint.directions[d].offsetSeconds !== 0);
}

export function updatePass(
  current: TapPass | null,
  input: {
    viewpoint: Viewpoint;
    direction: Direction;
    hero: BridgeEvent | undefined;
    berthTrainId: string | null;
    nowMs: number;
  },
): TapPass | null {
  const { viewpoint, direction, hero, berthTrainId, nowMs } = input;
  const offerable = canOfferTap(viewpoint, direction, hero);

  if (current) {
    if (current.viewpointId !== viewpoint.id || current.direction !== direction) return null;
    const sameTrain =
      current.vehicleId !== null && hero?.arrival.vehicleId === current.vehicleId;
    if (offerable && hero && sameTrain && hero.bridgeTimeSeconds >= -TAP_LINGER_SECONDS) {
      return { ...current, latestPredictedMs: nowMs + hero.bridgeTimeSeconds * 1000 };
    }
    // Once the card is counting down a different, later train, a button left
    // over from the last one reads as "tap for this one", so it goes at the
    // predicted time instead of lingering.
    const laterTrainShown = hero !== undefined && !sameTrain && hero.bridgeTimeSeconds > TAP_LEAD_SECONDS;
    const holdUntilMs = current.latestPredictedMs + (laterTrainShown ? 0 : TAP_LINGER_SECONDS * 1000);
    if (nowMs <= holdUntilMs) return current;
  }

  if (!offerable || !hero) return null;
  const t = hero.bridgeTimeSeconds;
  if (t > TAP_LEAD_SECONDS || t < -TAP_LINGER_SECONDS) return null;
  const predictedMs = nowMs + t * 1000;
  return {
    viewpointId: viewpoint.id,
    direction,
    vehicleId: hero.arrival.vehicleId ?? null,
    berthTrainId,
    destination: tidyDestination(hero.arrival.destinationName),
    shownAtMs: nowMs,
    predictedAtShowMs: predictedMs,
    latestPredictedMs: predictedMs,
  };
}

/** TfL's destination as a person would say it: "London Liverpool Street Rail
 *  Station" becomes "Liverpool Street". */
export function tidyDestination(name: string): string {
  let tidy = name.replace(/\s+/g, ' ').trim();
  tidy = tidy.replace(/ (rail )?station$/i, '').trim();
  const withoutLondon = tidy.replace(/^london /i, '').trim();
  if (withoutLondon) tidy = withoutLondon;
  return tidy || name.trim();
}

export function passKey(pass: TapPass): string {
  return `${pass.viewpointId}|${pass.direction}|${pass.predictedAtShowMs}`;
}

export function levelFor(taps: number): {
  name: string | null;
  next: { name: string; taps: number } | null;
  stepsDone: number;
  stepsTotal: number;
} {
  let idx = -1;
  LEVELS.forEach((l, i) => {
    if (taps >= l.taps) idx = i;
  });
  const nextLevel = LEVELS[idx + 1];
  const floor = idx >= 0 ? LEVELS[idx].taps : 0;
  return {
    name: idx >= 0 ? LEVELS[idx].name : null,
    next: nextLevel ? { name: nextLevel.name, taps: nextLevel.taps } : null,
    stepsDone: taps - floor,
    stepsTotal: nextLevel ? nextLevel.taps - floor : 0,
  };
}

/** The grade reached by this tap, or null when the tap did not cross a threshold. */
export function promotionFor(
  tapsBefore: number,
  tapsAfter: number,
): { name: string; kit: string } | null {
  const reached = LEVELS.find((l) => tapsBefore < l.taps && tapsAfter >= l.taps);
  return reached ? { name: reached.name, kit: reached.kit } : null;
}

export function atViewpoint(
  position: { lat: number; lng: number } | null,
  coords: { lat: number; lng: number },
): 'yes' | 'no' | 'unknown' {
  if (!position) return 'unknown';
  return haversineMetres(position, coords) <= AT_VIEWPOINT_METRES ? 'yes' : 'no';
}
