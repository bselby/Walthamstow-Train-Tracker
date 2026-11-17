import { describe, expect, it } from 'vitest';
import { getViewpointById } from '../src/viewpoints';
import type { BridgeEvent } from '../src/bridge';
import type { Direction } from '../src/direction';
import {
  atViewpoint,
  canOfferTap,
  levelFor,
  passKey,
  promotionFor,
  registerGapLine,
  tidyDestination,
  updatePass,
  type TapPass,
} from '../src/tap';

const eastAve = getViewpointById('east-ave')!;
const queensRoad = getViewpointById('queens-road')!;
const northcote = getViewpointById('northcote-rd')!;

function hero(
  bridgeTimeSeconds: number,
  overrides: { vehicleId?: string | undefined; destinationName?: string; category?: 'freight' } = {},
  direction: Direction = 'north',
): BridgeEvent {
  return {
    direction,
    bridgeTimeSeconds,
    arrival: {
      id: 'a1',
      stationName: 'Station',
      lineId: 'weaver',
      destinationName: overrides.destinationName ?? 'Chingford',
      timeToStation: bridgeTimeSeconds,
      expectedArrival: '2026-11-17T10:00:00Z',
      modeName: 'overground',
      platformName: '1',
      vehicleId: 'vehicleId' in overrides ? overrides.vehicleId : 'v1',
      category: overrides.category,
    },
  };
}

const NOW = 1_000_000;

describe('canOfferTap', () => {
  it('is false with no hero', () => {
    expect(canOfferTap(eastAve, 'north', undefined)).toBe(false);
  });
  it('is false for a freight hero', () => {
    expect(canOfferTap(eastAve, 'north', hero(20, { category: 'freight' }))).toBe(false);
  });
  it('is false at queens-road, where the app has no offset to test', () => {
    expect(canOfferTap(queensRoad, 'north', hero(20))).toBe(false);
  });
  it('is true at east-ave and northcote-rd for a passenger hero', () => {
    expect(canOfferTap(eastAve, 'north', hero(20))).toBe(true);
    expect(canOfferTap(northcote, 'south', hero(20, {}, 'south'))).toBe(true);
  });
});

describe('updatePass', () => {
  const input = (h: BridgeEvent | undefined, nowMs = NOW) => ({
    viewpoint: eastAve,
    direction: 'north' as Direction,
    hero: h,
    berthTrainId: null,
    nowMs,
  });

  it('opens the window 30 s before and closes it 45 s after', () => {
    expect(updatePass(null, input(hero(31)))).toBeNull();
    expect(updatePass(null, input(hero(30)))).not.toBeNull();
    expect(updatePass(null, input(hero(5)))).not.toBeNull();
    expect(updatePass(null, input(hero(-46)))).toBeNull();
  });

  it('records the new pass from the hero', () => {
    const pass = updatePass(null, { ...input(hero(12, { destinationName: 'Walthamstow Central' })), berthTrainId: '2K15' })!;
    expect(pass.viewpointId).toBe('east-ave');
    expect(pass.direction).toBe('north');
    expect(pass.vehicleId).toBe('v1');
    expect(pass.berthTrainId).toBe('2K15');
    expect(pass.destination).toBe('Walthamstow Central');
    expect(pass.shownAtMs).toBe(NOW);
    expect(pass.predictedAtShowMs).toBe(NOW + 12_000);
    expect(pass.latestPredictedMs).toBe(NOW + 12_000);
  });

  it('keeps the pass when the same vehicle is re-predicted, moving only latestPredictedMs', () => {
    const first = updatePass(null, input(hero(10)))!;
    const later = updatePass(first, input(hero(30), NOW + 10_000))!;
    expect(later.shownAtMs).toBe(first.shownAtMs);
    expect(later.predictedAtShowMs).toBe(first.predictedAtShowMs);
    expect(later.latestPredictedMs).toBe(NOW + 10_000 + 30_000);
  });

  it('accepts a new pass at exactly -45 s', () => {
    expect(updatePass(null, input(hero(-45)))).not.toBeNull();
  });

  it('does not keep refreshing a pass for the same vehicle predicted long past', () => {
    const first = updatePass(null, input(hero(10)))!;
    const stale = hero(-60);
    const edge = first.latestPredictedMs + 45_000;
    // refresh must not push latestPredictedMs forward, so the pass still expires
    expect(updatePass(first, input(stale, edge))).toEqual(first);
    expect(updatePass(first, input(stale, edge + 1))).toBeNull();
  });

  it('does not treat two trains without vehicle ids as the same train', () => {
    const first = updatePass(null, input(hero(10, { vehicleId: undefined, destinationName: 'Chingford' })))!;
    const second = hero(25, { vehicleId: undefined, destinationName: 'Highams Park' });
    expect(updatePass(first, input(second, NOW + 5_000))).toEqual(first);
  });

  it('returns null for a current pass in another direction', () => {
    const first = updatePass(null, input(hero(10)))!;
    expect(updatePass(first, { ...input(hero(10, {}, 'south')), direction: 'south' })).toBeNull();
  });

  it('holds the pass while another vehicle leads, until 45 s after the prediction', () => {
    const first = updatePass(null, input(hero(10)))!;
    const other = hero(120, { vehicleId: 'v2' });
    const edge = first.latestPredictedMs + 45_000;
    expect(updatePass(first, input(other, edge))).toEqual(first);
    expect(updatePass(first, input(other, edge + 1))).toBeNull();
  });

  it('returns null for a current pass belonging to another viewpoint', () => {
    const first = updatePass(null, input(hero(10)))!;
    expect(updatePass(first, { ...input(hero(10)), viewpoint: northcote })).toBeNull();
  });
});

