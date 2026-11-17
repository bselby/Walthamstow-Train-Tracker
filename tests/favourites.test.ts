import { describe, it, expect, vi } from 'vitest';
import { loadFavourites, toggleFavourite, saveFavourites } from '../src/favourites';

const store = (obj: Record<string, string>) => (key: string) => obj[key] ?? null;

describe('loadFavourites', () => {
  it('new user: empty list, needs saving', () => {
    expect(loadFavourites(store({}))).toEqual({ ids: [], migrated: true });
  });

  it('migrates the old single favourite', () => {
    expect(loadFavourites(store({ wtt_favourite_viewpoint: 'queens-road', wtt_fact_index: '9' })))
      .toEqual({ ids: ['queens-road'], migrated: true });
  });

  it('returning user with no favourite is given East Avenue', () => {
    expect(loadFavourites(store({ wtt_fact_index: '3' }))).toEqual({ ids: ['east-ave'], migrated: true });
  });

  it('a stale legacy id falls through to the returning-user rule', () => {
    expect(loadFavourites(store({ wtt_favourite_viewpoint: 'gone', wtt_fact_index: '3' })).ids).toEqual(['east-ave']);
    expect(loadFavourites(store({ wtt_favourite_viewpoint: 'gone' })).ids).toEqual([]);
  });

  it('once saved, the list wins: an emptied list is never re-seeded', () => {
    expect(loadFavourites(store({ wtt_favourites: '[]', wtt_fact_index: '50', wtt_favourite_viewpoint: 'queens-road' })))
      .toEqual({ ids: [], migrated: false });
  });

  it('keeps order, drops unknown ids, non-strings and repeats', () => {
    expect(loadFavourites(store({ wtt_favourites: '["northcote-rd","gone",7,"east-ave","northcote-rd"]' })).ids)
      .toEqual(['northcote-rd', 'east-ave']);
  });

  it.each(['not json', '{"a":1}', 'null', '"east-ave"'])('junk %s is treated as absent', (raw) => {
    expect(loadFavourites(store({ wtt_favourites: raw, wtt_fact_index: '1' })))
      .toEqual({ ids: ['east-ave'], migrated: true });
  });

  it('works when nothing can be read at all', () => {
    expect(loadFavourites(() => null)).toEqual({ ids: [], migrated: true });
  });
});

describe('toggleFavourite', () => {
  it('appends, removes, and ignores unknown ids', () => {
    expect(toggleFavourite(['east-ave'], 'queens-road')).toEqual(['east-ave', 'queens-road']);
    expect(toggleFavourite(['east-ave', 'queens-road'], 'east-ave')).toEqual(['queens-road']);
    expect(toggleFavourite(['east-ave'], 'gone')).toEqual(['east-ave']);
  });

  it('does not change the list it was given', () => {
    const ids = ['east-ave'];
    toggleFavourite(ids, 'queens-road');
    expect(ids).toEqual(['east-ave']);
  });
});

describe('saveFavourites', () => {
  it('writes the list and removes the legacy key', () => {
    const write = vi.fn();
    const remove = vi.fn();
    saveFavourites(write, remove, ['east-ave', 'queens-road']);
    expect(write).toHaveBeenCalledWith('wtt_favourites', '["east-ave","queens-road"]');
    expect(remove).toHaveBeenCalledWith('wtt_favourite_viewpoint');
  });
});
