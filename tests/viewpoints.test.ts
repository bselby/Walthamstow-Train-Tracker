import { describe, it, expect } from 'vitest';
import { VIEWPOINTS, getViewpointById, DEFAULT_VIEWPOINT_ID } from '../src/viewpoints';

describe('VIEWPOINTS', () => {
  it('contains at least two viewpoints (East Ave + Queens Road)', () => {
    expect(VIEWPOINTS.length).toBeGreaterThanOrEqual(2);
    expect(VIEWPOINTS.map((v) => v.id)).toContain('east-ave');
    expect(VIEWPOINTS.map((v) => v.id)).toContain('queens-road');
  });

  it('every viewpoint has a unique id', () => {
    const ids = VIEWPOINTS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every viewpoint has all required fields', () => {
    for (const v of VIEWPOINTS) {
      expect(v.id).toBeTruthy();
      expect(v.name).toBeTruthy();
      expect(v.lineId).toBeTruthy();
      expect(v.lineName).toBeTruthy();
      expect(v.lineColor).toBeTruthy();
      expect(v.stopPointId).toBeTruthy();
      expect(v.coords.lat).toBeGreaterThan(51.5);
      expect(v.coords.lat).toBeLessThan(51.7);
      expect(v.coords.lng).toBeGreaterThan(-0.2);
      expect(v.coords.lng).toBeLessThan(0.2);
      expect(v.stops.length).toBeGreaterThan(1);
      expect(v.segments.length).toBe(v.stops.length - 1);
      expect(v.directions.north.offsetSeconds).toBeGreaterThanOrEqual(-300);
      expect(v.directions.south.offsetSeconds).toBeGreaterThanOrEqual(-300);
    }
  });

  it('every viewpoint has anchorIndex pointing at a real stop', () => {
    for (const v of VIEWPOINTS) {
      expect(v.anchorIndex).toBeGreaterThanOrEqual(0);
      expect(v.anchorIndex).toBeLessThan(v.stops.length);
    }
  });

  it('anchorIndex names the expected station for each viewpoint', () => {
    const expectedAnchorNames: Record<string, string> = {
      'east-ave': 'Walthamstow Central',
      'queens-road': 'Walthamstow Queens Road',
    };
    for (const v of VIEWPOINTS) {
      const expected = expectedAnchorNames[v.id];
      if (expected === undefined) continue; // new viewpoint added? fine, don't enforce here
      expect(v.stops[v.anchorIndex].fullName).toBe(expected);
    }
  });

  it('east-ave uses the bridge position model', () => {
    const v = getViewpointById('east-ave');
    expect(v?.positionModel).toBe('east-ave-bridge');
  });

  it('queens-road uses the station position model', () => {
    const v = getViewpointById('queens-road');
    expect(v?.positionModel).toBe('station');
  });

  it('queens-road has a freightStationCode (Suffragette covers GOBLIN freight)', () => {
    const v = getViewpointById('queens-road');
    expect(v?.freightStationCode).toBeTruthy();
  });

  it('east-ave does NOT have a freightStationCode (Chingford branch is passenger-only)', () => {
    const v = getViewpointById('east-ave');
    expect(v?.freightStationCode).toBeUndefined();
  });
});

describe('getViewpointById', () => {
  it('returns the viewpoint matching the id', () => {
    expect(getViewpointById('east-ave')?.id).toBe('east-ave');
  });

  it('returns undefined for an unknown id', () => {
    expect(getViewpointById('no-such-viewpoint')).toBeUndefined();
  });
});

describe('DEFAULT_VIEWPOINT_ID', () => {
  it('points at an existing viewpoint', () => {
    expect(getViewpointById(DEFAULT_VIEWPOINT_ID)).toBeDefined();
  });

  it('is east-ave (the app\'s primary spot)', () => {
    expect(DEFAULT_VIEWPOINT_ID).toBe('east-ave');
  });
});
