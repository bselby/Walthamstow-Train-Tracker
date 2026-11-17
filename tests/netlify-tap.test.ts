import { describe, it, expect } from 'vitest';
import { createHandler, type TapStore } from '../netlify/functions/tap';
import type { TapPayload } from '../src/tapClient';

const NOW = 1_800_000_000_000;

function validPayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  const base: TapPayload = {
    viewpointId: 'east-ave',
    direction: 'north',
    msSinceTap: 4000,
    predictedAtShowMs: 1000,
    predictedAtTapMs: 500,
    source: 'berth',
    berthStepMs: 2000,
    tflExpectedArrivalMs: null,
    vehicleId: 'v1',
    berthTrainId: 'b1',
    atViewpoint: 'yes',
    deviceId: 'abcd1234-ef56',
  };
  return { ...base, ...over };
}

function setup(failing = false) {
  const calls: Array<{ key: string; value: Record<string, unknown> }> = [];
  const store: TapStore = {
    async setJSON(key, value) {
      if (failing) throw new Error('blobs down');
      calls.push({ key, value: value as Record<string, unknown> });
    },
  };
  const handler = createHandler(() => store, () => NOW);
  return { calls, handler };
}

function post(body: unknown): Request {
  return new Request('http://localhost/.netlify/functions/tap', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('tap function', () => {
  it('stores a valid POST and returns 204', async () => {
    const { calls, handler } = setup();
    const res = await handler(post(validPayload()));
    expect(res.status).toBe(204);
    expect(calls).toHaveLength(1);
    expect(calls[0].key.startsWith('east-ave/north/')).toBe(true);
    expect(calls[0].key).toBe(`east-ave/north/${NOW}-abcd1234`);
  });

  it('adds tapAtMs and receivedAtMs to the stored record', async () => {
    const { calls, handler } = setup();
    await handler(post(validPayload()));
    expect(calls[0].value).toMatchObject({
      ...validPayload(),
      tapAtMs: NOW - 4000,
      receivedAtMs: NOW,
    });
  });

  it('answers OPTIONS with 204 and CORS headers', async () => {
    const { handler } = setup();
    const res = await handler(new Request('http://localhost/x', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('rejects GET with 405', async () => {
    const { handler } = setup();
    const res = await handler(new Request('http://localhost/x'));
    expect(res.status).toBe(405);
  });

  const bad: Array<[string, () => unknown]> = [
    ['invalid JSON', () => '{not json'],
    ['body over 2 KB', () => validPayload({ vehicleId: 'x'.repeat(2100) })],
    ['unknown viewpointId', () => validPayload({ viewpointId: 'nowhere' })],
    ['bad direction', () => validPayload({ direction: 'east' })],
    ['negative msSinceTap', () => validPayload({ msSinceTap: -1 })],
    ['msSinceTap over 120000', () => validPayload({ msSinceTap: 120001 })],
    ['non-number msSinceTap', () => validPayload({ msSinceTap: '5' })],
    ['null predictedAtShowMs', () => validPayload({ predictedAtShowMs: null })],
    ['non-finite number', () => '{"msSinceTap":1e999}'],
    ['bad atViewpoint', () => validPayload({ atViewpoint: 'maybe' })],
    ['short deviceId', () => validPayload({ deviceId: 'abc' })],
    ['uppercase deviceId', () => validPayload({ deviceId: 'ABCDEFGH1234' })],
    ['bad source', () => validPayload({ source: 'gps' })],
    ['array body', () => []],
  ];
  it.each(bad)('returns 400 and stores nothing for %s', async (_name, make) => {
    const { calls, handler } = setup();
    const res = await handler(post(make()));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('returns 502 without throwing when the store fails', async () => {
    const { handler } = setup(true);
    const res = await handler(post(validPayload()));
    expect(res.status).toBe(502);
  });
});
