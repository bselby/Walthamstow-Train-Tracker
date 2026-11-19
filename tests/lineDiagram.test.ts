import { describe, it, expect } from 'vitest';
import { lineDiagramLayout, fracForPos } from '../src/lineDiagram';
import { LINES, getViewpointById } from '../src/viewpoints';

describe('lineDiagramLayout', () => {
  const names = (l: ReturnType<typeof lineDiagramLayout>) => l.stations.map((st) => st.name);

  it('East Avenue towards Chingford: both ends and the two stations before the spot', () => {
    const l = lineDiagramLayout(LINES.weaver.stops, 5.5, 'north');
    expect(names(l)).toEqual(['Liverpool Street', 'St James Street', 'Walthamstow Central', 'Chingford']);
    expect(l.stations.map((st) => st.end)).toEqual([true, false, false, true]);
    expect(l.stations.map((st) => st.frac)).toEqual([0, 0.34, 0.6, 1]);
    expect(l.pinFrac).toBe(0.82);
  });

  it('East Avenue towards Liverpool Street: the two stations before are on the Chingford side', () => {
    const l = lineDiagramLayout(LINES.weaver.stops, 5.5, 'south');
    expect(names(l)).toEqual(['Liverpool Street', 'Wood Street', 'Highams Park', 'Chingford']);
    expect(l.stations.map((st) => st.frac)).toEqual([0, 0.4, 0.66, 1]);
    expect(l.pinFrac).toBe(0.18);
  });

  it('a spot at a station: the two stations before it, not the station itself', () => {
    const qr = getViewpointById('queens-road')!;
    const l = lineDiagramLayout(qr.stops, qr.pinPosition, 'north');
    const i = qr.pinPosition;
    expect(names(l)).toEqual([qr.stops[0].fullName, qr.stops[i - 2].fullName, qr.stops[i - 1].fullName, qr.stops[qr.stops.length - 1].fullName]);
  });

  it('near a terminus: never repeats an end as a station before', () => {
    const l = lineDiagramLayout(LINES.weaver.stops, 1.5, 'north');
    expect(names(l)).toEqual(['Liverpool Street', 'Bethnal Green', 'Chingford']);
    expect(l.stations[1].frac).toBe(0.6);
  });
});

describe('fracForPos', () => {
  const north = lineDiagramLayout(LINES.weaver.stops, 5.5, 'north');
  const south = lineDiagramLayout(LINES.weaver.stops, 5.5, 'south');

  it('puts the train on each shown station and the pin exactly', () => {
    expect(fracForPos(north, 0)).toBe(0);
    expect(fracForPos(north, 4)).toBeCloseTo(0.34, 6);
    expect(fracForPos(north, 5)).toBeCloseTo(0.6, 6);
    expect(fracForPos(north, 5.5)).toBeCloseTo(0.82, 6);
    expect(fracForPos(north, 8)).toBe(1);
    expect(fracForPos(south, 6)).toBeCloseTo(0.4, 6);
    expect(fracForPos(south, 5.5)).toBeCloseTo(0.18, 6);
  });

  it('runs straight between them, and clamps off the ends', () => {
    expect(fracForPos(north, 2)).toBeCloseTo(0.17, 6);
    expect(fracForPos(north, 4.5)).toBeCloseTo(0.47, 6);
    expect(fracForPos(north, -1)).toBe(0);
    expect(fracForPos(north, 9)).toBe(1);
  });
});

describe('Viewpoint.pinPosition', () => {
  it('East Avenue Bridge sits between Walthamstow Central and Wood Street', () => {
    expect(getViewpointById('east-ave')!.pinPosition).toBe(5.5);
  });
  it('Queens Road Station sits at its station', () => {
    const qr = getViewpointById('queens-road')!;
    expect(qr.pinPosition).toBe(qr.anchorIndex);
  });
  it('Northcote Road Bridge sits between Blackhorse Road and Walthamstow Queens Road', () => {
    const nc = getViewpointById('northcote-rd')!;
    expect(nc.stops[Math.floor(nc.pinPosition)].fullName).toBe('Blackhorse Road');
    expect(nc.stops[Math.ceil(nc.pinPosition)].fullName).toBe('Walthamstow Queens Road');
  });
});
