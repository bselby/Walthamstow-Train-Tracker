import { describe, expect, it, vi } from 'vitest';
import type { TapPass } from '../src/tap';
import { TAP_ENDPOINT, buildTapPayload, sendTap, shouldSendTaps } from '../src/tapClient';

const pass: TapPass = {
  viewpointId: 'east-avenue',
  direction: 'north',
  vehicleId: 'veh-1',
  berthTrainId: '2A34',
  destination: 'Chingford',
  shownAtMs: 1_000,
  predictedAtShowMs: 90_000,
  latestPredictedMs: 95_000,
};

const ctx = {
  tapMs: 10_000,
  nowMs: 10_450,
  predictedAtTapMs: 80_000,
  source: 'berth' as const,
  berthStepMs: 79_000,
  tflExpectedArrivalMs: 82_000,
  atViewpoint: 'yes' as const,
  deviceId: 'dev-1',
};

describe('buildTapPayload', () => {
  it('copies ids from the pass and computes msSinceTap', () => {
    expect(buildTapPayload(pass, ctx)).toEqual({
      viewpointId: 'east-avenue',
      direction: 'north',
      msSinceTap: 450,
      predictedAtShowMs: 90_000,
      predictedAtTapMs: 80_000,
      source: 'berth',
      berthStepMs: 79_000,
      tflExpectedArrivalMs: 82_000,
      vehicleId: 'veh-1',
      berthTrainId: '2A34',
      atViewpoint: 'yes',
      deviceId: 'dev-1',
    });
  });

  it('keeps null ids and times as null', () => {
    const p = buildTapPayload(
      { ...pass, vehicleId: null, berthTrainId: null },
      { ...ctx, berthStepMs: null, tflExpectedArrivalMs: null, source: 'tfl' },
    );
    expect(p.vehicleId).toBeNull();
    expect(p.berthTrainId).toBeNull();
    expect(p.berthStepMs).toBeNull();
    expect(p.tflExpectedArrivalMs).toBeNull();
    expect(p.source).toBe('tfl');
  });
});

describe('sendTap', () => {
  const payload = buildTapPayload(pass, ctx);

  it('POSTs JSON to the endpoint with keepalive', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await expect(sendTap(payload, fetchFn as unknown as typeof fetch)).resolves.toBe('sent');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(TAP_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it('reports failed when fetch rejects, without retrying', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(sendTap(payload, fetchFn as unknown as typeof fetch)).resolves.toBe('failed');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('reports failed when the server returns 500', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(sendTap(payload, fetchFn as unknown as typeof fetch)).resolves.toBe('failed');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('reports failed when fetch is unavailable', async () => {
    vi.stubGlobal('fetch', undefined);
    try {
      await expect(sendTap(payload)).resolves.toBe('failed');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('shouldSendTaps', () => {
  it('is true only for the live site', () => {
    expect(shouldSendTaps('e17trains.uk')).toBe(true);
    expect(shouldSendTaps('deploy-preview-12--walthamstow-train-tracker.netlify.app')).toBe(false);
    expect(shouldSendTaps('localhost')).toBe(false);
  });
});
