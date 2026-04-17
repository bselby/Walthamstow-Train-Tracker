import { describe, it, expect } from 'vitest';
import {
  STOPS,
  WC_INDEX,
  SEGMENTS_NORTH_OF_WC,
  SEGMENTS_SOUTH_OF_WC,
  getStop,
} from '../src/stops';

describe('STOPS', () => {
  it('has 9 stops in order, indexed 0..8', () => {
    expect(STOPS).toHaveLength(9);
    STOPS.forEach((stop, i) => {
      expect(stop.index).toBe(i);
    });
  });

  it('has Liverpool Street at index 0 and Chingford at index 8', () => {
    expect(STOPS[0].fullName).toBe('Liverpool Street');
    expect(STOPS[0].abbrev).toBe('Liv');
    expect(STOPS[8].fullName).toBe('Chingford');
    expect(STOPS[8].abbrev).toBe('Chg');
  });

  it('has Walthamstow Central at the WC_INDEX (5)', () => {
    expect(WC_INDEX).toBe(5);
    expect(STOPS[WC_INDEX].fullName).toBe('Walthamstow Central');
    expect(STOPS[WC_INDEX].abbrev).toBe('WC');
  });
});

describe('segments', () => {
  it('SEGMENTS_NORTH_OF_WC covers WC→Wds→Hig→Chg totalling 420s', () => {
    const total = SEGMENTS_NORTH_OF_WC.reduce((sum, s) => sum + s.seconds, 0);
    expect(total).toBe(420);
    expect(SEGMENTS_NORTH_OF_WC[0].nearIndex).toBe(5);
    expect(SEGMENTS_NORTH_OF_WC[SEGMENTS_NORTH_OF_WC.length - 1].farIndex).toBe(8);
  });

  it('SEGMENTS_SOUTH_OF_WC covers WC→StJ→Clp→Hck→Bth→Liv totalling 720s', () => {
    const total = SEGMENTS_SOUTH_OF_WC.reduce((sum, s) => sum + s.seconds, 0);
    expect(total).toBe(720);
    expect(SEGMENTS_SOUTH_OF_WC[0].nearIndex).toBe(5);
    expect(SEGMENTS_SOUTH_OF_WC[SEGMENTS_SOUTH_OF_WC.length - 1].farIndex).toBe(0);
  });
});

describe('getStop', () => {
  it('returns the stop at a valid index', () => {
    expect(getStop(5)?.abbrev).toBe('WC');
  });

  it('returns undefined for an out-of-range index', () => {
    expect(getStop(-1)).toBeUndefined();
    expect(getStop(9)).toBeUndefined();
    expect(getStop(5.5)).toBeUndefined();
  });
});
