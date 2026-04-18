import { describe, it, expect } from 'vitest';
import {
  haversineMetres,
  walkingEstimate,
  formatWalkingLabel,
  WALKING_SPEED_MPS,
} from '../src/walkingTime';

describe('haversineMetres', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMetres({ lat: 51, lng: 0 }, { lat: 51, lng: 0 })).toBe(0);
  });

  it('calculates about 111 km for 1 degree of latitude at the equator', () => {
    const d = haversineMetres({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('calculates known London pair (Westminster → Tower Bridge ≈ 3.4 km)', () => {
    const westminster = { lat: 51.4995, lng: -0.1248 };
    const towerBridge = { lat: 51.5055, lng: -0.0754 };
    const d = haversineMetres(westminster, towerBridge);
    expect(d).toBeGreaterThan(3300);
    expect(d).toBeLessThan(3700);
  });
});

describe('walkingEstimate', () => {
  it('returns metres and seconds = metres / walking speed', () => {
    const est = walkingEstimate({ lat: 51.585, lng: -0.015 }, { lat: 51.58775, lng: -0.01645 });
    expect(est.metres).toBeGreaterThan(0);
    expect(est.seconds).toBeCloseTo(est.metres / WALKING_SPEED_MPS, 5);
  });
});

describe('formatWalkingLabel', () => {
  it('shows "At the bridge" under 50m regardless of seconds', () => {
    expect(formatWalkingLabel({ metres: 30, seconds: 21 })).toBe('At the bridge');
    expect(formatWalkingLabel({ metres: 49.9, seconds: 35 })).toBe('At the bridge');
  });

  it('shows minutes + rounded metres between 50 and 1000m', () => {
    expect(formatWalkingLabel({ metres: 384, seconds: 274 })).toBe('5 min walk · 380 m');
    expect(formatWalkingLabel({ metres: 52, seconds: 37 })).toBe('1 min walk · 50 m');
  });

  it('shows minutes + km above 1000m, one decimal place', () => {
    expect(formatWalkingLabel({ metres: 2345, seconds: 1675 })).toBe('28 min walk · 2.3 km');
    expect(formatWalkingLabel({ metres: 1050, seconds: 750 })).toBe('13 min walk · 1.1 km');
  });

  it('rounds walking minutes up (ceil) so we never overpromise arrival', () => {
    // 61 seconds → 2 minutes (ceil), not 1
    expect(formatWalkingLabel({ metres: 150, seconds: 61 })).toBe('2 min walk · 150 m');
  });
});
