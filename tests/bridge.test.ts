import { describe, it, expect } from 'vitest';
import { computeBridgeTime, pickNextPerDirection, pickNextNPerDirection } from '../src/bridge';
import type { Arrival } from '../src/tfl';

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
  it('adds 90s for northbound (train leaves WC then reaches bridge)', () => {
    expect(computeBridgeTime(arrival('Chingford', 120))).toBe(210);
  });

  it('subtracts 20s for southbound (train crosses bridge before arriving at WC)', () => {
    expect(computeBridgeTime(arrival('Liverpool Street', 120))).toBe(100);
  });

  it('handles a northbound train already at platform (timeToStation = 0)', () => {
    expect(computeBridgeTime(arrival('Chingford', 0))).toBe(90);
  });

  it('handles a southbound train already at platform (returns -20, i.e. just crossed)', () => {
    expect(computeBridgeTime(arrival('Liverpool Street', 0))).toBe(-20);
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

    const result = pickNextPerDirection(arrivals);

    expect(result.north?.arrival.id).toBe('n2');
    expect(result.north?.bridgeTimeSeconds).toBe(150); // 60 + 90
    expect(result.south?.arrival.id).toBe('s2');
    expect(result.south?.bridgeTimeSeconds).toBe(180); // 200 - 20
  });

  it('excludes arrivals whose bridge time is too far in the past (< -30s)', () => {
    const arrivals = [
      arrival('Liverpool Street', -100, 's-gone'), // bridge time -120, excluded
      arrival('Liverpool Street', 200, 's-next')   // bridge time 180, kept
    ];

    const result = pickNextPerDirection(arrivals);

    expect(result.south?.arrival.id).toBe('s-next');
  });

  it('keeps a southbound train that just crossed (bridge time between -30 and 0)', () => {
    const arrivals = [
      arrival('Liverpool Street', 10, 's-just-crossed') // bridge time -10
    ];

    const result = pickNextPerDirection(arrivals);

    expect(result.south?.arrival.id).toBe('s-just-crossed');
    expect(result.south?.bridgeTimeSeconds).toBe(-10);
  });

  it('returns undefined for a direction with no valid arrivals', () => {
    const arrivals = [arrival('Chingford', 120, 'n1')];

    const result = pickNextPerDirection(arrivals);

    expect(result.north?.arrival.id).toBe('n1');
    expect(result.south).toBeUndefined();
  });
});

describe('pickNextNPerDirection', () => {
  it('returns up to n entries per direction, sorted ascending by bridge time', () => {
    const arrivals = [
      arrival('Chingford', 300, 'n1'),
      arrival('Chingford', 60, 'n2'),
      arrival('Chingford', 600, 'n3'),
      arrival('Liverpool Street', 200, 's1'),
      arrival('Liverpool Street', 500, 's2'),
    ];
    const result = pickNextNPerDirection(arrivals, 3);
    expect(result.north.map((e) => e.arrival.id)).toEqual(['n2', 'n1', 'n3']);
    expect(result.south.map((e) => e.arrival.id)).toEqual(['s1', 's2']);
  });

  it('caps at n even if more arrivals exist', () => {
    const arrivals = [
      arrival('Chingford', 60, 'n1'),
      arrival('Chingford', 120, 'n2'),
      arrival('Chingford', 180, 'n3'),
      arrival('Chingford', 240, 'n4'),
      arrival('Chingford', 300, 'n5'),
    ];
    expect(pickNextNPerDirection(arrivals, 3).north).toHaveLength(3);
  });

  it('returns empty arrays when direction has no arrivals', () => {
    const arrivals = [arrival('Chingford', 120, 'n1')];
    const result = pickNextNPerDirection(arrivals, 4);
    expect(result.north).toHaveLength(1);
    expect(result.south).toHaveLength(0);
  });

  it('respects the JUST_CROSSED_WINDOW filter', () => {
    const arrivals = [
      arrival('Liverpool Street', -100, 's-gone'),
      arrival('Liverpool Street', 300, 's-ok'),
    ];
    const result = pickNextNPerDirection(arrivals, 3);
    expect(result.south.map((e) => e.arrival.id)).toEqual(['s-ok']);
  });
});
