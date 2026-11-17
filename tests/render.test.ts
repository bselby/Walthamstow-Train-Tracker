import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, type ViewModel } from '../src/render';
import type { BridgeEvent } from '../src/bridge';
import type { Arrival } from '../src/tfl';
import { getViewpointById } from '../src/viewpoints';
import { __resetRegionMemoForTests } from '../src/freightRegions';
import type { TapDirectionView, TapView } from '../src/tapUi';

const QR = getViewpointById('queens-road')!;

const NO_TAP: TapDirectionView = { state: 'none', passKey: null, destination: null, entry: null };
const NEUTRAL_TAP: TapView = { ask: null, taps: 0, north: NO_TAP, south: NO_TAP };

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
    favouriteIds: [QR.id],
    tap: NEUTRAL_TAP,
    ...overrides,
  };
}

const noop = () => {};
const opts = {
  onEnableWalkingTime: noop,
  onDisableWalkingTime: noop,
  onAdvanceFact: noop,
  onSwitchViewpoint: noop,
  onToggleFavourite: noop,
  onTap: noop,
  onHelpChoice: noop,
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

describe('render — train\'s here tap', () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app')!;
  });

  const withRows = (tap: TapView = NEUTRAL_TAP) => vm({
    north: event(passengerArrival(), 20),
    south: event(passengerArrival({ id: 'p2', destinationName: 'Gospel Oak' }), 300, 'south'),
    northTicker: [event(passengerArrival({ id: 'p3' }), 600)],
    southTicker: [event(passengerArrival({ id: 'p4' }), 900, 'south')],
    tap,
  });

  const classes = () => Array.from(root.children).map((c) => c.className.split(' ')[0]);

  it('with no ask and no buttons the page is unchanged: no extra nodes', () => {
    render(root, withRows(), opts);
    expect(classes()).toEqual([
      'switcher', 'map-link', 'walking-time',
      'row', 'strip', 'ticker',
      'row', 'strip', 'ticker',
      'footer', 'doc-links',
    ]);
    root.querySelectorAll('.row').forEach((row) => {
      expect(Array.from(row.children).map((c) => c.className.split(' ')[0])).toEqual(['label', 'value']);
    });
    expect(root.querySelector('.tap-slot')).toBeNull();
    expect(root.querySelector('.ask-card')).toBeNull();
  });

  it('the ask card sits after both rows and tickers and before the footer', () => {
    render(root, withRows({ ...NEUTRAL_TAP, ask: 'first' }), opts);
    const order = classes();
    const ask = order.indexOf('ask-card');
    expect(ask).toBeGreaterThan(order.lastIndexOf('ticker'));
    expect(ask).toBeGreaterThan(order.lastIndexOf('row'));
    expect(order[ask + 1]).toBe('footer');
  });

  it('the tap button goes inside its direction row, after the value', () => {
    const tap: TapView = {
      ...NEUTRAL_TAP,
      north: { state: 'button', passKey: 'qr|north|1', destination: 'Barking Riverside', entry: null },
    };
    render(root, withRows(tap), opts);
    const rows = root.querySelectorAll('.row');
    const kids = Array.from(rows[0].children);
    expect(kids[1].classList.contains('value')).toBe(true);
    expect(kids[2].textContent).toBe('Barking Riverside train is passing');
    expect(rows[1].querySelector('.tap-slot')).toBeNull();
  });

  it('keeps the same tap button across redraws and routes the press to its direction', () => {
    const onTap = vi.fn();
    const tap: TapView = {
      ...NEUTRAL_TAP,
      south: { state: 'button', passKey: 'qr|south|1', destination: 'Gospel Oak', entry: null },
    };
    render(root, withRows(tap), { ...opts, onTap });
    const first = root.querySelector('.tap-slot');
    render(root, withRows(tap), { ...opts, onTap });
    const second = root.querySelector('.tap-slot');
    expect(second).toBe(first);
    second!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, isPrimary: true }));
    second!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, isPrimary: true }));
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onTap.mock.calls[0][0]).toBe('south');
  });

  it('a press that spans a redraw still books once, with the pointerdown time', () => {
    vi.useFakeTimers();
    try {
      const pressMs = 1_800_000_000_000;
      vi.setSystemTime(pressMs);
      const onTap = vi.fn();
      const tap: TapView = {
        ...NEUTRAL_TAP,
        north: { state: 'button', passKey: 'qr|north|1', destination: 'Chingford', entry: null },
      };
      render(root, withRows(tap), { ...opts, onTap });
      root.querySelector('.tap-slot')!
        .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, isPrimary: true }));
      vi.setSystemTime(pressMs + 1200);
      render(root, withRows(tap), { ...opts, onTap });
      root.querySelector('.tap-slot')!
        .dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, isPrimary: true }));
      expect(onTap).toHaveBeenCalledTimes(1);
      expect(onTap).toHaveBeenCalledWith('north', pressMs);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ask card choices reach onHelpChoice', () => {
    const onHelpChoice = vi.fn();
    render(root, withRows({ ...NEUTRAL_TAP, ask: 'first' }), { ...opts, onHelpChoice });
    const buttons = root.querySelectorAll<HTMLButtonElement>('.ask-card button');
    buttons[1].click();
    expect(onHelpChoice).toHaveBeenCalledWith('declined');
  });

  // Every node removed from the document during a call, including subtrees.
  function removedDuring(fn: () => void): Node[] {
    const observer = new MutationObserver(() => {});
    observer.observe(root, { childList: true, subtree: true });
    fn();
    const removed = observer.takeRecords().flatMap((r) => Array.from(r.removedNodes));
    observer.disconnect();
    return removed;
  }

  it.each([
    ['button', { state: 'button', passKey: 'qr|north|1', destination: 'Barking Riverside', entry: null }],
    ['thanks', { state: 'thanks', passKey: 'qr|north|1', destination: 'Barking Riverside',
      entry: { tapMs: 1_000, predictedMs: 3_000, tapsBefore: 1 } }],
  ] as const)('the %s slot stays in the document across redraws', (_name, north) => {
    const tap: TapView = { ...NEUTRAL_TAP, taps: 2, north: north as TapDirectionView };
    render(root, withRows(tap), opts);
    const slot = root.querySelector('.tap-slot')!;
    const rowBefore = slot.parentElement!;
    const removed = removedDuring(() => {
      render(root, withRows(tap), opts);
      render(root, withRows(tap), opts);
    });
    expect(root.querySelector('.tap-slot')).toBe(slot);
    expect(slot.isConnected).toBe(true);
    // Neither the slot nor the row holding it was taken out of the document.
    expect(removed.includes(slot)).toBe(false);
    expect(removed.includes(rowBefore)).toBe(false);
    // The row around it is still redrawn with the current countdown.
    const row = slot.parentElement!;
    expect(row).toBe(rowBefore);
    expect(Array.from(row.children).map((c) => c.className.split(' ')[0])).toEqual(['label', 'value', 'tap-slot']);
  });

  it('a kept ask card stays in the document across redraws', () => {
    const tap: TapView = { ...NEUTRAL_TAP, ask: 'first' };
    render(root, withRows(tap), opts);
    const card = root.querySelector('.ask-card')!;
    const removed = removedDuring(() => render(root, withRows(tap), opts));
    expect(root.querySelector('.ask-card')).toBe(card);
    expect(removed.includes(card)).toBe(false);
  });

  it('page order is unchanged when a row is kept', () => {
    const tap: TapView = {
      ...NEUTRAL_TAP,
      ask: 'first',
      north: { state: 'button', passKey: 'qr|north|1', destination: 'Barking Riverside', entry: null },
    };
    render(root, withRows(tap), opts);
    render(root, withRows(tap), opts);
    expect(classes()).toEqual([
      'switcher', 'map-link', 'walking-time',
      'row', 'strip', 'ticker',
      'row', 'strip', 'ticker',
      'ask-card', 'footer', 'doc-links',
    ]);
  });
});
