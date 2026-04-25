import { describe, it, expect, beforeEach, vi } from 'vitest';

// The handler caches the access token in module scope. To get clean state
// per test we resetModules and re-import.
async function loadHandler() {
  vi.resetModules();
  const m = await import('../netlify/functions/freight');
  return m.handler;
}

function tokenResponse() {
  return new Response(
    JSON.stringify({
      token: 'access-jwt',
      validUntil: new Date(Date.now() + 60_000).toISOString(),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function locationResponse(services: unknown[]) {
  return new Response(
    JSON.stringify({
      query: { timeFrom: '2026-04-25T22:00:00+01:00', timeTo: '2026-04-25T23:00:00+01:00' },
      services,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function mkRequest(qs: Record<string, string> = { station: 'WMW' }) {
  const url = new URL('http://localhost/.netlify/functions/freight');
  for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

describe('freight function', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.stubEnv('RTT_REFRESH_TOKEN', 'refresh-jwt');
  });

  it('returns 500 not_configured when env var missing', async () => {
    vi.stubEnv('RTT_REFRESH_TOKEN', '');
    const handler = await loadHandler();
    const res = await handler(mkRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('not_configured');
  });

  it('400 when station missing', async () => {
    const handler = await loadHandler();
    const req = new Request('http://localhost/.netlify/functions/freight');
    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  it('400 when station is not 3 uppercase letters', async () => {
    const handler = await loadHandler();
    const res = await handler(mkRequest({ station: 'wmw1' }));
    expect(res.status).toBe(400);
  });

  it('filters to freight via inPassengerService === false', async () => {
    const passenger = {
      temporalData: {
        departure: { realtimeForecast: '2026-04-25T22:23:00' },
        displayAs: 'CALL',
      },
      scheduleMetadata: {
        identity: 'P51307',
        operator: { code: 'LO', name: 'London Overground' },
        inPassengerService: true,
      },
      origin: [{ location: { description: 'Gospel Oak' } }],
      destination: [{ location: { description: 'Barking Riverside' } }],
    };
    const freight = {
      temporalData: {
        departure: { realtimeForecast: '2026-04-25T22:30:00' },
        displayAs: 'PASS',
      },
      scheduleMetadata: {
        identity: 'P99999',
        operator: { code: 'DB', name: 'DB Cargo' },
        inPassengerService: false,
      },
      origin: [{ location: { description: 'Tilbury Riverside Yard' } }],
      destination: [{ location: { description: 'Willesden Euroterminal' } }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(locationResponse([passenger, freight])),
    );
    const handler = await loadHandler();
    const res = await handler(mkRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.arrivals).toHaveLength(1);
    expect(body.arrivals[0].operatorCode).toBe('DB');
    expect(body.arrivals[0].category).toBe('freight');
    expect(body.arrivals[0].destination).toBe('Willesden Euroterminal');
  });

  it('classifies freight by operator code when inPassengerService is missing', async () => {
    const ambiguous = {
      temporalData: { departure: { realtimeForecast: '2026-04-25T22:30:00' } },
      scheduleMetadata: {
        identity: 'P12345',
        operator: { code: 'GB', name: 'GB Railfreight' },
        // inPassengerService omitted on purpose
      },
      origin: [{ location: { description: 'Doncaster' } }],
      destination: [{ location: { description: 'Tilbury' } }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(locationResponse([ambiguous])),
    );
    const handler = await loadHandler();
    const res = await handler(mkRequest());
    const body = await res.json();
    expect(body.arrivals).toHaveLength(1);
    expect(body.arrivals[0].operatorCode).toBe('GB');
  });

  it('upstream 401 on token exchange → 502 upstream_auth', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('Unauthorized', { status: 401 })));
    const handler = await loadHandler();
    const res = await handler(mkRequest());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_auth');
  });

  it('upstream 401 on location call → 502 upstream_auth', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 })),
    );
    const handler = await loadHandler();
    const res = await handler(mkRequest());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_auth');
  });

  it('upstream 429 → 429 rate_limited with Retry-After', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '300' } })),
    );
    const handler = await loadHandler();
    const res = await handler(mkRequest());
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('300');
  });

  it('every response has permissive CORS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(locationResponse([])),
    );
    const handler = await loadHandler();
    const res = await handler(mkRequest());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('OPTIONS preflight → 204 with CORS headers', async () => {
    const handler = await loadHandler();
    const req = new Request('http://localhost/.netlify/functions/freight', { method: 'OPTIONS' });
    const res = await handler(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
