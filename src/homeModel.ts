// What the home screen shows: favourites first, in the order they were
// starred, then every other spot, nearest first when a location is held and
// by name when it is not. Pure.
import { formatCountdown } from './display';
import type { GeolocationState } from './geolocation';
import { nextTrain, type HomeSnapshots } from './homeArrivals';
import { viewpointPath } from './routes';
import type { Viewpoint } from './viewpoints';
import { formatWalkShort, haversineMetres, walkingEstimate, type LatLng } from './walkingTime';

export interface HomeRow {
  id: string;
  name: string;
  lineName: string;
  lineColor: string;
  href: string;
  /** Walking time from the user, or null when no location is held. */
  walk: string | null;
  countdown: { kind: 'loading' | 'stale' | 'none' | 'now' | 'seconds' | 'minutes'; text: string };
  favourite: boolean;
}

/** 'ask' = a first visit: the question about walking times, not yet answered. */
export type HomeLocation = 'ask' | 'off' | 'locating' | 'on' | 'denied' | 'no-signal' | 'unavailable';

export interface HomeModel {
  favourites: HomeRow[];
  others: HomeRow[];
  othersTitle: 'Near you' | 'All spots';
  location: HomeLocation;
  notice: string | null;
}

export interface HomeInput {
  viewpoints: readonly Viewpoint[];
  favouriteIds: readonly string[];
  locationEnabled: boolean;
  /** The first-visit question has been answered, either way. */
  locationAsked: boolean;
  geo: GeolocationState;
  snapshots: HomeSnapshots;
  /** The latest poll reached none of its stops. */
  lastPollFailed: boolean;
  nowMs: number;
}

function split(viewpoints: readonly Viewpoint[], favouriteIds: readonly string[], position: LatLng | null) {
  const favourites: Viewpoint[] = [];
  for (const id of favouriteIds) {
    const v = viewpoints.find((x) => x.id === id);
    if (v && !favourites.includes(v)) favourites.push(v);
  }
  const others = viewpoints.filter((v) => !favourites.includes(v));
  if (position) {
    others.sort((a, b) => haversineMetres(position, a.coords) - haversineMetres(position, b.coords));
  } else {
    others.sort((a, b) => a.name.localeCompare(b.name));
  }
  return { favourites, others };
}

/** Rows top to bottom. The poller uses this so its cap on stops follows what
 *  is on screen. */
export function homeRowOrder(
  viewpoints: readonly Viewpoint[],
  favouriteIds: readonly string[],
  position: LatLng | null,
): Viewpoint[] {
  const { favourites, others } = split(viewpoints, favouriteIds, position);
  return [...favourites, ...others];
}

function locationState(enabled: boolean, asked: boolean, geo: GeolocationState): HomeLocation {
  if (!enabled) return asked ? 'off' : 'ask';
  if (geo.status === 'unavailable') return 'unavailable';
  // A fix from a moment ago is still good while the watch restarts.
  if (geo.position !== null) return 'on';
  if (geo.status === 'denied') return 'denied';
  if (geo.status === 'no-signal') return 'no-signal';
  return 'locating';
}

function countdownFor(entry: HomeSnapshots[string] | undefined, nowMs: number): HomeRow['countdown'] {
  const next = nextTrain(entry, nowMs);
  if (next.state === 'loading') return { kind: 'loading', text: '…' };
  if (next.state === 'stale') return { kind: 'stale', text: '—' };
  if (next.state === 'none') return { kind: 'none', text: 'No trains' };
  const label = formatCountdown(next.seconds);
  // nextTrain never returns a train that has passed, so this is never 'just-crossed'.
  return { kind: label.kind === 'just-crossed' ? 'now' : label.kind, text: label.text };
}

export function buildHomeModel(input: HomeInput): HomeModel {
  const { viewpoints, favouriteIds, locationEnabled, locationAsked, geo, snapshots, lastPollFailed, nowMs } = input;
  const location = locationState(locationEnabled, locationAsked, geo);
  const position = location === 'on' ? geo.position : null;
  const { favourites, others } = split(viewpoints, favouriteIds, position);

  const row = (v: Viewpoint, favourite: boolean): HomeRow => ({
    id: v.id,
    name: v.name,
    lineName: v.lineName,
    lineColor: v.lineColor,
    href: viewpointPath(v),
    walk: position ? formatWalkShort(walkingEstimate(position, v.coords)) : null,
    countdown: countdownFor(snapshots[v.id], nowMs),
    favourite,
  });

  const favouriteRows = favourites.map((v) => row(v, true));
  const otherRows = others.map((v) => row(v, false));
  const blank = [...favouriteRows, ...otherRows].some(
    (r) => r.countdown.kind === 'loading' || r.countdown.kind === 'stale',
  );

  return {
    favourites: favouriteRows,
    others: otherRows,
    othersTitle: position ? 'Near you' : 'All spots',
    location,
    notice: lastPollFailed && blank ? "Can't reach TfL. Trying again." : null,
  };
}
