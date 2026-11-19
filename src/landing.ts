// Where the app opens. Pure.
import type { Route } from './routes';
import { getViewpointById, type Viewpoint } from './viewpoints';

export type Landing =
  | { screen: 'home' }
  | { screen: 'viewpoint'; viewpoint: Viewpoint }
  | { screen: 'ticket' }
  | { screen: 'how' }
  | { screen: 'map' };

/**
 * A viewpoint's own URL opens that viewpoint. The root URL (and anything
 * unrecognised) opens straight on the favourite when there is exactly one,
 * as the app always has; with none, or with several to choose from, it opens
 * on home. The ticket, the explainer and the map open on themselves.
 */
export function landingFor(route: Route, favouriteIds: readonly string[]): Landing {
  if (route.kind === 'ticket') return { screen: 'ticket' };
  if (route.kind === 'how') return { screen: 'how' };
  if (route.kind === 'map') return { screen: 'map' };
  if (route.kind === 'viewpoint') return { screen: 'viewpoint', viewpoint: route.viewpoint };
  if (favouriteIds.length === 1) {
    const viewpoint = getViewpointById(favouriteIds[0]);
    if (viewpoint) return { screen: 'viewpoint', viewpoint };
  }
  return { screen: 'home' };
}
