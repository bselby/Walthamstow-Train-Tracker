import { describe, it, expect, vi } from 'vitest';
import {
  stopsToPoll, applyStopArrivals, nextTrain, pollHome,
  HOME_POLL_INTERVAL_MS, HOME_MAX_STOPS, HOME_STALE_MS,
} from '../src/homeArrivals';
import { VIEWPOINTS, getViewpointById } from '../src/viewpoints';
import type { Arrival } from '../src/tfl';

const EA = getViewpointById('east-ave')!;
const QR = getViewpointById('queens-road')!;
const NOW = Date.parse('2026-11-17T12:00:00Z');

function arr(overrides: Partial<Arrival> = {}): Arrival {
  return {
    id: 'a',
    stationName: 'Station',
    lineId: 'suffragette',
    destinationName: 'Somewhere',
    timeToStation: 120,
    expectedArrival: new Date(NOW + 120_000).toISOString(),
    modeName: 'overground',
    platformName: 'Platform 1',
    direction: 'outbound',
    ...overrides,
  };
}

describe('home polling limits', () => {
  it('stay inside what the design allows', () => {
    expect(HOME_POLL_INTERVAL_MS).toBe(30_000);
    expect(HOME_MAX_STOPS).toBe(8);
    expect(HOME_STALE_MS).toBe(90_000);
  });
});

describe('stopsToPoll', () => {
  it('polls each stop once though two spots share it', () => {
    expect(stopsToPoll(VIEWPOINTS)).toEqual(['910GWLTWCEN', '910GWLTHQRD']);
  });

  it('caps the stops polled, keeping the first rows', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...QR, id: `v${i}`, stopPointId: `S${i}` }));
    expect(stopsToPoll(many)).toEqual(['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
  });
});

describe('applyStopArrivals + nextTrain', () => {
  it('one stop fetch feeds both spots on it, each with its own offset', () => {
    const s = applyStopArrivals({}, VIEWPOINTS, '910GWLTHQRD', [arr({ timeToStation: 300 })], NOW);
    expect(nextTrain(s['queens-road'], NOW)).toEqual({ state: 'due', seconds: 300 });
    expect(nextTrain(s['northcote-rd'], NOW)).toEqual({ state: 'due', seconds: 213 }); // 300 − 87
    expect(s['east-ave']).toBeUndefined();
  });

  it('ignores other lines at a shared stop', () => {
    const s = applyStopArrivals({}, [QR], QR.stopPointId, [arr({ lineId: 'victoria', timeToStation: 60 })], NOW);
    expect(nextTrain(s['queens-road'], NOW)).toEqual({ state: 'none' });
  });

  it('takes the sooner of the two directions and counts down with the clock', () => {
    const s = applyStopArrivals({}, [QR], QR.stopPointId, [
      arr({ timeToStation: 400 }),
      arr({ id: 'b', direction: 'inbound', timeToStation: 90 }),
    ], NOW);
    expect(nextTrain(s['queens-road'], NOW + 30_000)).toEqual({ state: 'due', seconds: 60 });
  });

  it('skips a train that has already passed and shows the one after', () => {
    const s = applyStopArrivals({}, [QR], QR.stopPointId, [
      arr({ vehicleId: 'v1', timeToStation: 20 }),
      arr({ id: 'b', vehicleId: 'v2', timeToStation: 500 }),
    ], NOW);
    expect(nextTrain(s['queens-road'], NOW + 40_000)).toEqual({ state: 'due', seconds: 460 });
  });

  it('loading before any data, none with no trains, stale after 90 s', () => {
    expect(nextTrain(undefined, NOW)).toEqual({ state: 'loading' });
    const s = applyStopArrivals({}, [QR], QR.stopPointId, [], NOW);
    expect(nextTrain(s['queens-road'], NOW)).toEqual({ state: 'none' });
    expect(nextTrain(s['queens-road'], NOW + 90_000).state).toBe('none');
    expect(nextTrain(s['queens-road'], NOW + 90_001)).toEqual({ state: 'stale' });
  });

  it('East Avenue row matches its countdown screen', () => {
    const a = arr({ lineId: 'weaver', direction: 'inbound', timeToStation: 999, expectedArrival: new Date(NOW + 100_000).toISOString() });
    const s = applyStopArrivals({}, [EA], EA.stopPointId, [a], NOW);
    expect(nextTrain(s['east-ave'], NOW)).toEqual({ state: 'due', seconds: 78 }); // 100 − 22
  });

  it('keeps counting a northbound East Avenue train after TfL drops it at the station', () => {
    const a = arr({ lineId: 'weaver', vehicleId: 'v1', expectedArrival: new Date(NOW + 5_000).toISOString() });
    const first = applyStopArrivals({}, [EA], EA.stopPointId, [a], NOW);
    const second = applyStopArrivals(first, [EA], EA.stopPointId, [], NOW + 30_000);
    const next = nextTrain(second['east-ave'], NOW + 30_000);
    expect(next.state).toBe('due');
    expect(next.state === 'due' && Math.round(next.seconds)).toBe(5 + 142 - 30);
  });

  it('leaves the given snapshots untouched', () => {
    const before = {};
    applyStopArrivals(before, [QR], QR.stopPointId, [arr()], NOW);
    expect(before).toEqual({});
  });
});

describe('pollHome', () => {
  it('asks each stop once and feeds every spot', async () => {
    const fetchStop = vi.fn(async () => [arr({ timeToStation: 60 }), arr({ id: 'w', lineId: 'weaver', timeToStation: 60 })]);
    const r = await pollHome(VIEWPOINTS, {}, fetchStop, () => NOW);
    expect(fetchStop.mock.calls.map((c) => c[0])).toEqual(['910GWLTWCEN', '910GWLTHQRD']);
    expect(r.failed).toBe(0);
    expect(r.polled).toBe(2);
    expect(Object.keys(r.snapshots).sort()).toEqual(['east-ave', 'northcote-rd', 'queens-road']);
  });

  it('a failing stop keeps its old data and is counted', async () => {
    const old = applyStopArrivals({}, [EA], EA.stopPointId, [arr({ lineId: 'weaver', expectedArrival: new Date(NOW + 300_000).toISOString() })], NOW - 30_000);
    const fetchStop = vi.fn((id: string) =>
      id === '910GWLTWCEN' ? Promise.reject(new Error('x')) : Promise.resolve([arr({ timeToStation: 60 })]));
    const r = await pollHome(VIEWPOINTS, old, fetchStop, () => NOW);
    expect(fetchStop).toHaveBeenCalledTimes(2);
    expect(r.failed).toBe(1);
    expect(r.polled).toBe(2);
    expect(r.snapshots['east-ave']).toBe(old['east-ave']);
    expect(nextTrain(r.snapshots['queens-road'], NOW).state).toBe('due');
  });
});
