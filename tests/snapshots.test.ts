import { describe, it, expect } from 'vitest';
import { snapshotViewpoint } from '../src/snapshots';
import { getViewpointById } from '../src/viewpoints';
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

describe('snapshotViewpoint', () => {
  it('station spot: bridge time is TfL timeToStation', () => {
    const s = snapshotViewpoint({}, [arr({ timeToStation: 120 })], QR, NOW, 4);
    expect(s.north?.events[0].bridgeTimeSeconds).toBe(120);
    expect(s.north?.snapshottedAtMs).toBe(NOW);
    expect(s.south).toBeUndefined();
  });

  it('East Avenue counts from expected arrival plus its offset', () => {
    const a = arr({ lineId: 'weaver', timeToStation: 999, expectedArrival: new Date(NOW + 60_000).toISOString() });
    expect(snapshotViewpoint({}, [a], EA, NOW, 4).north?.events[0].bridgeTimeSeconds).toBeCloseTo(60 + 142);
  });

  it('holds a northbound East Avenue train TfL has dropped until it passes the bridge', () => {
    const a = arr({ lineId: 'weaver', vehicleId: 'v1', expectedArrival: new Date(NOW + 5_000).toISOString() });
    const first = snapshotViewpoint({}, [a], EA, NOW, 4);
    const second = snapshotViewpoint(first, [], EA, NOW + 20_000, 4);
    expect(second.north?.events[0].arrival.vehicleId).toBe('v1');
    expect(second.north?.events[0].bridgeTimeSeconds).toBeCloseTo(5 + 142 - 20);
  });

  it('does not hold a dropped train where the spot is at or before the station', () => {
    const first = snapshotViewpoint({}, [arr({ vehicleId: 'v1', timeToStation: 5 })], QR, NOW, 4);
    expect(snapshotViewpoint(first, [], QR, NOW + 20_000, 4).north).toBeUndefined();
  });

  it('caps each direction at perDirection, soonest first', () => {
    const many = [600, 100, 500, 200, 400, 300].map((t, i) => arr({ id: `a${i}`, vehicleId: `v${i}`, timeToStation: t }));
    const s = snapshotViewpoint({}, many, QR, NOW, 4);
    expect(s.north?.events.map((e) => e.bridgeTimeSeconds)).toEqual([100, 200, 300, 400]);
  });

  it('sorts arrivals into the two directions', () => {
    const s = snapshotViewpoint({}, [arr({ direction: 'inbound', timeToStation: 90 }), arr({ timeToStation: 30 })], QR, NOW, 4);
    expect(s.north?.events.length).toBe(1);
    expect(s.south?.events[0].bridgeTimeSeconds).toBe(90);
  });
});
