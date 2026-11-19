import { describe, it, expect } from 'vitest';
import { buildHomeModel, homeRowOrder } from '../src/homeModel';
import { applyStopArrivals, type HomeSnapshots } from '../src/homeArrivals';
import { VIEWPOINTS, getViewpointById } from '../src/viewpoints';
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
    expect(m.othersTitle).toBe('All spots');
    expect(m.others.map((r) => r.name)).toEqual(['East Avenue Bridge', 'Northcote Road Bridge', 'Queens Road Station']);
    expect(m.others.every((r) => r.walk === null)).toBe(true);
    expect(m.favourites).toEqual([]);
    expect(m.location).toBe('off');
  });

  it('a position held from before is not used once location is off', () => {
    const m = build({ locationEnabled: false, geo: { status: 'idle', position: HERE } });
    expect(m.location).toBe('off');
    expect(m.othersTitle).toBe('All spots');
    expect(m.others.every((r) => r.walk === null)).toBe(true);
  });

  it('with a position: nearest first, with walking labels', () => {
    const m = build({ locationEnabled: true, geo: { status: 'granted', position: HERE } });
    expect(m.othersTitle).toBe('Near you');
    expect(m.location).toBe('on');
    expect(m.others.map((r) => r.id)).toEqual(['queens-road', 'northcote-rd', 'east-ave']);
    expect(m.others[0].walk).toBe("You're here");
    expect(m.others[1].walk).toMatch(/^\d+ min walk$/);
  });

  it('favourites sit on top in saved order and are not repeated below', () => {
    const m = build({ favouriteIds: ['northcote-rd', 'east-ave'], locationEnabled: true, geo: { status: 'granted', position: HERE } });
    expect(m.favourites.map((r) => r.id)).toEqual(['northcote-rd', 'east-ave']);
    expect(m.others.map((r) => r.id)).toEqual(['queens-road']);
    expect(m.favourites.every((r) => r.favourite)).toBe(true);
    expect(m.others.every((r) => !r.favourite)).toBe(true);
    expect(m.favourites[0].walk).toMatch(/min walk$/);
  });

  it('a favourite id no longer in the data is skipped', () => {
    const m = build({ favouriteIds: ['gone', 'east-ave'] });
    expect(m.favourites.map((r) => r.id)).toEqual(['east-ave']);
    expect(m.others.length).toBe(2);
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
    expect(m.others.length).toBe(3);
    expect(m.othersTitle).toBe(position === null ? 'All spots' : 'Near you');
  });

  it('row links, line and countdown text', () => {
    const m = build({ snapshots: qrDueIn(125) });
    const qr = m.others.find((r) => r.id === 'queens-road')!;
    expect(qr.href).toBe('/walthamstow/queens-road-station');
    expect(qr.lineName).toBe('Suffragette');
    expect(qr.lineColor).toBe(getViewpointById('queens-road')!.lineColor);
    expect(qr.countdown).toEqual({ kind: 'minutes', text: '2 min' });
    expect(m.others.find((r) => r.id === 'east-ave')!.countdown).toEqual({ kind: 'loading', text: '…' });
  });

  it.each([
    [45, { kind: 'seconds', text: '45 sec' }],
    [5, { kind: 'now', text: 'NOW' }],
  ] as const)('a train %i s away reads as on the countdown screen', (seconds, expected) => {
    const m = build({ snapshots: qrDueIn(seconds) });
    expect(m.others.find((r) => r.id === 'queens-road')!.countdown).toEqual(expected);
  });

  it('no trains and stale data have their own text', () => {
    const none = applyStopArrivals({}, VIEWPOINTS, '910GWLTHQRD', [], NOW);
    expect(build({ snapshots: none }).others.find((r) => r.id === 'queens-road')!.countdown)
      .toEqual({ kind: 'none', text: 'No trains' });
    expect(build({ snapshots: qrDueIn(600), nowMs: NOW + 91_000 }).others.find((r) => r.id === 'queens-road')!.countdown)
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
