# RTT WMW capture — schema notes

Live capture of `GET https://data.rtt.io/rtt/location?code=gb-nr:WMW` taken
2026-04-25 ~10:00 BST. Eight services in the default 60-minute window, all
London Overground passenger (Saturday morning — typical sparse-freight window).

The plan was written against the legacy Pull API. The new RTT API has a
different shape, different paths, and a different auth flow. The deviations are
documented below — implementation tasks should target what's here, not the
original spec.

## Auth flow

The portal-issued token is a **refresh token**. Every API call needs an
**access token** obtained via:

```
GET https://data.rtt.io/api/get_access_token
Authorization: Bearer <refresh-token>
```

Returns:

```json
{
  "token": "<access-jwt>",
  "entitlements": [],
  "validUntil": "2026-04-25T09:17:46+00:00"
}
```

Access tokens are **~20 minutes long** (`exp` 1200 s after `iat` in the access
JWT payload). The proxy must cache the access token until `validUntil` and
refresh on demand.

Per the spec: "It is a requirement that no token is placed in a distributable
user application unless specifically authorised by us… If we identify a token is
in a downstream user application, it **will** be revoked." The Netlify Function
proxy is mandatory — no CORS escape hatch, no client-side token.

## Endpoint deviations from the plan

| Plan assumed | Actual |
|---|---|
| `GET /api/v1/json/search/WMW` | `GET /rtt/location?code=gb-nr:WMW` |
| HTTP Basic Auth | Bearer JWT, refresh→access two-step |
| `api.rtt.io` | `data.rtt.io` |
| `serviceType: 'freight'\|'train'` | `scheduleMetadata.inPassengerService: boolean` |
| `atocCode: 'DB'` | `scheduleMetadata.operator.code: 'DB'` |
| `trainIdentity: '6M23'` | **No headcode in /rtt/location response.** Service-level detail (`/rtt/service?…`) likely needed if we want headcode |
| `gbttBookedArrival/realtimeArrival` etc. | `temporalData.arrival.{scheduleAdvertised, realtimeForecast}` and same under `temporalData.departure` |
| `isPassengerCancelled: bool` at row level | `temporalData.arrival.isCancelled` + `temporalData.departure.isCancelled` |
| `locationDetail.origin/destination[]` | Top-level `origin[]` / `destination[]`, each with nested `location.description` |

## Response shape (verified against fixture)

```ts
{
  systemStatus: { realtimeNetworkRail: 'OK', rttCore: 'OK' },
  query: {
    location: { namespace: 'gb-nr', description: 'Walthamstow Queens Road',
                shortCodes: ['WMW'], longCodes: ['WLTHQRD'] },
    timeFrom: ISO8601, timeTo: ISO8601, detailed: false,
  },
  services: [{
    temporalData: {
      arrival?:   { scheduleInternal, scheduleAdvertised, realtimeForecast, isCancelled },
      departure?: { scheduleInternal, scheduleAdvertised, realtimeForecast, isCancelled },
      scheduledCallType: 'ADVERTISED_OPEN' | …,
      realtimeCallType:  'ADVERTISED_OPEN' | …,
      displayAs: 'CALL' | 'PASS' | …,   // 'PASS' expected for non-stopping freight
      isInterpolated: boolean,
    },
    locationMetadata: {
      platform?: { planned, forecast },
    },
    scheduleMetadata: {
      uniqueIdentity: 'gb-nr:P51307:2026-04-25',
      namespace: 'gb-nr',
      identity: 'P51307',                     // portion ID — NOT a headcode
      departureDate: '2026-04-25',
      operator: { code: 'LO', name: 'London Overground' },
      modeType: 'TRAIN' | …,
      inPassengerService: boolean,            // primary freight discriminant
    },
    origin:      [{ location: { description, longCodes }, temporalData: { … } }],
    destination: [{ location: { description, longCodes }, temporalData: { … } }],
  }, …]
}
```

## Freight-detection strategy

Primary discriminant: `scheduleMetadata.inPassengerService === false`.

Secondary check (defence-in-depth): operator code in the freight set
`{DB, FL, GB, DR, CW, EH, VR, …}`. The OR catches any case where `inPassengerService`
is missing or wrong, which the legacy plan flagged as known to happen during
upstream TD outages.

ECS (empty coaching stock) policy from the spec: treat as passenger. ECS rows
should still report `inPassengerService: true` on this API — confirm during
implementation against an ECS-heavy capture (late evening / early morning).

`displayAs: 'PASS'` is expected for through-freight at WMW (freight doesn't
stop at passenger stations). The pass time will be in
`temporalData.departure.realtimeForecast` only (no `arrival` block when
`isCall: false` equivalent — verify when a freight is in the capture).

## Rate-limit headers

Returned on every response:

```
x-ratelimit-limit-minute:    30
x-ratelimit-remaining-minute: 30
x-ratelimit-limit-hour:      750
x-ratelimit-remaining-hour:  748
x-ratelimit-limit-day:       9000
x-ratelimit-remaining-day:   8998
x-ratelimit-limit-week:      30000
x-ratelimit-remaining-week:  29998
```

The proxy should pass these through (or use them to back off). Our 45 s polling
budgets to ~80/hour, which is well inside the 750/hour cap.

## CORS

`access-control-allow-headers` and `access-control-allow-methods` are present but
`access-control-allow-origin` is **not** — direct browser calls would fail CORS
even if tokens were public. Reinforces the proxy requirement.

## Open questions for later tasks

- **No freight in this capture** — Saturday morning is the GOBLIN's quietest
  freight window. Re-capture on a weekday afternoon (13:00–17:00 BST) and
  append a second fixture if any field shapes differ for freight rows.
- **Headcode** — does `?detailed=true` on `/rtt/location` actually surface
  `headcode`? It didn't in this capture (default mode). The OpenAPI spec
  doesn't show it as a top-level field on the location endpoint. May need
  `/rtt/service?…` per service for full headcode resolution, or accept that
  `inPassengerService` alone is enough for freight discrimination and skip
  headcode parsing entirely.
- **Direction inference** — the plan called for inferring direction from the
  service's `locations[]` order relative to WMW. The location response only
  gives origin + destination, not the full call list. Map origin/destination
  description against a small static "north of WMW" / "south of WMW" lookup
  on the GOBLIN, or fetch `/rtt/service?…` for the called locations.
