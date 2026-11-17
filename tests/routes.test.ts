import { describe, it, expect } from 'vitest';
import { parseRoute, viewpointPath, HOME_PATH } from '../src/routes';
import { VIEWPOINTS, getViewpointById } from '../src/viewpoints';

describe('parseRoute', () => {
  it.each(['/', '', '/index.html'])('"%s" is home', (p) => {
    expect(parseRoute(p)).toEqual({ kind: 'home' });
  });

  it.each([
    '/walthamstow/east-avenue-bridge',
    '/walthamstow/east-avenue-bridge/',
    '/Walthamstow/East-Avenue-Bridge',
  ])('"%s" is East Avenue', (p) => {
    const r = parseRoute(p);
    expect(r.kind === 'viewpoint' && r.viewpoint.id).toBe('east-ave');
  });

  it.each(['/walthamstow', '/walthamstow/nope', '/a/b/c', '/walthamstow/east-ave', '/%E0%A4%A', '//walthamstow/east-avenue-bridge/x'])(
    '"%s" is unknown',
    (p) => {
      expect(parseRoute(p)).toEqual({ kind: 'unknown' });
    },
  );
});

describe('viewpointPath', () => {
  it('round-trips for every viewpoint', () => {
    for (const v of VIEWPOINTS) {
      const r = parseRoute(viewpointPath(v));
      expect(r.kind === 'viewpoint' && r.viewpoint.id).toBe(v.id);
    }
  });

  it('builds the published URL', () => {
    expect(viewpointPath(getViewpointById('queens-road')!)).toBe('/walthamstow/queens-road-station');
    expect(HOME_PATH).toBe('/');
  });
});
