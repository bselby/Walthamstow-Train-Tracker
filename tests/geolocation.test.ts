import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The geolocation module holds singleton state at the module level. Use dynamic
// import inside each test so a fresh module instance is used per case, avoiding
// cross-test state leakage.

interface WatchCallArgs {
  success: PositionCallback;
  error: PositionErrorCallback;
  options: PositionOptions;
}

function mockGeolocation() {
  const calls: WatchCallArgs[] = [];
  const g = {
    watchPosition: vi.fn<
      (s: PositionCallback, e: PositionErrorCallback, o: PositionOptions) => number
    >((success, error, options) => {
      calls.push({ success, error, options });
      return calls.length; // watchId
    }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  };
  Object.defineProperty(navigator, 'geolocation', { value: g, configurable: true });
  return { g, calls };
}

describe('geolocation module', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes enableHighAccuracy: true to watchPosition (required for GPS updates as the user walks)', async () => {
    const { calls } = mockGeolocation();
    const mod = await import('../src/geolocation');
    mod.start();
    expect(calls).toHaveLength(1);
    expect(calls[0].options.enableHighAccuracy).toBe(true);
  });

  it('uses a maximumAge of at most 10 seconds so positions stay fresh while walking', async () => {
    const { calls } = mockGeolocation();
    const mod = await import('../src/geolocation');
    mod.start();
    expect(calls[0].options.maximumAge).toBeLessThanOrEqual(10_000);
  });

  it('emits granted state with parsed lat/lng when a position is received', async () => {
    const { calls } = mockGeolocation();
    const mod = await import('../src/geolocation');
    const states: Array<{ status: string; position: unknown }> = [];
    mod.subscribe((s) => states.push(s));

    mod.start();
    const success = calls[0].success;
    success({
      coords: {
        latitude: 51.5,
        longitude: -0.1,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: Date.now(),
      toJSON: () => ({}),
    } as GeolocationPosition);

    const last = states.at(-1)!;
    expect(last.status).toBe('granted');
    expect(last.position).toEqual({ lat: 51.5, lng: -0.1 });
  });

  it('emits denied state when the user refuses permission', async () => {
    const { calls } = mockGeolocation();
    const mod = await import('../src/geolocation');
    const states: Array<{ status: string }> = [];
    mod.subscribe((s) => states.push(s));

    mod.start();
    const error = calls[0].error;
    error({
      code: 1, // PERMISSION_DENIED
      message: 'denied',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } as GeolocationPositionError);

    expect(states.at(-1)!.status).toBe('denied');
  });

  it('emits no-signal (not locating) when the GPS times out or position is unavailable', async () => {
    const { calls } = mockGeolocation();
    const mod = await import('../src/geolocation');
    const states: Array<{ status: string }> = [];
    mod.subscribe((s) => states.push(s));

    mod.start();
    const error = calls[0].error;
    error({
      code: 3, // TIMEOUT
      message: 'timeout',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } as GeolocationPositionError);

    expect(states.at(-1)!.status).toBe('no-signal');
  });

  it('stop() emits idle but preserves the last known position so the UI can keep showing the estimate during hide/restart', async () => {
    const { calls } = mockGeolocation();
    const mod = await import('../src/geolocation');
    const states: Array<{ status: string; position: unknown }> = [];
    mod.subscribe((s) => states.push(s));

    mod.start();
    calls[0].success({
      coords: {
        latitude: 51.5, longitude: -0.1, accuracy: 10,
        altitude: null, altitudeAccuracy: null, heading: null, speed: null,
        toJSON: () => ({}),
      },
      timestamp: Date.now(),
      toJSON: () => ({}),
    } as GeolocationPosition);
    mod.stop();

    const last = states.at(-1)!;
    expect(last.status).toBe('idle');
    expect(last.position).toEqual({ lat: 51.5, lng: -0.1 });
  });

  it('updates state on subsequent position callbacks (proves the watch keeps firing)', async () => {
    const { calls } = mockGeolocation();
    const mod = await import('../src/geolocation');
    const states: Array<{ position: unknown }> = [];
    mod.subscribe((s) => states.push(s));

    mod.start();
    const success = calls[0].success;

    const basePos = (lat: number, lng: number): GeolocationPosition =>
      ({
        coords: {
          latitude: lat,
          longitude: lng,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      } as GeolocationPosition);

    success(basePos(51.585, -0.016));
    success(basePos(51.588, -0.015));
    success(basePos(51.590, -0.014));

    const positions = states.map((s) => s.position).filter(Boolean);
    // Initial idle + locating + 3 granted updates — the three granted ones must each be distinct.
    expect(positions.at(-1)).toEqual({ lat: 51.59, lng: -0.014 });
    expect(positions.at(-2)).toEqual({ lat: 51.588, lng: -0.015 });
    expect(positions.at(-3)).toEqual({ lat: 51.585, lng: -0.016 });
  });
});
