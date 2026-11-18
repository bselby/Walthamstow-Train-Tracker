import { describe, it, expect } from 'vitest';
import { lineDiagramLayout } from '../src/lineDiagram';
import { LINES, getViewpointById } from '../src/viewpoints';

describe('lineDiagramLayout', () => {
  it('Weaver, pin 5.5: ends named and drawn large, pin between WC and Wood Street', () => {
    const { stations, pinX } = lineDiagramLayout(LINES.weaver.stops, 5.5);
    expect(stations).toHaveLength(9);
    expect(stations[0]).toEqual({ x: 12, end: true, name: 'Liverpool Street' });
    expect(stations[8].name).toBe('Chingford');
    expect(stations[8].end).toBe(true);
    expect(stations[8].x).toBe(314);
    expect(stations[4].end).toBe(false);
    expect(pinX).toBeCloseTo(219.6, 0);
    expect(Math.abs(pinX - 219.6)).toBeLessThanOrEqual(0.5);
  });

  it('Suffragette, pin 6: Gospel Oak to Barking Riverside', () => {
    const { stations, pinX } = lineDiagramLayout(LINES.suffragette.stops, 6);
    expect(stations).toHaveLength(13);
    expect(stations[0].name).toBe('Gospel Oak');
    expect(stations[12].name).toBe('Barking Riverside');
    expect(stations[12].end).toBe(true);
    expect(stations[6].end).toBe(false);
    expect(pinX).toBeCloseTo(163, 5);
  });

  it('spaces stations evenly across a custom width', () => {
    const { stations } = lineDiagramLayout(LINES.weaver.stops, 0, 112);
    expect(stations.map((s) => s.x)).toEqual([12, 23, 34, 45, 56, 67, 78, 89, 100]);
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
