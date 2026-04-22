import { describe, it, expect } from 'vitest';
import { classifyDirection } from '../src/direction';
import type { Arrival } from '../src/tfl';
import { getViewpointById } from '../src/viewpoints';

const EAST_AVE = getViewpointById('east-ave')!;
const QUEENS_ROAD = getViewpointById('queens-road')!;

function arrival(destinationName: string, direction?: string): Arrival {
  return {
    id: 'x',
    stationName: 'Walthamstow Central',
    lineId: 'weaver',
    destinationName,
    timeToStation: 120,
    expectedArrival: '2026-04-17T10:00:00Z',
    modeName: 'overground',
    platformName: 'Platform 1',
    direction,
  };
}

describe('classifyDirection — East Ave', () => {
  it('uses TfL outbound/inbound when present', () => {
    expect(classifyDirection(arrival('Chingford', 'outbound'), EAST_AVE)).toBe('north');
    expect(classifyDirection(arrival('Liverpool Street', 'inbound'), EAST_AVE)).toBe('south');
  });

  it('prefers TfL direction over destination name', () => {
    // Shuttle to Wood Street during works — TfL direction still says outbound.
    expect(classifyDirection(arrival('Wood Street', 'outbound'), EAST_AVE)).toBe('north');
  });

  it('prefers TfL inbound over a north-terminus destination name', () => {
    // TfL is authoritative: an arrival marked inbound is southbound even if the
    // destination still reads "Chingford" (briefly, during a schedule update).
    expect(classifyDirection(arrival('Chingford', 'inbound'), EAST_AVE)).toBe('south');
  });

  it('falls back to destination-name match when TfL direction is missing', () => {
    expect(classifyDirection(arrival('Chingford'), EAST_AVE)).toBe('north');
    expect(classifyDirection(arrival('Liverpool Street'), EAST_AVE)).toBe('south');
  });
});

describe('classifyDirection — Queens Road', () => {
  it('uses TfL outbound/inbound when present (north=Barking, south=Gospel Oak)', () => {
    expect(classifyDirection(arrival('Barking Riverside', 'outbound'), QUEENS_ROAD)).toBe('north');
    expect(classifyDirection(arrival('Gospel Oak', 'inbound'), QUEENS_ROAD)).toBe('south');
  });

  it('falls back to destination-name match for north terminus', () => {
    expect(classifyDirection(arrival('Barking Riverside'), QUEENS_ROAD)).toBe('north');
  });
});

describe('classifyDirection — fallback edge cases', () => {
  it('empty destination falls through to south (safe default; train is still shown)', () => {
    expect(classifyDirection(arrival(''), EAST_AVE)).toBe('south');
  });

  it('empty-string TfL direction falls through to destination-name match', () => {
    // TfL has been observed returning direction: '' (not undefined) on some
    // responses. Neither value equals 'outbound'/'inbound', so behaviour must
    // match the direction-missing path.
    const EAST_AVE = getViewpointById('east-ave')!;
    expect(classifyDirection(arrival('Chingford', ''), EAST_AVE)).toBe('north');
    expect(classifyDirection(arrival('Liverpool Street', ''), EAST_AVE)).toBe('south');
  });
});
