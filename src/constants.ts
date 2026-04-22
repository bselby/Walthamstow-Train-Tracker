export const TFL_ARRIVALS_URL = (stopPointId: string) =>
  `https://api.tfl.gov.uk/StopPoint/${stopPointId}/Arrivals`;

export const POLL_INTERVAL_MS = 20_000;
export const STALE_THRESHOLD_MS = 60_000;
