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
export const NO_TRAINS_WINDOW_SECONDS = 30 * 60; // 30 minutes
