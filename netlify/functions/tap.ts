// Netlify Function — stores one "train's here" tap per POST in Netlify Blobs.
//
// Validates the small JSON record sent by src/tapClient.ts, then writes it to
// the 'taps' store under <viewpointId>/<direction>/<receivedAtMs>-<device>.
// Per-device rate limiting is deferred to phase 2 (aggregation discards repeat
// taps); phase 1 relies on this validation and the 2 KB body limit.

import { getStore } from '@netlify/blobs';
import { VIEWPOINTS } from '../../src/viewpoints';
import type { TapPayload } from '../../src/tapClient';

const MAX_BODY_CHARS = 2048;
const MAX_MS_SINCE_TAP = 120_000;
const DEVICE_ID_RE = /^[a-z0-9-]{8,64}$/;
const VIEWPOINT_IDS = new Set(VIEWPOINTS.map((v) => v.id));

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// getStore('taps') returns a Blobs Store whose setJSON resolves to a
// WriteResult; we only need it to resolve or reject.
export interface TapStore {
  setJSON(key: string, value: unknown): Promise<unknown>;
}

function response(status: number, body?: unknown): Response {
  const headers: Record<string, string> = { ...CORS_HEADERS };
  if (body === undefined) return new Response(null, { status, headers });
  headers['Content-Type'] = 'application/json';
  return new Response(JSON.stringify(body), { status, headers });
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNullableNumber(v: unknown): v is number | null {
  return v === null || isFiniteNumber(v);
}

function isNullableString(v: unknown): v is string | null {
  return v === null || (typeof v === 'string' && v.length <= 128);
}

function parsePayload(text: string): TapPayload | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;

  if (typeof p.viewpointId !== 'string' || !VIEWPOINT_IDS.has(p.viewpointId)) return null;
  if (p.direction !== 'north' && p.direction !== 'south') return null;
  if (!isFiniteNumber(p.msSinceTap) || p.msSinceTap < 0 || p.msSinceTap > MAX_MS_SINCE_TAP) return null;
  if (!isFiniteNumber(p.predictedAtShowMs) || !isFiniteNumber(p.predictedAtTapMs)) return null;
  if (p.source !== 'berth' && p.source !== 'tfl') return null;
  if (!isNullableNumber(p.berthStepMs) || !isNullableNumber(p.tflExpectedArrivalMs)) return null;
  if (!isNullableString(p.vehicleId) || !isNullableString(p.berthTrainId)) return null;
  if (p.atViewpoint !== 'yes' && p.atViewpoint !== 'no' && p.atViewpoint !== 'unknown') return null;
  if (typeof p.deviceId !== 'string' || !DEVICE_ID_RE.test(p.deviceId)) return null;

  // Rebuild from known fields so unexpected extras are never stored.
  return {
    viewpointId: p.viewpointId,
    direction: p.direction,
    msSinceTap: p.msSinceTap,
    predictedAtShowMs: p.predictedAtShowMs,
    predictedAtTapMs: p.predictedAtTapMs,
    source: p.source,
    berthStepMs: p.berthStepMs,
    tflExpectedArrivalMs: p.tflExpectedArrivalMs,
    vehicleId: p.vehicleId,
    berthTrainId: p.berthTrainId,
    atViewpoint: p.atViewpoint,
    deviceId: p.deviceId,
  };
}

export function createHandler(
  getTapStore: () => TapStore,
  now: () => number = Date.now,
): (request: Request) => Promise<Response> {
  return async function handler(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return response(204);
    if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' });

    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return response(400, { error: 'body_too_large' });
    const payload = parsePayload(text);
    if (!payload) return response(400, { error: 'invalid_payload' });

    const receivedAtMs = now();
    const record = { ...payload, tapAtMs: receivedAtMs - payload.msSinceTap, receivedAtMs };
    const key = `${payload.viewpointId}/${payload.direction}/${receivedAtMs}-${payload.deviceId.slice(0, 8)}`;
    try {
      await getTapStore().setJSON(key, record);
    } catch {
      return response(502, { error: 'store_failed' });
    }
    return response(204);
  };
}

// Netlify's v2 Request/Response API: a default export only. A named `handler`
// export would make the bundler treat this as a v1 Lambda function.
// getStore is called per request, not at module load, so importing this
// module in tests does not need Netlify's runtime.
export default createHandler(() => getStore('taps'));
