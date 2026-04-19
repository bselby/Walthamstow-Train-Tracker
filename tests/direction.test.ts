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

  describe('TfL direction field takes priority over destinationName parsing', () => {
    it('outbound → north even when destination is an engineering-works shuttle (e.g. Wood Street)', () => {
      expect(classifyDirection({ ...arrival('Wood Street Rail Station'), direction: 'outbound' })).toBe('north');
    });

    it('inbound → south even with a Chingford destination (TfL is authoritative)', () => {
      // Unlikely pairing, but confirms the priority order.
      expect(classifyDirection({ ...arrival('Chingford Rail Station'), direction: 'inbound' })).toBe('south');
    });

    it('falls back to destination parsing when direction is missing', () => {
      expect(classifyDirection({ ...arrival('Chingford Rail Station'), direction: undefined })).toBe('north');
    });
  });
});
