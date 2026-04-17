import { describe, it, expect } from 'vitest';
import { classifyDirection } from '../src/direction';
import type { Arrival } from '../src/tfl';

function arrival(destinationName: string): Arrival {
  return {
    id: '1',
    stationName: 'Walthamstow Central',
    lineId: 'weaver',
    destinationName,
    timeToStation: 0,
    expectedArrival: '2026-04-17T10:00:00Z',
    modeName: 'overground',
    platformName: 'Platform 1'
  };
}

describe('classifyDirection', () => {
  it('classifies Chingford as north', () => {
    expect(classifyDirection(arrival('Chingford'))).toBe('north');
  });

  it('classifies Chingford Rail Station as north (case-insensitive substring)', () => {
    expect(classifyDirection(arrival('Chingford Rail Station'))).toBe('north');
  });

  it('classifies Liverpool Street as south', () => {
    expect(classifyDirection(arrival('Liverpool Street'))).toBe('south');
  });

  it('classifies Clapton as south', () => {
    expect(classifyDirection(arrival('Clapton'))).toBe('south');
  });

  it('classifies empty destination as south (safe default — show it and let the user see)', () => {
    expect(classifyDirection(arrival(''))).toBe('south');
  });
});
