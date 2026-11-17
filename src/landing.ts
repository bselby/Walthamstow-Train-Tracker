// Where the app opens. Pure.
import type { Route } from './routes';
import { DEFAULT_VIEWPOINT_ID, getViewpointById, type Viewpoint } from './viewpoints';

export type Landing = { screen: 'home' } | { screen: 'viewpoint'; viewpoint: Viewpoint };

/**
 * A viewpoint's own URL opens that viewpoint. The root URL (and anything
 * unrecognised) opens straight on the favourite when there is exactly one,
 * as the app always has; with none, or with several to choose from, it opens
 * on home.
 */
export function landingFor(route: Route, favouriteIds: readonly string[]): Landing {
  if (route.kind === 'viewpoint') return { screen: 'viewpoint', viewpoint: route.viewpoint };
  if (favouriteIds.length === 1) {
    const viewpoint = getViewpointById(favouriteIds[0]);
    if (viewpoint) return { screen: 'viewpoint', viewpoint };
  }
  return { screen: 'home' };
}

/** Stand-in for home until the home screen exists: the first favourite, else
 *  East Avenue. */
export function fallbackViewpoint(favouriteIds: readonly string[]): Viewpoint {
  for (const id of favouriteIds) {
    const viewpoint = getViewpointById(id);
    if (viewpoint) return viewpoint;
  }
  return getViewpointById(DEFAULT_VIEWPOINT_ID)!;
}
