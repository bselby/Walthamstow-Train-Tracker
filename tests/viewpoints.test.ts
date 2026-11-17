import { describe, it, expect } from 'vitest';
import { VIEWPOINTS, getViewpointById, getViewpointBySlug, defineViewpoint, LINES, DEFAULT_VIEWPOINT_ID, type ViewpointRecord } from '../src/viewpoints';

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

  it('northcote-rd shares the WMW freight feed with queens-road (same physical track)', () => {
    const queensRoad = getViewpointById('queens-road');
    const northcote = getViewpointById('northcote-rd');
    expect(northcote?.freightStationCode).toBe('WMW');
    expect(northcote?.freightStationCode).toBe(queensRoad?.freightStationCode);
  });

  it('northcote-rd applies a non-zero offsetSeconds (bridge is ~634m from WQR, not at it)', () => {
    const v = getViewpointById('northcote-rd');
    expect(v?.directions.north.offsetSeconds).not.toBe(0);
    expect(v?.directions.south.offsetSeconds).not.toBe(0);
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

describe('viewpoint URLs and records', () => {
  it('gives each viewpoint its published URL parts', () => {
    expect(VIEWPOINTS.map((v) => `${v.id}:/${v.place}/${v.slug}`)).toEqual([
      'east-ave:/walthamstow/east-avenue-bridge',
      'queens-road:/walthamstow/queens-road-station',
      'northcote-rd:/walthamstow/northcote-road-bridge',
    ]);
  });

  it('place/slug pairs are unique and URL-safe', () => {
    const keys = VIEWPOINTS.map((v) => `${v.place}/${v.slug}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/);
  });

  it('getViewpointBySlug finds by place and slug, and nothing else', () => {
    expect(getViewpointBySlug('walthamstow', 'east-avenue-bridge')?.id).toBe('east-ave');
    expect(getViewpointBySlug('leyton', 'east-avenue-bridge')).toBeUndefined();
    expect(getViewpointBySlug('walthamstow', 'east-ave')).toBeUndefined();
  });

  const record: ViewpointRecord = {
    id: 't', place: 'walthamstow', slug: 't', name: 'T', description: 'T',
    coords: { lat: 0, lng: 0 }, line: 'suffragette', stopPointId: '910GWLTHQRD',
    anchorStop: 'Blackhorse Road',
    directions: {
      north: { label: '→ Barking Riverside', tflDirection: 'outbound', terminusName: 'Barking Riverside', offsetSeconds: 10 },
      south: { label: '← Gospel Oak', tflDirection: 'inbound', terminusName: 'Gospel Oak', offsetSeconds: -10 },
    },
  };

  it('defineViewpoint fills line data and the anchor index from a small record', () => {
    const vp = defineViewpoint(record);
    expect(vp.lineId).toBe('suffragette');
    expect(vp.lineName).toBe('Suffragette');
    expect(vp.lineColor).toBe(LINES.suffragette.color);
    expect(vp.anchorIndex).toBe(5);
    expect(vp.positionModel).toBe('station');
    expect(vp.stops).toBe(LINES.suffragette.stops);
    expect(vp.segments).toBe(LINES.suffragette.segments);
  });

  it('defineViewpoint rejects an anchor stop that is not on the line', () => {
    expect(() => defineViewpoint({ ...record, line: 'weaver' })).toThrow();
  });

  it('the three live viewpoints keep their line data and timings', () => {
    const snapshot = VIEWPOINTS.map((v) => [
      v.id, v.lineId, v.lineName, v.stopPointId, v.anchorIndex, v.positionModel,
      v.stops.length, v.segments.length, v.timeFromExpectedArrival ?? false, v.freightStationCode ?? null,
      v.directions.north.offsetSeconds, v.directions.south.offsetSeconds,
      (v.directions.north.berthSteps ?? []).length, (v.directions.south.berthSteps ?? []).length,
    ]);
    expect(snapshot).toEqual([
      ['east-ave', 'weaver', 'Weaver', '910GWLTWCEN', 5, 'east-ave-bridge', 9, 8, true, null, 142, -22, 1, 2],
      ['queens-road', 'suffragette', 'Suffragette', '910GWLTHQRD', 6, 'station', 13, 12, false, 'WMW', 0, 0, 0, 0],
      ['northcote-rd', 'suffragette', 'Suffragette', '910GWLTHQRD', 6, 'station', 13, 12, false, 'WMW', -87, 87, 1, 1],
    ]);
  });
});
