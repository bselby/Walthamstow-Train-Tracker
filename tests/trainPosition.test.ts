import { describe, it, expect } from 'vitest';
import { positionAtCountdown } from '../src/trainPosition';
import { VIEWPOINTS } from '../src/viewpoints';
import type { Direction } from '../src/direction';

const vp = (id: string) => VIEWPOINTS.find((v) => v.id === id)!;
const eastAve = vp('east-ave');
const queensRoad = vp('queens-road');
const northcote = vp('northcote-rd');

describe('positionAtCountdown', () => {
  it('puts the train on the You pin when the countdown reaches zero, at every spot and direction', () => {
    for (const v of VIEWPOINTS) {
      for (const d of ['north', 'south'] as Direction[]) {
        expect(positionAtCountdown(0, d, v)).toBeCloseTo(v.pinPosition, 5);
      }
    }
  });

  it('has not reached the pin while the countdown is still running', () => {
    for (const v of VIEWPOINTS) {
      expect(positionAtCountdown(20, 'north', v)!).toBeLessThan(v.pinPosition);
      expect(positionAtCountdown(20, 'south', v)!).toBeGreaterThan(v.pinPosition);
    }
  });

  describe('East Avenue northbound (the bridge is 142 s past Walthamstow Central)', () => {
    it('is at Walthamstow Central with 142 s to go', () => {
      expect(positionAtCountdown(142, 'north', eastAve)).toBeCloseTo(5, 5);
    });
    it('is halfway from Walthamstow Central to the bridge with 71 s to go', () => {
      expect(positionAtCountdown(71, 'north', eastAve)).toBeCloseTo(5.25, 5);
    });
    it('is at St James Street one segment (120 s) further back', () => {
      expect(positionAtCountdown(262, 'north', eastAve)).toBeCloseTo(4, 5);
    });
    it('moves on towards Wood Street after the pass, then goes after 30 s', () => {
      expect(positionAtCountdown(-30, 'north', eastAve)).toBeCloseTo(5.75, 5);
      expect(positionAtCountdown(-31, 'north', eastAve)).toBeNull();
    });
  });

  describe('East Avenue southbound (the bridge is 22 s before Walthamstow Central)', () => {
    it('is at Wood Street 120 - 22 = 98 s out', () => {
      expect(positionAtCountdown(98, 'south', eastAve)).toBeCloseTo(6, 5);
    });
    it('reaches Walthamstow Central 22 s after the pass, then goes', () => {
      expect(positionAtCountdown(-11, 'south', eastAve)).toBeCloseTo(5.25, 5);
      expect(positionAtCountdown(-22, 'south', eastAve)).toBeCloseTo(5, 5);
      expect(positionAtCountdown(-23, 'south', eastAve)).toBeNull();
    });
  });

  describe('Northcote Road southbound (the bridge is 87 s past Queens Road)', () => {
    it('is at Queens Road with 87 s to go, and moves on towards the pin', () => {
      expect(positionAtCountdown(87, 'south', northcote)).toBeCloseTo(6, 5);
      expect(positionAtCountdown(43.5, 'south', northcote)).toBeCloseTo(5.775, 5);
    });
  });

  describe('Northcote Road northbound (the bridge is 87 s before Queens Road)', () => {
    it('is at Blackhorse Road 180 - 87 = 93 s out', () => {
      expect(positionAtCountdown(93, 'north', northcote)).toBeCloseTo(5, 5);
    });
    it('heads on towards Queens Road after the pass', () => {
      expect(positionAtCountdown(-15, 'north', northcote)).toBeCloseTo(5.55 + 0.45 * (15 / 87), 5);
    });
  });

  describe('Queens Road (the spot is the station)', () => {
    it('is at Blackhorse Road one segment out northbound, Leyton Midland Road southbound', () => {
      expect(positionAtCountdown(180, 'north', queensRoad)).toBeCloseTo(5, 5);
      expect(positionAtCountdown(180, 'south', queensRoad)).toBeCloseTo(7, 5);
    });
    it('waits at the platform for 30 s after arriving, then goes', () => {
      expect(positionAtCountdown(-10, 'north', queensRoad)).toBe(6);
      expect(positionAtCountdown(-30, 'south', queensRoad)).toBe(6);
      expect(positionAtCountdown(-31, 'north', queensRoad)).toBeNull();
    });
    it('clamps to the terminus a long way out, and gives up past 30 minutes', () => {
      expect(positionAtCountdown(1800, 'south', queensRoad)).toBe(12);
      expect(positionAtCountdown(1800, 'north', queensRoad)).toBe(0);
      expect(positionAtCountdown(1801, 'north', queensRoad)).toBeNull();
    });
  });
});
