import { describe, it, expect } from 'vitest';
import { buildHomeModel, homeRowOrder } from '../src/homeModel';
import { applyStopArrivals, type HomeSnapshots } from '../src/homeArrivals';
import { AREAS, VIEWPOINTS, getViewpointById, type Viewpoint } from '../src/viewpoints';
import type { GeolocationState } from '../src/geolocation';
import type { Arrival } from '../src/tfl';

const NOW = Date.parse('2026-11-17T12:00:00Z');
// ~20 m from Queens Road station; Northcote Road ~620 m, East Avenue ~680 m.
const HERE = { lat: 51.5816, lng: -0.0240 };
const IDLE: GeolocationState = { status: 'idle', position: null };

function arr(overrides: Partial<Arrival> = {}): Arrival {
  return {
    id: 'a', stationName: 'Station', lineId: 'suffragette', destinationName: 'Somewhere',
    timeToStation: 120, expectedArrival: new Date(NOW + 120_000).toISOString(),
    modeName: 'overground', platformName: 'Platform 1', direction: 'outbound',
    ...overrides,
  };
}

function qrDueIn(seconds: number): HomeSnapshots {
  return applyStopArrivals({}, [getViewpointById('queens-road')!], '910GWLTHQRD', [arr({ timeToStation: seconds })], NOW);
}

function allDue(): HomeSnapshots {
  let s = applyStopArrivals({}, VIEWPOINTS, '910GWLTHQRD', [arr({ timeToStation: 600 })], NOW);
  s = applyStopArrivals(s, VIEWPOINTS, '910GWLTWCEN', [arr({ lineId: 'weaver', expectedArrival: new Date(NOW + 600_000).toISOString() })], NOW);
  return s;
}

function build(overrides: Partial<Parameters<typeof buildHomeModel>[0]> = {}) {
  return buildHomeModel({
    viewpoints: VIEWPOINTS,
    areas: AREAS,
    favouriteIds: [],
    locationEnabled: false,
    locationAsked: true,
    geo: IDLE,
    snapshots: {},
    lastPollFailed: false,
    nowMs: NOW,
    ...overrides,
  });
}