describe('passKey', () => {
  const base: TapPass = {
    viewpointId: 'east-ave', direction: 'north', vehicleId: 'v1', berthTrainId: null,
    destination: 'Chingford', shownAtMs: 1, predictedAtShowMs: 5000, latestPredictedMs: 6000,
  };
  it('matches for the same viewpoint, direction and predictedAtShowMs', () => {
    expect(passKey(base)).toBe(passKey({ ...base, latestPredictedMs: 9000, shownAtMs: 2 }));
  });
  it('differs across directions', () => {
    expect(passKey(base)).not.toBe(passKey({ ...base, direction: 'south' }));
  });
});

describe('levelFor', () => {
  it('starts below the first grade', () => {
    expect(levelFor(0)).toEqual({ name: null, next: { name: 'Spotter', taps: 1 }, stepsDone: 0, stepsTotal: 1 });
  });
  it('counts steps between grades', () => {
    expect(levelFor(2)).toEqual({ name: 'Spotter', next: { name: 'Guard', taps: 5 }, stepsDone: 1, stepsTotal: 4 });
    expect(levelFor(5)).toEqual({ name: 'Guard', next: { name: 'Signaller', taps: 15 }, stepsDone: 0, stepsTotal: 10 });
  });
  it('has no next grade at the top', () => {
    const top = levelFor(75);
    expect(top.name).toBe('Station Master');
    expect(top.next).toBeNull();
  });
});

describe('registerGapLine', () => {
  const t = 1_000_000;
  it('says right time within 3 s', () => {
    expect(registerGapLine(t, t + 2000)).toBe('Right time.');
  });
  it('says early when the app predicted before the tap', () => {
    expect(registerGapLine(t, t - 12000)).toBe('We were 12 seconds early. Noted.');
  });
  it('says late when the app predicted after the tap', () => {
    expect(registerGapLine(t, t + 8000)).toBe('We were 8 seconds late. Noted.');
  });
});

describe('promotionFor', () => {
  it('returns the grade reached', () => {
    expect(promotionFor(4, 5)).toEqual({ name: 'Guard', kit: 'Whistle issued' });
    expect(promotionFor(0, 1)?.name).toBe('Spotter');
  });
  it('returns null when no threshold is crossed', () => {
    expect(promotionFor(5, 6)).toBeNull();
  });
});

describe('atViewpoint', () => {
  const coords = eastAve.coords;
  it('is unknown without a position', () => {
    expect(atViewpoint(null, coords)).toBe('unknown');
  });
  it('is yes within 150 m', () => {
    expect(atViewpoint({ lat: coords.lat + 0.00045, lng: coords.lng }, coords)).toBe('yes'); // ~50 m
  });
  it('is no beyond 150 m', () => {
    expect(atViewpoint({ lat: coords.lat + 0.0036, lng: coords.lng }, coords)).toBe('no'); // ~400 m
  });
});

describe('tidyDestination', () => {
  it.each([
    ['London Liverpool Street Rail Station', 'Liverpool Street'],
    ['Chingford Rail Station', 'Chingford'],
    ['Barking Riverside', 'Barking Riverside'],
    ['Gospel Oak Rail Station', 'Gospel Oak'],
    ['London', 'London'],
    ['', ''],
    ['Highams Park Station', 'Highams Park'],
    ['  Walthamstow   Central  rail station ', 'Walthamstow Central'],
  ])('%j -> %j', (raw, tidy) => {
    expect(tidyDestination(raw)).toBe(tidy);
  });

  it('is used for the pass destination', () => {
    const pass = updatePass(null, {
      viewpoint: eastAve,
      direction: 'north',
      hero: hero(10, { destinationName: 'London Liverpool Street Rail Station' }),
      berthTrainId: null,
      nowMs: 1_000,
    })!;
    expect(pass.destination).toBe('Liverpool Street');
  });
});
