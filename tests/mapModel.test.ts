import { describe, it, expect } from 'vitest';
import { mapPins, firstView, parseCamera } from '../src/mapModel';
import { VIEWPOINTS } from '../src/viewpoints';

// About 20 m from Queens Road.
const HERE = { lat: 51.5816, lng: -0.024 };

describe('mapPins', () => {
  it('gives name, line, href and no walk without a position', () => {
    const pins = mapPins(VIEWPOINTS, null);
    const pin = pins.find((p) => p.name === 'East Avenue Bridge')!;
    expect(pin.href).toBe('/walthamstow/east-avenue-bridge');
    expect(pin.lineName).toBe('Weaver');
    expect(pin.lineClass).toBe('line-weaver');
    expect(pin.walk).toBeNull();
    const names = pins.map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('adds a walk label with a position', () => {
    for (const pin of mapPins(VIEWPOINTS, HERE)) expect(pin.walk).toMatch(/min walk|here/);
  });
});

describe('firstView', () => {
  it('encloses every spot without a position', () => {
    const [[w, s], [e, n]] = firstView(VIEWPOINTS, null);
    for (const v of VIEWPOINTS) {
      expect(v.coords.lng).toBeGreaterThanOrEqual(w);
      expect(v.coords.lng).toBeLessThanOrEqual(e);
      expect(v.coords.lat).toBeGreaterThanOrEqual(s);
      expect(v.coords.lat).toBeLessThanOrEqual(n);
    }
  });

  it('is the box around the position and the nearest spot', () => {
    const queens = VIEWPOINTS.find((v) => v.name.startsWith('Queens Road'))!;
    const [[w, s], [e, n]] = firstView(VIEWPOINTS, HERE);
    expect(w).toBe(Math.min(HERE.lng, queens.coords.lng));
    expect(e).toBe(Math.max(HERE.lng, queens.coords.lng));
    expect(s).toBe(Math.min(HERE.lat, queens.coords.lat));
    expect(n).toBe(Math.max(HERE.lat, queens.coords.lat));
  });
});

describe('parseCamera', () => {
  it('rejects bad values', () => {
    expect(parseCamera(null)).toBeNull();
    expect(parseCamera('x')).toBeNull();
    expect(parseCamera({ lng: NaN, lat: 51, zoom: 14 })).toBeNull();
    expect(parseCamera({ lng: 0, lat: 120, zoom: 14 })).toBeNull();
    expect(parseCamera({ lng: 0, lat: 51, zoom: 30 })).toBeNull();
  });
  it('accepts a good camera', () => {
    expect(parseCamera({ lng: -0.02, lat: 51.58, zoom: 14 })).toEqual({ lng: -0.02, lat: 51.58, zoom: 14 });
  });
});
