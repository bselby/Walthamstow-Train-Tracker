// What the home screen shows: favourites first, in the order they were
// starred, then every other spot, nearest first when a location is held and
// by name when it is not. Pure.
import { formatCountdown } from './display';
import type { GeolocationState } from './geolocation';
import { nextTrain, stopsToPoll, type HomeSnapshots } from './homeArrivals';
import { viewpointPath } from './routes';
import { AREAS, type Viewpoint } from './viewpoints';
import { formatWalkShort, haversineMetres, walkingEstimate, type LatLng } from './walkingTime';

export interface HomeRow {
  id: string;
  name: string;
  lineName: string;
  lineColor: string;
  href: string;
  /** Walking time from the user, or null when no location is held. */
  walk: string | null;
  /** Null when the row's stop is past the poll cap, so nothing is fetched for it. */
  countdown: { kind: 'loading' | 'stale' | 'none' | 'now' | 'seconds' | 'minutes'; text: string } | null;
  favourite: boolean;
}

/** 'ask' = a first visit: the question about walking times, not yet answered. */
export type HomeLocation = 'ask' | 'off' | 'locating' | 'on' | 'denied' | 'no-signal' | 'unavailable';

export interface HomeGroup {
  /** 'near', 'all', or a place. */
  key: string;
  title: string;
  rows: HomeRow[];
}

/** Spots at most this many seconds' walk away are under "Near you". */
export const NEAR_YOU_SECONDS = 1800;

export interface HomeModel {
  favourites: HomeRow[];
  groups: HomeGroup[];
  location: HomeLocation;
  notice: string | null;
}

export interface HomeInput {
  viewpoints: readonly Viewpoint[];
  areas: Readonly<Record<string, { name: string }>>;
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

interface Arranged {
  favourites: Viewpoint[];
  groups: { key: string; title: string; spots: Viewpoint[] }[];
}

function arrange(
  viewpoints: readonly Viewpoint[],
  favouriteIds: readonly string[],
  position: LatLng | null,
  areas: HomeInput['areas'],
): Arranged {
  const favourites: Viewpoint[] = [];
  for (const id of favouriteIds) {
    const v = viewpoints.find((x) => x.id === id);
    if (v && !favourites.includes(v)) favourites.push(v);
  }
  const rest = viewpoints.filter((v) => !favourites.includes(v));
  const dist = (v: Viewpoint) => (position ? haversineMetres(position, v.coords) : 0);
  const byDistance = (a: Viewpoint, b: Viewpoint) => dist(a) - dist(b);
  const byName = (a: Viewpoint, b: Viewpoint) => a.name.localeCompare(b.name);
  const title = (place: string) => areas[place]?.name ?? place;

  const singleArea = viewpoints.every((v) => v.place === viewpoints[0].place);
  if (singleArea) {
    if (rest.length === 0) return { favourites, groups: [] };
    return position
      ? { favourites, groups: [{ key: 'near', title: 'Near you', spots: [...rest].sort(byDistance) }] }
      : { favourites, groups: [{ key: 'all', title: 'All spots', spots: [...rest].sort(byName) }] };
  }

  const groups: Arranged['groups'] = [];
  let remaining = rest;
  if (position) {
    const near = rest.filter((v) => walkingEstimate(position, v.coords).seconds <= NEAR_YOU_SECONDS);
    if (near.length > 0) {
      groups.push({ key: 'near', title: 'Near you', spots: near.sort(byDistance) });
      remaining = rest.filter((v) => !near.includes(v));
    }
  }
  const places = [...new Set(remaining.map((v) => v.place))];
  const areaGroups = places.map((place) => {
    const spots = remaining.filter((v) => v.place === place);
    return { key: place, title: title(place), spots: spots.sort(position ? byDistance : byName) };
  });
  if (position) {
    areaGroups.sort((a, b) => dist(a.spots[0]) - dist(b.spots[0]));
  } else {
    areaGroups.sort((a, b) => a.title.localeCompare(b.title));
  }
  return { favourites, groups: [...groups, ...areaGroups] };
}

/** Rows top to bottom. The poller uses this so its cap on stops follows what
 *  is on screen. */
export function homeRowOrder(
  viewpoints: readonly Viewpoint[],
  favouriteIds: readonly string[],
  position: LatLng | null,
  areas: HomeInput['areas'] = AREAS,
): Viewpoint[] {
  const { favourites, groups } = arrange(viewpoints, favouriteIds, position, areas);
  return [...favourites, ...groups.flatMap((g) => g.spots)];
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

function countdownFor(entry: HomeSnapshots[string] | undefined, nowMs: number): NonNullable<HomeRow['countdown']> {
  const next = nextTrain(entry, nowMs);
  if (next.state === 'loading') return { kind: 'loading', text: '…' };
  if (next.state === 'stale') return { kind: 'stale', text: '—' };
  if (next.state === 'none') return { kind: 'none', text: 'No trains' };
  const label = formatCountdown(next.seconds);
  // nextTrain never returns a train that has passed, so this is never 'just-crossed'.
  return { kind: label.kind === 'just-crossed' ? 'now' : label.kind, text: label.text };
}

export function buildHomeModel(input: HomeInput): HomeModel {
  const { viewpoints, areas, favouriteIds, locationEnabled, locationAsked, geo, snapshots, lastPollFailed, nowMs } = input;
  const location = locationState(locationEnabled, locationAsked, geo);
  const position = location === 'on' ? geo.position : null;
  const { favourites, groups } = arrange(viewpoints, favouriteIds, position, areas);
  const polled = stopsToPoll(homeRowOrder(viewpoints, favouriteIds, position, areas));

  const row = (v: Viewpoint, favourite: boolean): HomeRow => ({
    id: v.id,
    name: v.name,
    lineName: v.lineName,
    lineColor: v.lineColor,
    href: viewpointPath(v),
    walk: position ? formatWalkShort(walkingEstimate(position, v.coords)) : null,
    countdown: polled.includes(v.stopPointId) ? countdownFor(snapshots[v.id], nowMs) : null,
    favourite,
  });

  const favouriteRows = favourites.map((v) => row(v, true));
  const groupRows = groups.map((g) => ({ key: g.key, title: g.title, rows: g.spots.map((v) => row(v, false)) }));
  const blank = [...favouriteRows, ...groupRows.flatMap((g) => g.rows)].some(
    (r) => r.countdown !== null && (r.countdown.kind === 'loading' || r.countdown.kind === 'stale'),
  );

  return {
    favourites: favouriteRows,
    groups: groupRows,
    location,
    notice: lastPollFailed && blank ? "Can't reach TfL. Trying again." : null,
  };
}
