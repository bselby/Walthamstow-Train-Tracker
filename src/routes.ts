// The app's URLs: `/` is home, `/<place>/<slug>` is one viewpoint's countdown.
// Pure: nothing here touches window or history.
import { getViewpointBySlug, type Viewpoint } from './viewpoints';

export type Route =
  | { kind: 'home' }
  | { kind: 'viewpoint'; viewpoint: Viewpoint }
  | { kind: 'ticket' }
  | { kind: 'how' }
  | { kind: 'unknown' };

export const HOME_PATH = '/';
export const TICKET_PATH = '/ticket';
export const HOW_PATH = '/how-it-works';

/** Read a pathname. Case and one trailing slash are forgiven, so a typed or
 *  printed URL still lands; anything else unrecognised is `unknown`. */
export function parseRoute(pathname: string): Route {
  const path = pathname.toLowerCase().replace(/\/$/, '');
  if (path === '' || path === '/index.html') return { kind: 'home' };
  if (path === TICKET_PATH) return { kind: 'ticket' };
  if (path === HOW_PATH) return { kind: 'how' };
  const parts = path.split('/');
  // ['', place, slug]
  if (parts.length !== 3 || parts[0] !== '') return { kind: 'unknown' };
  const viewpoint = getViewpointBySlug(parts[1], parts[2]);
  return viewpoint ? { kind: 'viewpoint', viewpoint } : { kind: 'unknown' };
}

export function viewpointPath(viewpoint: Viewpoint): string {
  return `/${viewpoint.place}/${viewpoint.slug}`;
}