describe('buildHomeModel', () => {
  it('asks about location on a first visit, until it has been answered', () => {
    expect(build({ locationAsked: false }).location).toBe('ask');
    expect(build({ locationAsked: true }).location).toBe('off');
    // Once location is on, the question is moot.
    expect(build({ locationAsked: false, locationEnabled: true, geo: { status: 'granted', position: HERE } }).location).toBe('on');
  });

  it('no location: all spots by name, no walking labels', () => {
    const m = build();
    expect(m.groups[0].title).toBe('All spots');
    expect(m.groups[0].rows.map((r) => r.name)).toEqual(['East Avenue Bridge', 'Northcote Road Bridge', 'Queens Road Station']);
    expect(m.groups[0].rows.every((r) => r.walk === null)).toBe(true);
    expect(m.favourites).toEqual([]);
    expect(m.location).toBe('off');
  });

  it('a position held from before is not used once location is off', () => {
    const m = build({ locationEnabled: false, geo: { status: 'idle', position: HERE } });
    expect(m.location).toBe('off');
    expect(m.groups[0].title).toBe('All spots');
    expect(m.groups[0].rows.every((r) => r.walk === null)).toBe(true);
  });

  it('with a position: nearest first, with walking labels', () => {
    const m = build({ locationEnabled: true, geo: { status: 'granted', position: HERE } });
    expect(m.groups[0].title).toBe('Near you');
    expect(m.location).toBe('on');
    expect(m.groups[0].rows.map((r) => r.id)).toEqual(['queens-road', 'northcote-rd', 'east-ave']);
    expect(m.groups[0].rows[0].walk).toBe("You're here");
    expect(m.groups[0].rows[1].walk).toMatch(/^\d+ min walk$/);
  });

  it('favourites sit on top in saved order and are not repeated below', () => {
    const m = build({ favouriteIds: ['northcote-rd', 'east-ave'], locationEnabled: true, geo: { status: 'granted', position: HERE } });
    expect(m.favourites.map((r) => r.id)).toEqual(['northcote-rd', 'east-ave']);
    expect(m.groups[0].rows.map((r) => r.id)).toEqual(['queens-road']);
    expect(m.favourites.every((r) => r.favourite)).toBe(true);
    expect(m.groups[0].rows.every((r) => !r.favourite)).toBe(true);
    expect(m.favourites[0].walk).toMatch(/min walk$/);
  });

  it('a favourite id no longer in the data is skipped', () => {
    const m = build({ favouriteIds: ['gone', 'east-ave'] });
    expect(m.favourites.map((r) => r.id)).toEqual(['east-ave']);
    expect(m.groups[0].rows.length).toBe(2);
  });

  it.each([
    ['locating', null, 'locating'],
    ['denied', null, 'denied'],
    ['no-signal', null, 'no-signal'],
    ['unavailable', null, 'unavailable'],
    ['idle', HERE, 'on'],
    ['no-signal', HERE, 'on'],
    ['idle', null, 'locating'],
  ] as const)('enabled with status %s and position %o → %s, list still shown', (status, position, expected) => {
    const m = build({ locationEnabled: true, geo: { status, position } });
    expect(m.location).toBe(expected);
    expect(m.groups[0].rows.length).toBe(3);
    expect(m.groups[0].title).toBe(position === null ? 'All spots' : 'Near you');
  });

  it('row links, line and countdown text', () => {
    const m = build({ snapshots: qrDueIn(125) });
    const qr = m.groups[0].rows.find((r) => r.id === 'queens-road')!;
    expect(qr.href).toBe('/walthamstow/queens-road-station');
    expect(qr.lineName).toBe('Suffragette');
    expect(qr.lineColor).toBe(getViewpointById('queens-road')!.lineColor);
    expect(qr.countdown).toEqual({ kind: 'minutes', text: '2 min' });
    expect(m.groups[0].rows.find((r) => r.id === 'east-ave')!.countdown).toEqual({ kind: 'loading', text: '…' });
  });

  it.each([
    [45, { kind: 'seconds', text: '45 sec' }],
    [5, { kind: 'now', text: 'NOW' }],
  ] as const)('a train %i s away reads as on the countdown screen', (seconds, expected) => {
    const m = build({ snapshots: qrDueIn(seconds) });
    expect(m.groups[0].rows.find((r) => r.id === 'queens-road')!.countdown).toEqual(expected);
  });

  it('no trains and stale data have their own text', () => {
    const none = applyStopArrivals({}, VIEWPOINTS, '910GWLTHQRD', [], NOW);
    expect(build({ snapshots: none }).groups[0].rows.find((r) => r.id === 'queens-road')!.countdown)
      .toEqual({ kind: 'none', text: 'No trains' });
    expect(build({ snapshots: qrDueIn(600), nowMs: NOW + 91_000 }).groups[0].rows.find((r) => r.id === 'queens-road')!.countdown)
      .toEqual({ kind: 'stale', text: '—' });
  });

  it('says so when TfL cannot be reached and a row has nothing to show', () => {
    expect(build({ lastPollFailed: true }).notice).toBe("Can't reach TfL. Trying again.");
    expect(build({ lastPollFailed: true, snapshots: allDue() }).notice).toBeNull();
    expect(build({ lastPollFailed: false }).notice).toBeNull();
  });
});

describe('homeRowOrder', () => {
  it('favourites first, then the rest by distance or by name', () => {
    expect(homeRowOrder(VIEWPOINTS, ['northcote-rd'], HERE).map((v) => v.id)).toEqual(['northcote-rd', 'queens-road', 'east-ave']);
    expect(homeRowOrder(VIEWPOINTS, [], null).map((v) => v.id)).toEqual(['east-ave', 'northcote-rd', 'queens-road']);
  });
});

const TEST_AREAS = { walthamstow: { name: 'Walthamstow' }, camden: { name: 'Camden' }, hampstead: { name: 'Hampstead' } };

function fake(id: string, place: string, name: string, lat: number, lng: number, stopPointId = `stop-${id}`): Viewpoint {
  return { ...getViewpointById('queens-road')!, id, place, name, coords: { lat, lng }, stopPointId };
}

