import type { TapPass } from './tap';

export interface TapPayload {
  viewpointId: string;
  direction: 'north' | 'south';
  msSinceTap: number;
  predictedAtShowMs: number;
  predictedAtTapMs: number;
  source: 'berth' | 'tfl';
  berthStepMs: number | null;
  tflExpectedArrivalMs: number | null;
  vehicleId: string | null;
  berthTrainId: string | null;
  atViewpoint: 'yes' | 'no' | 'unknown';
  deviceId: string;
}

export const TAP_ENDPOINT = '/.netlify/functions/tap';

export function buildTapPayload(
  pass: TapPass,
  ctx: {
    tapMs: number;
    nowMs: number;
    predictedAtTapMs: number;
    source: 'berth' | 'tfl';
    berthStepMs: number | null;
    tflExpectedArrivalMs: number | null;
    atViewpoint: 'yes' | 'no' | 'unknown';
    deviceId: string;
  },
): TapPayload {
  return {
    viewpointId: pass.viewpointId,
    direction: pass.direction,
    msSinceTap: ctx.nowMs - ctx.tapMs,
    predictedAtShowMs: pass.predictedAtShowMs,
    predictedAtTapMs: ctx.predictedAtTapMs,
    source: ctx.source,
    berthStepMs: ctx.berthStepMs,
    tflExpectedArrivalMs: ctx.tflExpectedArrivalMs,
    vehicleId: pass.vehicleId,
    berthTrainId: pass.berthTrainId,
    atViewpoint: ctx.atViewpoint,
    deviceId: ctx.deviceId,
  };
}

/** Only the live site reports taps; previews and local runs send nothing. */
export function shouldSendTaps(hostname: string): boolean {
  return hostname === 'e17trains.uk';
}

/** One attempt, no retry. Never throws: a lost tap is acceptable. */
export async function sendTap(
  payload: TapPayload,
  fetchFn: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined,
): Promise<'sent' | 'failed'> {
  try {
    if (!fetchFn) return 'failed';
    const res = await fetchFn(TAP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
