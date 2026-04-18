export interface LatLng {
  lat: number;
  lng: number;
}

export interface WalkingEstimate {
  metres: number;
  seconds: number;
}

/** Walking pace in metres per second (~5 km/h — a steady but not rushed adult pace). */
export const WALKING_SPEED_MPS = 1.4;

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two points on Earth's surface, in metres. */
export function haversineMetres(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Estimate metres + seconds to walk from `userPos` to `bridge` at `WALKING_SPEED_MPS`. */
export function walkingEstimate(userPos: LatLng, bridge: LatLng): WalkingEstimate {
  const metres = haversineMetres(userPos, bridge);
  return { metres, seconds: metres / WALKING_SPEED_MPS };
}

/**
 * Human-readable walking label. Case preserved for CSS text-transform to decide.
 *   < 50 m   → "At the bridge"
 *   < 1000 m → "N min walk · M m" (minutes ceil, metres rounded to nearest 10)
 *   ≥ 1000 m → "N min walk · X.X km" (minutes ceil, km rounded to 1 dp)
 */
export function formatWalkingLabel(est: WalkingEstimate): string {
  if (est.metres < 50) return 'At the bridge';
  const minutes = Math.ceil(est.seconds / 60);
  if (est.metres < 1000) {
    const roundedMetres = Math.round(est.metres / 10) * 10;
    return `${minutes} min walk · ${roundedMetres} m`;
  }
  const km = Math.round(est.metres / 100) / 10;
  return `${minutes} min walk · ${km.toFixed(1)} km`;
}