// Camden ~8 km from HERE, Hampstead ~10 km.
const CAM1 = fake('cam1', 'camden', 'Camden Lock', 51.5416, -0.1426);
const CAM2 = fake('cam2', 'camden', 'Chalk Farm', 51.5441, -0.1538);
const HAM1 = fake('ham1', 'hampstead', 'Hampstead Heath', 51.5560, -0.1780);
const MULTI = [...VIEWPOINTS, HAM1, CAM2, CAM1];
const LOC_ON = { locationEnabled: true, geo: { status: 'granted', position: HERE } as GeolocationState };
const keys = (m: ReturnType<typeof build>) => m.groups.map((g) => g.key);

describe('areas', () => {
  it('one area: same sections as today', () => {
    expect(build({ areas: TEST_AREAS }).groups.map((g) => [g.key, g.title])).toEqual([['all', 'All spots']]);
    expect(build({ areas: TEST_AREAS, ...LOC_ON }).groups.map((g) => [g.key, g.title])).toEqual([['near', 'Near you']]);
    expect(build({ areas: TEST_AREAS, ...LOC_ON }).groups[0].rows.map((r) => r.id)).toEqual(['queens-road', 'northcote-rd', 'east-ave']);
  });

  it('several areas, location on', () => {
    const m = build({ viewpoints: MULTI, areas: TEST_AREAS, ...LOC_ON });
    expect(keys(m)).toEqual(['near', 'area-camden', 'area-hampstead']);
    expect(m.groups[0].rows.map((r) => r.id)).toEqual(['queens-road', 'northcote-rd', 'east-ave']);
    expect(m.groups[1].title).toBe('Camden');
    expect(m.groups[1].rows.map((r) => r.id)).toEqual(['cam1', 'cam2']);
  });

  it('several areas, location off', () => {
    const m = build({ viewpoints: MULTI, areas: TEST_AREAS });
    expect(m.groups.map((g) => g.title)).toEqual(['Camden', 'Hampstead', 'Walthamstow']);
    expect(m.groups[0].rows.map((r) => r.name)).toEqual(['Camden Lock', 'Chalk Farm']);
  });

  it.each(['locating', 'denied', 'no-signal'] as const)('no fix yet (%s) groups as location off', (status) => {
    const off = build({ viewpoints: MULTI, areas: TEST_AREAS });
    const m = build({ viewpoints: MULTI, areas: TEST_AREAS, locationEnabled: true, geo: { status, position: null } });
    expect(m.groups).toEqual(off.groups);
  });

  it('a favourite appears once', () => {
    const m = build({ viewpoints: MULTI, areas: TEST_AREAS, favouriteIds: ['queens-road'], ...LOC_ON });
    expect(m.favourites.map((r) => r.id)).toEqual(['queens-road']);
    expect(m.groups.flatMap((g) => g.rows).map((r) => r.id)).not.toContain('queens-road');
  });

  it('an area with nothing left has no heading', () => {
    const m = build({ viewpoints: MULTI, areas: TEST_AREAS, favouriteIds: ['cam1', 'cam2'], ...LOC_ON });
    expect(keys(m)).toEqual(['near', 'area-hampstead']);
  });

  it('empty Near you is left out', () => {
    const far = { lat: 52.5, lng: -1.9 };
    const m = build({ viewpoints: MULTI, areas: TEST_AREAS, locationEnabled: true, geo: { status: 'granted', position: far } });
    expect(keys(m)).not.toContain('near');
    expect(m.groups.length).toBe(3);
  });

  it('rows past the poll cap have no countdown', () => {
    const many = Array.from({ length: 10 }, (_, i) => fake(`s${i}`, 'walthamstow', `Spot ${String(i).padStart(2, '0')}`, 51.58, -0.02, `stop-${i}`));
    const m = build({ viewpoints: many, areas: TEST_AREAS });
    const rows = m.groups[0].rows;
    expect(rows.slice(0, 8).every((r) => r.countdown !== null)).toBe(true);
    expect(rows.slice(8).every((r) => r.countdown === null)).toBe(true);
  });
});
