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

  it('the ticket and explainer addresses open those screens, not the single favourite', () => {
    expect(landingFor({ kind: 'ticket' }, ['x'])).toEqual({ screen: 'ticket' });
    expect(landingFor({ kind: 'ticket' }, [])).toEqual({ screen: 'ticket' });
    expect(landingFor({ kind: 'how' }, ['east-ave'])).toEqual({ screen: 'how' });
  });

  it('the map address lands on the map, even with one favourite', () => {
    expect(landingFor(parseRoute('/map'), ['east-ave'])).toEqual({ screen: 'map' });
    expect(landingFor({ kind: 'map' }, [])).toEqual({ screen: 'map' });
  });
});
