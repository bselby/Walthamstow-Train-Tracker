import { describe, it, expect } from 'vitest';
import { landingFor } from '../src/landing';
import { parseRoute } from '../src/routes';
import { getViewpointById } from '../src/viewpoints';

const home = { kind: 'home' } as const;

describe('landingFor', () => {
  it('a viewpoint URL lands on that viewpoint whatever the favourites', () => {
    const route = parseRoute('/walthamstow/queens-road-station');
    expect(landingFor(route, ['east-ave'])).toEqual({ screen: 'viewpoint', viewpoint: getViewpointById('queens-road') });
  });

  it('/ with no favourites lands on home', () => {
    expect(landingFor(home, [])).toEqual({ screen: 'home' });
  });

  it('/ with exactly one favourite lands on its countdown', () => {
    expect(landingFor(home, ['northcote-rd'])).toEqual({ screen: 'viewpoint', viewpoint: getViewpointById('northcote-rd') });
  });

  it('/ with two favourites lands on home', () => {
    expect(landingFor(home, ['east-ave', 'queens-road'])).toEqual({ screen: 'home' });
  });

  it('an unknown path is treated as /', () => {
    expect(landingFor({ kind: 'unknown' }, ['east-ave'])).toEqual({ screen: 'viewpoint', viewpoint: getViewpointById('east-ave') });
    expect(landingFor({ kind: 'unknown' }, [])).toEqual({ screen: 'home' });
  });

  it('a single favourite that is no longer in the data lands on home', () => {
    expect(landingFor(home, ['gone'])).toEqual({ screen: 'home' });
  });
});
