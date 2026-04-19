export const WALTHAMSTOW_CENTRAL_STOPPOINT_ID = '910GWLTWCEN';

export const TFL_ARRIVALS_URL = (stopPointId: string) =>
  `https://api.tfl.gov.uk/StopPoint/${stopPointId}/Arrivals`;

// Bridge-time offsets derived from field observation on East Avenue.
// Northbound: trains stop at Walthamstow Central, then cross the bridge 90s after arriving.
// Southbound: trains cross the bridge 20s before arriving at Walthamstow Central.
export const NORTHBOUND_OFFSET_SECONDS = 90;
export const SOUTHBOUND_OFFSET_SECONDS = -20;

export const POLL_INTERVAL_MS = 20_000;
export const STALE_THRESHOLD_MS = 60_000;

// East Avenue bridge over the Weaver line, between Walthamstow Central and Wood Street.
// Pin confirmed by the user from Google Maps (the bridge deck they walk across),
// accurate to ~5 m. Previous OSM-midpoint was about 20 m off.
export const EAST_AVE_BRIDGE = {
  lat: 51.583486,
  lng: -0.014564,
} as const;
