import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  regionFor,
  isNewRegionThisSession,
  __resetRegionMemoForTests,
} from '../src/freightRegions';

describe('regionFor', () => {
  it('maps Scottish yards to Scotland', () => {
    expect(regionFor('Mossend Yard')).toBe('Scotland');
    expect(regionFor('Coatbridge FLT')).toBe('Scotland');
    expect(regionFor('Grangemouth')).toBe('Scotland');
  });

  it('maps Welsh yards to Wales', () => {
    expect(regionFor('Cardiff Tidal Sidings')).toBe('Wales');
    expect(regionFor('Margam')).toBe('Wales');
  });

  it('maps West Country yards', () => {
    expect(regionFor('Merehead Quarry')).toBe('West Country');
    expect(regionFor('Whatley Quarry')).toBe('West Country');
  });

  it('maps Thames Estuary yards', () => {
    expect(regionFor('Tilbury Riverside Yard')).toBe('Thames Estuary');
    expect(regionFor('London Gateway')).toBe('Thames Estuary');
  });

  it('maps East Anglia yards', () => {
    expect(regionFor('Felixstowe North')).toBe('East Anglia');
    expect(regionFor('Ipswich Up Yard')).toBe('East Anglia');
  });

  it('maps The North (NE/Yorkshire/NW)', () => {
    expect(regionFor('Trafford Park FLT')).toBe('The North');
    expect(regionFor('Immingham')).toBe('The North');
    expect(regionFor('Crewe Basford Hall')).toBe('The North');
  });

  it('maps Midlands yards', () => {
    expect(regionFor('Daventry International Rail Freight Terminal')).toBe('Midlands');
    expect(regionFor('Bescot Yard')).toBe('Midlands');
  });

  it('maps Kent yards', () => {
    expect(regionFor('Dollands Moor')).toBe('Kent');
    expect(regionFor('Hoo Junction')).toBe('Kent');
  });

  it('maps London yards to Home', () => {
    expect(regionFor('Willesden Euroterminal')).toBe('Home');
    expect(regionFor('Wembley Yard')).toBe('Home');
    expect(regionFor('Temple Mills')).toBe('Home');
  });

  it('falls back to Elsewhere for unknowns / empty', () => {
    expect(regionFor('Some Bizarre Sidings')).toBe('Elsewhere');
    expect(regionFor('')).toBe('Elsewhere');
    expect(regionFor('   ')).toBe('Elsewhere');
  });
});

describe('isNewRegionThisSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
    __resetRegionMemoForTests();
  });

  it('returns true first call, false after', () => {
    expect(isNewRegionThisSession('Scotland')).toBe(true);
    expect(isNewRegionThisSession('Scotland')).toBe(false);
    expect(isNewRegionThisSession('Wales')).toBe(true);
    expect(isNewRegionThisSession('Wales')).toBe(false);
  });

  it('never shimmers Home or Elsewhere (non-events)', () => {
    expect(isNewRegionThisSession('Home')).toBe(false);
    expect(isNewRegionThisSession('Elsewhere')).toBe(false);
    expect(isNewRegionThisSession('Home')).toBe(false);
  });

  it('survives sessionStorage throwing (hardened browsers)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    __resetRegionMemoForTests();
    expect(isNewRegionThisSession('Scotland')).toBe(true);
    expect(isNewRegionThisSession('Scotland')).toBe(false); // in-memory fallback
    spy.mockRestore();
  });
});
