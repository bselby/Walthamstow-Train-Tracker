import { describe, it, expect, beforeEach } from 'vitest';
import { render, type ViewModel } from '../src/render';
import type { BridgeEvent } from '../src/bridge';
import type { Arrival } from '../src/tfl';
import { getViewpointById } from '../src/viewpoints';
import { __resetRegionMemoForTests } from '../src/freightRegions';

const QR = getViewpointById('queens-road')!;

function passengerArrival(overrides: Partial<Arrival> = {}): Arrival {
  return {
    id: 'p1',
    stationName: 'Walthamstow Queens Road',
    lineId: 'suffragette',
    destinationName: 'Barking Riverside',
    timeToStation: 120,
    expectedArrival: '2026-04-25T10:00:00Z',
    modeName: 'overground',
    platformName: 'Platform 1',
    ...overrides,
  };
}

function freightArrival(overrides: Partial<Arrival> = {}): Arrival {
  return {
    id: 'f1',
    stationName: 'Walthamstow Queens Road',
    lineId: 'suffragette',
    destinationName: 'Willesden Euroterminal',
    origin: 'Tilbury Riverside Yard',
    timeToStation: 60,
    expectedArrival: '2026-04-25T10:00:00Z',
    modeName: 'overground',
    platformName: '',
    category: 'freight',
    headcode: '6M23',
    operatorCode: 'DB',
    ...overrides,
  };
}

function event(arrival: Arrival, bridgeTimeSeconds: number, direction: 'north' | 'south' = 'north'): BridgeEvent {
  return { arrival, direction, bridgeTimeSeconds };
}

function vm(overrides: Partial<ViewModel> = {}): ViewModel {
  return {
    freshness: { state: 'fresh', ageMs: 5000 },
    northPos: null,
    southPos: null,
    celebrate: { north: false, south: false },
    northTicker: [],
    southTicker: [],
    walkingLabel: null,
    fact: { text: '', category: 'default' },
    viewpoint: QR,
    favouriteViewpointId: QR.id,
    ...overrides,
  };
}

const noop = () => {};
const opts = {
  onEnableWalkingTime: noop,
  onDisableWalkingTime: noop,
  onAdvanceFact: noop,
  onSwitchViewpoint: noop,
  onSetFavouriteViewpoint: noop,
};

describe('render — freight', () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app')!;
    // Reset the session-novelty memo so .new-this-session fires deterministically.
    __resetRegionMemoForTests();
  });

  it('passenger hero: no .freight-tag', () => {
    render(root, vm({ north: event(passengerArrival(), 120) }), opts);
    expect(root.querySelector('.freight-tag')).toBeNull();
  });

  it('freight hero: exactly one .freight-tag with text FREIGHT', () => {
    render(root, vm({ north: event(freightArrival(), 60) }), opts);
    const tags = root.querySelectorAll('.freight-tag');
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent?.trim()).toBe('FREIGHT');
  });

  it('freight hero with origin + destination: renders .freight-journey', () => {
    render(root, vm({ north: event(freightArrival(), 60) }), opts);
    const journeys = root.querySelectorAll('.freight-journey');
    expect(journeys).toHaveLength(1);
    expect(journeys[0].textContent).toContain('Tilbury Riverside Yard');
    expect(journeys[0].textContent).toContain('Willesden Euroterminal');
    expect(journeys[0].textContent).toContain('→');
  });

  it('freight hero missing origin: no .freight-journey (avoid half-rendered arrow)', () => {
    render(root, vm({ north: event(freightArrival({ origin: undefined }), 60) }), opts);
    expect(root.querySelector('.freight-journey')).toBeNull();
  });

  it('ticker freight entry: gets .ticker-value-freight', () => {
    render(root, vm({
      north: event(passengerArrival(), 120),
      northTicker: [event(freightArrival({ id: 'f-ticker' }), 300)],
    }), opts);
    expect(root.querySelector('.ticker-value-freight')).not.toBeNull();
  });

  it('ticker passenger entry: no .ticker-value-freight', () => {
    render(root, vm({
      north: event(passengerArrival(), 120),
      northTicker: [event(passengerArrival({ id: 'p-ticker' }), 300)],
    }), opts);
    expect(root.querySelector('.ticker-value-freight')).toBeNull();
    expect(root.querySelector('.ticker-value')).not.toBeNull();
  });

  it('different-region trip: renders origin + destination region chips', () => {
    render(root, vm({
      north: event(freightArrival({
        origin: 'Mossend Yard',
        destinationName: 'Felixstowe North',
      }), 60),
    }), opts);
    const chips = root.querySelectorAll('.region-chip');
    expect(chips).toHaveLength(2);
    expect(chips[0].textContent).toContain('Scotland');
    expect(chips[1].textContent).toContain('East Anglia');
  });

  it('same-region trip: renders only one region chip', () => {
    render(root, vm({
      north: event(freightArrival({
        origin: 'Willesden Euroterminal',
        destinationName: 'Wembley Yard',
      }), 60),
    }), opts);
    expect(root.querySelectorAll('.region-chip')).toHaveLength(1);
  });

  it('first sighting of a shimmer-eligible region: chip gets .new-this-session', () => {
    render(root, vm({
      north: event(freightArrival({
        origin: 'Mossend Yard',
        destinationName: 'Willesden Euroterminal',
      }), 60),
    }), opts);
    const scot = Array.from(root.querySelectorAll('.region-chip')).find((c) =>
      c.textContent?.includes('Scotland'),
    );
    expect(scot?.classList.contains('new-this-session')).toBe(true);
  });

  it('Home region never gets .new-this-session', () => {
    render(root, vm({
      north: event(freightArrival({
        origin: 'Willesden Euroterminal',
        destinationName: 'Stratford International',
      }), 60),
    }), opts);
    const home = root.querySelector('.region-chip');
    expect(home?.textContent).toContain('Home');
    expect(home?.classList.contains('new-this-session')).toBe(false);
  });
});
