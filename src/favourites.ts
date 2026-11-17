// The user's starred viewpoints: an ordered list of viewpoint ids, oldest
// first, kept in localStorage. Pure: storage is passed in.
import { DEFAULT_VIEWPOINT_ID, getViewpointById } from './viewpoints';

export const FAVOURITES_KEY = 'wtt_favourites';
/** The single favourite the app kept before favourites became a list. */
export const LEGACY_FAVOURITE_KEY = 'wtt_favourite_viewpoint';
/** Written on every successful poll, so its presence marks a returning user. */
export const RETURNING_USER_KEY = 'wtt_fact_index';

function parseList(raw: string | null): string[] | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const ids: string[] = [];
  for (const item of parsed) {
    if (typeof item === 'string' && getViewpointById(item) && !ids.includes(item)) ids.push(item);
  }
  return ids;
}

/**
 * The stored list, or what it should start as:
 *  - the old single favourite, if there was one;
 *  - else East Avenue for a returning user, since that is the screen they
 *    have been opening on;
 *  - else empty.
 * `migrated` means the list was not stored yet and the caller must save it,
 * even when empty: otherwise a new user would be taken for a returning one on
 * their next visit and handed a favourite they never chose.
 */
export function loadFavourites(read: (key: string) => string | null): { ids: string[]; migrated: boolean } {
  const stored = parseList(read(FAVOURITES_KEY));
  if (stored !== null) return { ids: stored, migrated: false };

  const legacy = read(LEGACY_FAVOURITE_KEY);
  if (legacy !== null && getViewpointById(legacy)) return { ids: [legacy], migrated: true };
  if (read(RETURNING_USER_KEY) !== null) return { ids: [DEFAULT_VIEWPOINT_ID], migrated: true };
  return { ids: [], migrated: true };
}

/** Star or un-star. A newly starred viewpoint goes last. */
export function toggleFavourite(ids: readonly string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  if (!getViewpointById(id)) return [...ids];
  return [...ids, id];
}

export function saveFavourites(
  write: (key: string, value: string) => void,
  remove: (key: string) => void,
  ids: readonly string[],
): void {
  write(FAVOURITES_KEY, JSON.stringify(ids));
  remove(LEGACY_FAVOURITE_KEY);
}
