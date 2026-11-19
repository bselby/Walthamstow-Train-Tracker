import type { Direction } from './direction';
import type { Viewpoint, PositionModel } from './viewpoints';

const MAX_REASONABLE_SECONDS = 30 * 60;
/** How long the train stays on the diagram after it has passed the spot. */
const AFTER_PASS_SECONDS = 30;

interface Knot {
  /** Seconds until the train reaches the spot. */
  t: number;
  /** Position along the line, in stop indices. */
  x: number;
}

/**
 * Where the train is on a spot's line diagram, in stop indices, given the
 * countdown to the spot itself (the same figure the big number shows, berth
 * steps included). Driving the diagram from the countdown means the train
 * reaches the You pin exactly when the card says NOW, whatever the spot's
 * offset from its TfL station.
 *
 * Returns null more than 30 minutes out, and once the train has moved on
 * past the spot.
 */
export function positionAtCountdown(
  countdownSeconds: number,
  direction: Direction,
  viewpoint: Viewpoint,
): number | null {
  if (countdownSeconds > MAX_REASONABLE_SECONDS) return null;
  if (countdownSeconds < 0) return afterPass(-countdownSeconds, direction, viewpoint);

  const knots = approachKnots(direction, viewpoint);
  for (let i = 1; i < knots.length; i++) {
    const near = knots[i - 1];
    const far = knots[i];
    if (countdownSeconds <= far.t) {
      const progress = (countdownSeconds - near.t) / (far.t - near.t);
      return near.x + progress * (far.x - near.x);
    }
  }
  return knots[knots.length - 1].x;
}

/** Seconds between two stops next to each other. */
function segmentSeconds(viewpoint: Viewpoint, a: number, b: number): number {
  return viewpoint.segments[Math.min(a, b)].seconds;
}

/** The pin, then each station back along the line the train comes from, with
 *  the time from there to the spot. Station times come from the spot's offset
 *  from its anchor station plus the running times between stations. */
function approachKnots(direction: Direction, viewpoint: Viewpoint): Knot[] {
  const { anchorIndex: anchor, pinPosition: pin, stops } = viewpoint;
  const offset = viewpoint.directions[direction].offsetSeconds;
  const step = direction === 'north' ? -1 : 1; // walking back against travel
  const first = direction === 'north' ? Math.ceil(pin) - 1 : Math.floor(pin) + 1;

  const knots: Knot[] = [{ t: 0, x: pin }];
  for (let i = first; i >= 0 && i < stops.length; i += step) {
    // Seconds from station i to the anchor station (negative once i is past it).
    let between = 0;
    for (let j = Math.min(i, anchor); j < Math.max(i, anchor); j++) between += viewpoint.segments[j].seconds;
    const toAnchor = isBefore(i, anchor, direction) ? between : -between;
    const prev = knots[knots.length - 1].t;
    // Keep time rising as the stations get further away, even if the hand
    // tuned offset and the rough running times disagree.
    knots.push({ t: Math.max(toAnchor + offset, prev + 1), x: i });
  }
  return knots;
}

/** True when stop a comes before stop b in the direction of travel. */
function isBefore(a: number, b: number, direction: Direction): boolean {
  return direction === 'north' ? a < b : a > b;
}

/** After the pass: at a station, the train waits at the platform; at a bridge,
 *  it moves on towards the next station. Either way it goes after 30 s, or on
 *  reaching that station if sooner. */
function afterPass(secondsSince: number, direction: Direction, viewpoint: Viewpoint): number | null {
  if (secondsSince > AFTER_PASS_SECONDS) return null;
  const { anchorIndex: anchor, pinPosition: pin } = viewpoint;
  if (Number.isInteger(pin)) return pin;

  const next = direction === 'north' ? Math.ceil(pin) : Math.floor(pin);
  const offset = viewpoint.directions[direction].offsetSeconds;
  const toNext =
    next === anchor
      ? Math.abs(offset)
      : segmentSeconds(viewpoint, Math.floor(pin), Math.ceil(pin)) * Math.abs(next - pin);
  if (secondsSince > toNext) return null;
  return pin + (next - pin) * (secondsSince / toNext);
}

// Export for tests / future use.
export type { PositionModel };
