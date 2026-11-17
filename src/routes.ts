// The app's URLs: `/` is home, `/<place>/<slug>` is one viewpoint's countdown.
// Pure: nothing here touches window or history.
import { getViewpointBySlug, type Viewpoint } from './viewpoints';

export type Route =
  | { kind: 'home' }
  | { kind: 'viewpoint'; viewpoint: Viewpoint }
  | { kind: 'unknown' };

export const HOME_PATH = '/';

/** Read a pathname. Case and one trailing slash are forgiven, so a typed or
 *  printed URL still lands; anything else unrecognised is `unknown`. */
export function parseRoute(pathname: string): Route {
  const path = pathname.toLowerCase().replace(/\/$/, '');
  if (path === '' || path === '/index.html') return { kind: 'home' };
  const parts = path.split('/');
  // ['', place, slug]
  if (parts.length !== 3 || parts[0] !== '') return { kind: 'unknown' };
  const viewpoint = getViewpointBySlug(parts[1], parts[2]);
  return viewpoint ? { kind: 'viewpoint', viewpoint } : { kind: 'unknown' };
}

export function viewpointPath(viewpoint: Viewpoint): string {
  return `/${viewpoint.place}/${viewpoint.slug}`;
}
