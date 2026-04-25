import { describe, it, expect } from 'vitest';
import { parseFreightResponse, isFreightByHeadcode, clampFreightPosition } from '../src/freight';
import { getViewpointById } from '../src/viewpoints';

const QUEENS_ROAD = getViewpointById('queens-road')!;

describe('clampFreightPosition', () => {
  it('passes passenger positions through unchanged regardless of tts', () => {
    expect(clampFreightPosition(3.5, 600, false)).toBe(3.5);
    expect(clampFreightPosition(null, 600, false)).toBeNull();
  });

  it('passes freight through when tts is within the modelled window', () => {
    expect(clampFreightPosition(3.5, 300, true)).toBe(3.5);
    expect(clampFreightPosition(3.5, 60, true)).toBe(3.5);
  });

  it('clamps freight to null beyond the modelled window', () => {
    expect(clampFreightPosition(3.5, 301, true)).toBeNull();
    expect(clampFreightPosition(3.5, 900, true)).toBeNull();
  });
});

describe('isFreightByHeadcode', () => {
  it('classifies standard freight headcodes (4xxx–8xxx) as freight', () => {
    expect(isFreightByHeadcode('4L85')).toBe(true);
    expect(isFreightByHeadcode('6M23')).toBe(true);
    expect(isFreightByHeadcode('7H47')).toBe(true);
    expect(isFreightByHeadcode('8G09')).toBe(true);
  });

  it('classifies light-loco (0xxx) as freight', () => {
    expect(isFreightByHeadcode('0Z72')).toBe(true);
  });

  it('classifies passenger (1/2/9) as non-freight', () => {
    expect(isFreightByHeadcode('1A05')).toBe(false);
    expect(isFreightByHeadcode('2H05')).toBe(false);
    expect(isFreightByHeadcode('9C71')).toBe(false);
  });

  it('classifies ECS (3xxx) as non-freight (treat as passenger for our binary split)', () => {
    expect(isFreightByHeadcode('3S17')).toBe(false);
  });

  it('returns false for empty / malformed headcodes', () => {
    expect(isFreightByHeadcode('')).toBe(false);
    expect(isFreightByHeadcode(undefined as unknown as string)).toBe(false);
    expect(isFreightByHeadcode('??')).toBe(false);
  });
});

describe('parseFreightResponse', () => {
  const sampleDto = {
    arrivals: [
      {
        id: 'X12345',
        headcode: '6M23',
        operatorCode: 'DB',
        operatorName: 'DB Cargo',
        origin: 'Tilbury Riverside Yard',
        destination: 'Willesden Euroterminal',
        timeToStation: 180,
        expectedPass: '2026-04-22T14:23:00Z',
        direction: 'outbound' as const,
        category: 'freight' as const,
      },
      {
        id: 'X67890',
        headcode: '4L85',
        operatorCode: 'FL',
        operatorName: 'Freightliner',
        origin: 'Crewe Basford Hall',
        destination: 'Felixstowe North',
        timeToStation: 600,
        expectedPass: '2026-04-22T14:30:00Z',
        direction: 'inbound' as const,
        category: 'freight' as const,
      },
    ],
    fetchedAt: '2026-04-22T14:20:00Z',
  };

  it('maps DTOs to Arrival[] with category=freight', () => {
    const result = parseFreightResponse(sampleDto, QUEENS_ROAD);
    expect(result).toHaveLength(2);
    expect(result[0].category).toBe('freight');
    expect(result[0].id).toBe('X12345');
    expect(result[0].operatorCode).toBe('DB');
    expect(result[0].headcode).toBe('6M23');
    expect(result[0].timeToStation).toBe(180);
    expect(result[0].expectedArrival).toBe('2026-04-22T14:23:00Z');
    expect(result[0].origin).toBe('Tilbury Riverside Yard');
    expect(result[0].destinationName).toBe('Willesden Euroterminal');
  });

  it('maps outbound → direction that will classify as north on Queens Road', () => {
    const result = parseFreightResponse(sampleDto, QUEENS_ROAD);
    expect(result[0].direction).toBe('outbound');
    expect(result[1].direction).toBe('inbound');
  });

  it('skips malformed entries without throwing', () => {
    const malformed = {
      arrivals: [
        { id: 'X1' } as never,
        sampleDto.arrivals[0],
      ],
      fetchedAt: sampleDto.fetchedAt,
    };
    const result = parseFreightResponse(malformed, QUEENS_ROAD);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('X12345');
  });

  it('returns [] for an empty response', () => {
    expect(parseFreightResponse({ arrivals: [], fetchedAt: '...' }, QUEENS_ROAD)).toEqual([]);
  });
});
