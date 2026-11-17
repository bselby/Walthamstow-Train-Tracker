import { describe, it, expect } from 'vitest';
import { secondsToStation, holdDroppedTrains } from '../src/tflTiming';
import type { Arrival } from '../src/tfl';
import type { BridgeEvent } from '../src/bridge';
import { getViewpointById } from '../src/viewpoints';

const NOW = Date.parse('2026-11-17T20:00:00Z');

function arrival(overrides: Partial<Arrival> = {}): Arrival {
  return {
    id: 'row-1',
    stationName: 'Walthamstow Central',
    lineId: 'weaver',
    destinationName: 'Chingford',
    timeToStation: 200,
    expectedArrival: '2026-11-17T20:02:00Z',
    modeName: 'overground',
    platformName: 'Platform 2',
    direction: 'outbound',
    vehicleId: 'veh-1',
    ...overrides,
  };
}

function event(vehicleId: string, bridgeTimeSeconds: number): BridgeEvent {
  return { arrival: arrival({ vehicleId, id: `row-${vehicleId}` }), direction: 'north', bridgeTimeSeconds };
}

describe('secondsToStation', () => {
  it('counts down to the expected arrival time, not the aged timeToStation figure', () => {
    // TfL said 200 s when it built the prediction; it is really 120 s away now.
    expect(secondsToStation(arrival(), NOW, true)).toBe(120);
  });

  it('keeps timeToStation for viewpoints that have not been measured', () => {
    expect(secondsToStation(arrival(), NOW, false)).toBe(200);
  });

  it('falls back to timeToStation when the expected arrival time is unreadable', () => {
    expect(secondsToStation(arrival({ expectedArrival: 'not a date' }), NOW, true)).toBe(200);
  });
});

describe('holdDroppedTrains', () => {
  const prev = { events: [event('veh-1', 100), event('veh-2', 1000)], snapshottedAtMs: NOW - 20_000 };

  it('keeps counting down a train TfL has dropped before it reaches a viewpoint beyond the station', () => {
    const held = holdDroppedTrains(prev, [event('veh-2', 980)], new Set(['veh-2']), NOW, 142);
    expect(held.map((e) => [e.arrival.vehicleId, e.bridgeTimeSeconds])).toEqual([
      ['veh-1', 80],
      ['veh-2', 980],
    ]);
  });

  it('does not duplicate a train that is still in the feed', () => {
    const next = [event('veh-1', 82), event('veh-2', 980)];
    expect(holdDroppedTrains(prev, next, new Set(['veh-1', 'veh-2']), NOW, 142)).toEqual(next);
  });

  it('lets a held train go once it is well past the viewpoint', () => {
    const old = { events: [event('veh-1', 5)], snapshottedAtMs: NOW - 40_000 };
    expect(holdDroppedTrains(old, [], new Set(), NOW, 142)).toEqual([]);
  });

  it('does not hold trains where the viewpoint is at or before the station', () => {
    expect(holdDroppedTrains(prev, [event('veh-2', 980)], new Set(['veh-2']), NOW, -22)).toEqual([event('veh-2', 980)]);
  });

  it('does not hold a train dropped long before it was due, which is a cancellation', () => {
    const far = { events: [event('veh-1', 600)], snapshottedAtMs: NOW - 20_000 };
    expect(holdDroppedTrains(far, [], new Set(), NOW, 142)).toEqual([]);
  });

  it('returns the fresh events untouched when there was no previous snapshot', () => {
    const next = [event('veh-2', 980)];
    expect(holdDroppedTrains(undefined, next, new Set(['veh-2']), NOW, 142)).toEqual(next);
  });
});

describe('East Avenue TfL timing', () => {
  const eastAve = getViewpointById('east-ave')!;

  it('counts from the expected arrival time', () => {
    expect(eastAve.timeFromExpectedArrival).toBe(true);
  });

  it('uses offsets measured against signalled train movements on 2026-11-17', () => {
    expect(eastAve.directions.north.offsetSeconds).toBe(142);
    expect(eastAve.directions.south.offsetSeconds).toBe(-22);
  });

  it('leaves the Suffragette viewpoints on their existing timing', () => {
    expect(getViewpointById('queens-road')!.timeFromExpectedArrival).toBeUndefined();
    expect(getViewpointById('northcote-rd')!.timeFromExpectedArrival).toBeUndefined();
  });
});
