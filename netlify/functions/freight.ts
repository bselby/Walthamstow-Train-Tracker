// Netlify Function — Realtime Trains freight proxy.
//
// Holds the RTT refresh token in env, exchanges for a short-lived access
// token, calls /rtt/location?code=gb-nr:<station>, filters to freight,
// normalises to the FreightResponse DTO that src/freight.ts parses.
//
// Token cache: module-scope. Netlify warm starts reuse it within the
// access-token lifetime (~20 min); cold starts pay one extra round-trip.

import { isFreightByHeadcode } from '../../src/freight';

const RTT_BASE = 'https://data.rtt.io';

// ATOC codes for UK freight operators. Defence-in-depth: if upstream omits
// inPassengerService for any reason, this still classifies the row correctly.
const FREIGHT_ATOC_CODES = new Set(['DB', 'FL', 'GB', 'DR', 'CW', 'EH', 'VR']);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

let cachedAccessToken: string | null = null;
let cachedValidUntilMs = 0;

class TokenExchangeError extends Error {
  constructor(public httpStatus: number) {
    super(`token_exchange_${httpStatus}`);
  }
}

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=30',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

async function getAccessToken(refreshToken: string): Promise<string> {
  // 30s margin so we don't hand out a token that expires mid-request.
  if (cachedAccessToken && cachedValidUntilMs > Date.now() + 30_000) {
    return cachedAccessToken;
  }
  const r = await fetch(`${RTT_BASE}/api/get_access_token`, {
    headers: { Authorization: `Bearer ${refreshToken}` },
  });
  if (!r.ok) throw new TokenExchangeError(r.status);
  const j = (await r.json()) as { token: string; validUntil: string };
  cachedAccessToken = j.token;
  cachedValidUntilMs = new Date(j.validUntil).getTime();
  return j.token;
}

interface RttService {
  temporalData?: {
    departure?: { scheduleAdvertised?: string; realtimeForecast?: string; realtimeActual?: string; isCancelled?: boolean };
    arrival?: { scheduleAdvertised?: string; realtimeForecast?: string; realtimeActual?: string; isCancelled?: boolean };
    displayAs?: string;
  };
  scheduleMetadata?: {
    identity?: string;
    operator?: { code?: string; name?: string };
    inPassengerService?: boolean;
  };
  origin?: Array<{ location?: { description?: string } }>;
  destination?: Array<{ location?: { description?: string } }>;
}

interface RttLocationResponse {
  query?: { timeFrom?: string };
  services?: RttService[];
}

function getOffsetSuffix(query: RttLocationResponse['query']): string {
  const ts = query?.timeFrom ?? '';
  const m = ts.match(/([+-]\d{2}:\d{2})$/);
  return m ? m[1] : '+00:00';
}

function parseRttTimestamp(naive: string | undefined, offset: string, now: number): { iso: string; secondsAway: number } | null {
  if (!naive) return null;
  // RTT serialises local time without an offset suffix. Append the offset
  // taken from query.timeFrom so JS parses it as the right instant.
  const target = new Date(`${naive}${offset}`);
  const ms = target.getTime();
  if (!Number.isFinite(ms)) return null;
  return { iso: target.toISOString(), secondsAway: Math.round((ms - now) / 1000) };
}

function isFreightService(s: RttService): boolean {
  const meta = s.scheduleMetadata ?? {};
  if (meta.inPassengerService === false) return true;
  // Defence-in-depth fallbacks for when inPassengerService is absent.
  const opCode = meta.operator?.code;
  if (opCode && FREIGHT_ATOC_CODES.has(opCode)) return true;
  if (isFreightByHeadcode(meta.identity)) return true;
  return false;
}

// Eastward (Suffragette outbound) terminus heuristic. Used for direction
// inference when the service passes through Walthamstow Queens Road.
const EAST_TERMINUS_PATTERN = /barking|dagenham|upminster|tilbury|gateway|grays|shoeburyness|felixstowe|harwich|parkeston|thamesport/i;

function inferDirection(origin: string, destination: string): 'outbound' | 'inbound' {
  if (EAST_TERMINUS_PATTERN.test(destination)) return 'outbound';
  if (EAST_TERMINUS_PATTERN.test(origin)) return 'inbound';
  return 'inbound';
}

export async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'GET') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  const url = new URL(request.url);
  const station = url.searchParams.get('station');
  if (!station || !/^[A-Z]{3}$/.test(station)) {
    return jsonResponse(400, { error: 'invalid_station' });
  }

  const refresh = process.env.RTT_REFRESH_TOKEN;
  if (!refresh) {
    return jsonResponse(500, { error: 'not_configured' });
  }

  let access: string;
  try {
    access = await getAccessToken(refresh);
  } catch (e) {
    if (e instanceof TokenExchangeError && (e.httpStatus === 401 || e.httpStatus === 403)) {
      return jsonResponse(502, { error: 'upstream_auth' });
    }
    return jsonResponse(502, { error: 'upstream_net' });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${RTT_BASE}/rtt/location?code=gb-nr:${station}`, {
      headers: { Authorization: `Bearer ${access}` },
    });
  } catch {
    return jsonResponse(502, { error: 'upstream_net' });
  }

  if (upstream.status === 401 || upstream.status === 403) {
    // Cached access token may be stale; clear so the next request retries.
    cachedAccessToken = null;
    cachedValidUntilMs = 0;
    return jsonResponse(502, { error: 'upstream_auth' });
  }
  if (upstream.status === 429) {
    const retryAfter = upstream.headers.get('Retry-After') ?? '300';
    return jsonResponse(429, { error: 'rate_limited' }, { 'Retry-After': retryAfter });
  }
  if (!upstream.ok) {
    return jsonResponse(502, { error: 'upstream_shape' });
  }

  const raw = (await upstream.json()) as RttLocationResponse;
  const offset = getOffsetSuffix(raw.query);
  const now = Date.now();

  const arrivals = (raw.services ?? [])
    .filter(isFreightService)
    .map((s) => {
      const dep = s.temporalData?.departure ?? {};
      // Prefer recorded > predicted > scheduled. PASS rows usually have a
      // departure block only (no arrival, since freight doesn't stop).
      const passTime = parseRttTimestamp(dep.realtimeActual, offset, now)
        ?? parseRttTimestamp(dep.realtimeForecast, offset, now)
        ?? parseRttTimestamp(dep.scheduleAdvertised, offset, now);
      if (!passTime) return null;
      const meta = s.scheduleMetadata ?? {};
      const origin = s.origin?.[0]?.location?.description ?? '';
      const destination = s.destination?.[0]?.location?.description ?? '';
      // Identity here is RTT's portion ID (e.g. 'P51307'). It's not a real
      // headcode; /rtt/location doesn't surface those. Pass it through anyway
      // so the proxy contract stays whole — the client treats empty strings
      // as "no headcode" for display.
      const headcode = meta.identity ?? '';
      return {
        id: meta.identity ?? `freight-${now}`,
        headcode,
        operatorCode: meta.operator?.code ?? '',
        operatorName: meta.operator?.name ?? '',
        origin,
        destination,
        timeToStation: passTime.secondsAway,
        expectedPass: passTime.iso,
        direction: inferDirection(origin, destination),
        category: 'freight' as const,
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  return jsonResponse(200, { arrivals, fetchedAt: new Date(now).toISOString() });
}

export default handler;
