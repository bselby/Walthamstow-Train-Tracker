import { describe, it, expect } from 'vitest';
import { computeBridgeTime, pickNextPerDirection, pickNextNPerDirection } from '../src/bridge';
import type { Arrival } from '../src/tfl';
import { getViewpointById } from '../src/viewpoints';

const EAST_AVE = getViewpointById('east-ave')!;

function arrival(destinationName: string, timeToStation: number, id = 'x'): Arrival {
  return {
    id,
    stationName: 'Walthamstow Central',
    lineId: 'weaver',
    destinationName,
    timeToStation,
    expectedArrival: '2026-04-17T10:00:00Z',
    modeName: 'overground',
    platformName: 'Platform 1'
  };
}

describe('computeBridgeTime', () => {
  it('adds 90s for northbound on East Ave (train leaves WC then reaches bridge)', () => {
    expect(computeBridgeTime(arrival('Chingford', 120), EAST_AVE)).toBe(210);
  });

  it('subtracts 20s for southbound on East Ave (train crosses bridge before WC)', () => {
    expect(computeBridgeTime(arrival('Liverpool Street', 120), EAST_AVE)).toBe(100);
  });

  it('handles a northbound train already at platform (tts=0)', () => {
    expect(computeBridgeTime(arrival('Chingford', 0), EAST_AVE)).toBe(90);
  });

  it('handles a southbound train already at platform (returns -20)', () => {
    expect(computeBridgeTime(arrival('Liverpool Street', 0), EAST_AVE)).toBe(-20);
  });

  it('station viewpoint: offset=0 means bridgeTime equals timeToStation', () => {
    const queensRoad = getViewpointById('queens-road')!;
    expect(computeBridgeTime(arrival('Barking Riverside', 120), queensRoad)).toBe(120);
    expect(computeBridgeTime(arrival('Gospel Oak', 120), queensRoad)).toBe(120);
  });
});

describe('pickNextPerDirection', () => {
  it('picks earliest future northbound and earliest future southbound', () => {
    const arrivals = [
      arrival('Chingford', 300, 'n1'),
      arrival('Chingford', 60, 'n2'),
      arrival('Liverpool Street', 500, 's1'),
      arrival('Liverpool Street', 200, 's2')
    ];

    const result = pickNextPerDirection(arrivals, EAST_AVE);

    expect(result.north?.arrival.id).toBe('n2');
    expect(result.north?.bridgeTimeSeconds).toBe(150); // 60 + 90
    expect(result.south?.arrival.id).toBe('s2');
    expect(result.south?.bridgeTimeSeconds).toBe(180); // 200 - 20
  });

  it('excludes arrivals whose bridge time is too far in the past (< -30s)', () => {
    const arrivals = [
      arrival('Liverpool Street', -100, 's-gone'),
      arrival('Liverpool Street', 200, 's-next')
    ];
    const result = pickNextPerDirection(arrivals, EAST_AVE);
    expect(result.south?.arrival.id).toBe('s-next');
  });

  it('keeps a southbound train that just crossed (bridge time between -30 and 0)', () => {
    const arrivals = [arrival('Liverpool Street', 10, 's-just-crossed')];
    const result = pickNextPerDirection(arrivals, EAST_AVE);
    expect(result.south?.arrival.id).toBe('s-just-crossed');
    expect(result.south?.bridgeTimeSeconds).toBe(-10);
  });

  it('returns undefined for a direction with no valid arrivals', () => {
    const arrivals = [arrival('Chingford', 120, 'n1')];
    const result = pickNextPerDirection(arrivals, EAST_AVE);
    expect(result.north?.arrival.id).toBe('n1');
    expect(result.south).toBeUndefined();
  });
});

describe('pickNextNPerDirection', () => {
  it('returns up to N per direction, sorted by bridge time ascending', () => {
    const arrivals = [
      arrival('Chingford', 600, 'n3'),
      arrival('Chingford', 300, 'n2'),
      arrival('Chingford', 60, 'n1'),
      arrival('Liverpool Street', 500, 's2'),
      arrival('Liverpool Street', 200, 's1'),
    ];
    const result = pickNextNPerDirection(arrivals, 2, EAST_AVE);
    expect(result.north.map((e) => e.arrival.id)).toEqual(['n1', 'n2']);
    expect(result.south.map((e) => e.arrival.id)).toEqual(['s1', 's2']);
  });

  it('caps at n even if more arrivals exist', () => {
    const arrivals = [
      arrival('Chingford', 60, 'n1'),
      arrival('Chingford', 300, 'n2'),
      arrival('Chingford', 500, 'n3'),
      arrival('Chingford', 700, 'n4'),
    ];
    const result = pickNextNPerDirection(arrivals, 2, EAST_AVE);
    expect(result.north).toHaveLength(2);
    expect(result.north.map((e) => e.arrival.id)).toEqual(['n1', 'n2']);
  });

  it('returns empty arrays when a direction has no arrivals', () => {
    const arrivals = [arrival('Chingford', 120, 'n1')];
    const result = pickNextNPerDirection(arrivals, 3, EAST_AVE);
    expect(result.north).toHaveLength(1);
    expect(result.south).toEqual([]);
  });
});
