import { viewpointPath } from './routes';
import { formatWalkShort, haversineMetres, walkingEstimate, type LatLng } from './walkingTime';
import type { Viewpoint } from './viewpoints';

export interface MapPin {
  id: string;
  name: string;
  lineName: string;
  lineClass: string;
  href: string;
  coords: LatLng;
  walk: string | null;
}

/** [[west, south], [east, north]], as MapLibre takes it. */
export type Bounds = [[number, number], [number, number]];

export interface Camera {
  lng: number;
  lat: number;
  zoom: number;
}

export function mapPins(viewpoints: readonly Viewpoint[], position: LatLng | null): MapPin[] {
  return viewpoints
    .map((v) => ({
      id: v.id,
      name: v.name,
      lineName: v.lineName,
      lineClass: `line-${v.lineName.toLowerCase()}`,
      href: viewpointPath(v),
      coords: v.coords,
      walk: position ? formatWalkShort(walkingEstimate(position, v.coords)) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function boundsOf(points: readonly LatLng[]): Bounds {
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/** With a position: the parent and the nearest spot. Without: every spot. */
export function firstView(viewpoints: readonly Viewpoint[], position: LatLng | null): Bounds {
  if (!position) return boundsOf(viewpoints.map((v) => v.coords));
  const nearest = viewpoints.reduce((best, v) =>
    haversineMetres(position, v.coords) < haversineMetres(position, best.coords) ? v : best,
  );
  return boundsOf([position, nearest.coords]);
}

export function parseCamera(value: unknown): Camera | null {
  if (typeof value !== 'object' || value === null) return null;
  const { lng, lat, zoom } = value as Record<string, unknown>;
  if (![lng, lat, zoom].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const c = { lng: lng as number, lat: lat as number, zoom: zoom as number };
  if (c.lat < -90 || c.lat > 90 || c.zoom < 0 || c.zoom > 22) return null;
  return c;
}
