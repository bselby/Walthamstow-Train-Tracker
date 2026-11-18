import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, type ViewModel } from '../src/render';
import type { BridgeEvent } from '../src/bridge';
import type { Arrival } from '../src/tfl';
import { getViewpointById } from '../src/viewpoints';
import { __resetRegionMemoForTests } from '../src/freightRegions';
import type { TapDirectionView, TapView } from '../src/tapUi';
import { NO_SIGNAL_LINE } from '../src/tapCopy';

const QR = getViewpointById('queens-road')!;
const EA = getViewpointById('east-ave')!;

const NO_TAP: TapDirectionView = {
  state: 'none', passKey: null, destination: null, entry: null, msUntilButton: null, offline: false,
};
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
  onHome: noop,
  onToggleFavourite: noop,
  onTap: noop,
  onHelpChoice: noop,
  onOpenTicket: noop,
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

describe('render — direction cards and the timing slot', () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app')!;
  });

  const withRows = (tap: TapView = NEUTRAL_TAP, viewpoint = QR) => vm({
    viewpoint,
    north: event(passengerArrival(), 20),
    south: event(passengerArrival({ id: 'p2', destinationName: 'Gospel Oak' }), 300, 'south'),
    northTicker: [event(passengerArrival({ id: 'p3' }), 600), event(passengerArrival({ id: 'p5' }), 900)],
    southTicker: [event(passengerArrival({ id: 'p4' }), 900, 'south')],
    tap,
  });

  const classes = () => Array.from(root.children).map((c) => c.className.split(' ')[0]);
  const kids = (el: Element) => Array.from(el.children).map((c) => c.className.split(' ')[0]);
  const cards = () => Array.from(root.querySelectorAll<HTMLElement>('.direction-card'));

  const button = (passKey = 'ea|north|1'): TapDirectionView =>
    ({ ...NO_TAP, state: 'button', passKey, destination: 'Chingford' });
  const thanks = (tapsBefore: number, offline = false): TapDirectionView => ({
    ...NO_TAP, state: 'thanks', passKey: 'ea|north|1', destination: 'Chingford',
    entry: { tapMs: 1_000, predictedMs: 3_000, tapsBefore }, offline,
  });

  it('one card per direction, nothing else between the header and the footer', () => {
    render(root, withRows(), opts);
    expect(classes()).toEqual([
      'spot-header', 'map-link', 'walking-time',
      'direction-card', 'direction-card',
      'footer', 'doc-links',
    ]);
    for (const card of cards()) {
      expect(kids(card)).toEqual(['card-top', 'value', 'strip']);
    }
    expect(root.querySelector('.tap-slot')).toBeNull();
    expect(root.querySelector('.ask-card')).toBeNull();
  });

  it('the card top names the destination and the trains after', () => {
    render(root, withRows(), opts);
    const [north, south] = cards();
    expect(north.querySelector('.card-dest')!.textContent).toBe('To Barking Riverside');
    expect(north.querySelector('.card-then')!.textContent).toBe('then 10 and 15 min');
    expect(south.querySelector('.card-dest')!.textContent).toBe('To Gospel Oak');
    expect(south.querySelector('.card-then')!.textContent).toBe('then 15 min');
  });

  it('no "then" line when there is no train after', () => {
    render(root, vm({ north: event(passengerArrival(), 300) }), opts);
    expect(root.querySelector('.card-then')).toBeNull();
  });

  it('the countdown keeps its wording, split into number and unit', () => {
    render(root, withRows(), opts);
    const value = cards()[1].querySelector('.value')!;
    expect(value.textContent).toBe('5 min');
    expect(value.querySelector('.value-num')!.textContent).toBe('5');
    expect(value.querySelector('.value-unit')!.textContent).toBe('min');
    expect(value.classList.contains('minutes')).toBe(true);
  });

  it('NOW and just crossed stay single words', () => {
    render(root, vm({
      north: event(passengerArrival(), 5),
      south: event(passengerArrival({ id: 'p2' }), -10, 'south'),
    }), opts);
    const [north, south] = cards();
    expect(north.querySelector('.value')!.textContent).toBe('NOW');
    expect(south.querySelector('.value')!.textContent).toBe('just crossed');
  });

  it('the line diagram sits inside each card under the countdown', () => {
    render(root, withRows(), opts);
    for (const card of cards()) {
      expect(card.querySelector('.strip .line-diagram')).not.toBeNull();
      expect(card.querySelector('.line-ends')).not.toBeNull();
    }
    expect(root.querySelector(':scope > .strip')).toBeNull();
    expect(root.querySelector(':scope > .ticker')).toBeNull();
  });

  it('Queens Road: no placeholder, no button, and the header has the ticket badge', () => {
    render(root, withRows(NEUTRAL_TAP, QR), opts);
    expect(root.querySelector('.tap-placeholder')).toBeNull();
    expect(root.querySelector('.tap-button')).toBeNull();
    expect(root.querySelector('.spot-header .ticket-badge')).not.toBeNull();
  });

  it('East Avenue, helping, button not due: the placeholder in the card', () => {
    const tap: TapView = { ...NEUTRAL_TAP, south: { ...NO_TAP, state: 'placeholder', msUntilButton: 300_000 } };
    render(root, withRows(tap, EA), opts);
    const [north, south] = cards();
    expect(north.querySelector('.tap-slot')).toBeNull();
    expect(kids(south)).toEqual(['card-top', 'value', 'strip', 'tap-slot']);
    expect(south.querySelector('.tap-placeholder')!.textContent).toBe('Yellow button pops up here in 5 min');
  });

  it('a pass due for someone who has not answered: the yellow button in the card', () => {
    const tap: TapView = { ...NEUTRAL_TAP, ask: 'first', north: button() };
    render(root, withRows(tap, EA), opts);
    const b = cards()[0].querySelector('.tap-slot .tap-button')!;
    expect(b.textContent).toContain('Tap as the train passes');
  });

  it('thanks offline: the no-signal line and the clip', () => {
    const tap: TapView = { ...NEUTRAL_TAP, taps: 3, north: thanks(2, true) };
    render(root, withRows(tap, EA), opts);
    const text = cards()[0].textContent ?? '';
    expect(text).toContain(NO_SIGNAL_LINE);
    expect(text).toContain('Ticket clipped');
  });

  it('thanks crossing 5 taps: promoted, with "See my ticket" that opens the ticket', () => {
    const onOpenTicket = vi.fn();
    const tap: TapView = { ...NEUTRAL_TAP, taps: 5, north: thanks(4) };
    render(root, withRows(tap, EA), { ...opts, onOpenTicket });
    const card = cards()[0];
    expect(card.textContent).toContain('Promoted to Guard.');
    const see = Array.from(card.querySelectorAll('button')).find((b) => b.textContent === 'See my ticket')!;
    see.click();
    expect(onOpenTicket).toHaveBeenCalledTimes(1);
    expect(root.textContent).not.toContain('Undo');
  });

  it('the old ticket strip and register are gone', () => {
    for (const ask of ['ready', 'invite', 'off'] as const) {
      render(root, withRows({ ...NEUTRAL_TAP, ask, taps: 3, north: thanks(2) }, EA), opts);
      for (const old of ['.ask-strip', '.ask-strip-summary', '.ticket', '.tap-register', 'details']) {
        expect(root.querySelector(old)).toBeNull();
      }
      expect(root.querySelector('.ask-card')).toBeNull();
    }
  });

  it('the header badge shows the rank and count, and opens the ticket', () => {
    const onOpenTicket = vi.fn();
    render(root, withRows({ ...NEUTRAL_TAP, taps: 4 }), { ...opts, onOpenTicket });
    const badge = root.querySelector<HTMLButtonElement>('.ticket-badge')!;
    expect(badge.textContent).toContain('Spotter · 4 trains');
    badge.click();
    expect(onOpenTicket).toHaveBeenCalledTimes(1);
  });

  it('the badge is there while connecting and with no trains', () => {
    render(root, vm({ freshness: { state: 'no-data' } }), opts);
    expect(root.querySelector('.ticket-badge')).not.toBeNull();
    render(root, vm(), opts);
    expect(root.querySelector('.ticket-badge')).not.toBeNull();
  });

  it('the ask card sits after both cards and before the footer', () => {
    render(root, withRows({ ...NEUTRAL_TAP, ask: 'first' }), opts);
    const order = classes();
    const ask = order.indexOf('ask-card');
    expect(ask).toBe(order.lastIndexOf('direction-card') + 1);
    expect(order[ask + 1]).toBe('footer');
  });

  it('answering the ask hands focus to the ticket badge', () => {
    render(root, withRows({ ...NEUTRAL_TAP, ask: 'first' }), opts);
    root.querySelector<HTMLButtonElement>('.ask-card button')!.focus();
    render(root, withRows({ ...NEUTRAL_TAP, ask: 'ready' }), opts);
    expect(root.querySelector('.ask-card')).toBeNull();
    expect(document.activeElement).toBe(root.querySelector('.ticket-badge'));
  });

  it('a card drawn on page load takes no focus', () => {
    render(root, withRows({ ...NEUTRAL_TAP, ask: 'ready' }), opts);
    expect(document.activeElement).toBe(document.body);
  });

  it('ask card choices reach onHelpChoice', () => {
    const onHelpChoice = vi.fn();
    render(root, withRows({ ...NEUTRAL_TAP, ask: 'first' }), { ...opts, onHelpChoice });
    const buttons = root.querySelectorAll<HTMLButtonElement>('.ask-card button');
    buttons[1].click();
    expect(onHelpChoice).toHaveBeenCalledWith('declined');
  });

  it('keeps the same tap button across redraws and routes the press to its direction', () => {
    const onTap = vi.fn();
    const tap: TapView = { ...NEUTRAL_TAP, south: button('ea|south|1') };
    render(root, withRows(tap, EA), { ...opts, onTap });
    const first = root.querySelector('.tap-button');
    render(root, withRows(tap, EA), { ...opts, onTap });
    const second = root.querySelector('.tap-button');
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
      const tap: TapView = { ...NEUTRAL_TAP, north: button() };
      render(root, withRows(tap, EA), { ...opts, onTap });
      root.querySelector('.tap-button')!
        .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, isPrimary: true }));
      vi.setSystemTime(pressMs + 1200);
      render(root, withRows(tap, EA), { ...opts, onTap });
      root.querySelector('.tap-button')!
        .dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, isPrimary: true }));
      expect(onTap).toHaveBeenCalledTimes(1);
      expect(onTap).toHaveBeenCalledWith('north', pressMs);
    } finally {
      vi.useRealTimers();
    }
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
    ['placeholder', { ...NO_TAP, state: 'placeholder', msUntilButton: 300_000 }],
    ['button', { ...NO_TAP, state: 'button', passKey: 'ea|north|1', destination: 'Chingford' }],
    ['thanks', { ...NO_TAP, state: 'thanks', passKey: 'ea|north|1', destination: 'Chingford',
      entry: { tapMs: 1_000, predictedMs: 3_000, tapsBefore: 1 } }],
  ] as const)('the %s slot, its card and its line diagram stay in the document across redraws', (_name, north) => {
    const tap: TapView = { ...NEUTRAL_TAP, taps: 2, north: north as TapDirectionView };
    render(root, withRows(tap, EA), opts);
    const slot = root.querySelector('.tap-slot')!;
    const card = slot.parentElement!;
    const strip = card.querySelector('.strip')!;
    const removed = removedDuring(() => {
      render(root, withRows(tap, EA), opts);
      render(root, withRows(tap, EA), opts);
    });
    expect(root.querySelector('.tap-slot')).toBe(slot);
    for (const kept of [slot, card, strip]) {
      expect(removed.includes(kept)).toBe(false);
    }
    expect(slot.parentElement).toBe(card);
    expect(kids(card)).toEqual(['card-top', 'value', 'strip', 'tap-slot']);
  });

  it('the card is still redrawn with the current countdown', () => {
    render(root, withRows(), opts);
    const card = cards()[1];
    render(root, vm({
      north: event(passengerArrival(), 20),
      south: event(passengerArrival({ id: 'p2' }), 120, 'south'),
    }), opts);
    expect(cards()[1]).toBe(card);
    expect(card.querySelector('.value')!.textContent).toBe('2 min');
  });

  it('a kept ask card stays in the document across redraws', () => {
    const tap: TapView = { ...NEUTRAL_TAP, ask: 'first' };
    render(root, withRows(tap), opts);
    const card = root.querySelector('.ask-card')!;
    const removed = removedDuring(() => render(root, withRows(tap), opts));
    expect(root.querySelector('.ask-card')).toBe(card);
    expect(removed.includes(card)).toBe(false);
  });

  it('page order is unchanged when a card is kept', () => {
    const tap: TapView = { ...NEUTRAL_TAP, ask: 'first', north: button() };
    render(root, withRows(tap, EA), opts);
    render(root, withRows(tap, EA), opts);
    expect(classes()).toEqual([
      'spot-header', 'map-link', 'walking-time',
      'direction-card', 'direction-card',
      'ask-card', 'footer', 'doc-links',
    ]);
  });
});

describe('render — header', () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('main');
    document.body.appendChild(root);
  });

  it('opens with the spot header, kept across redraws, and no dropdown', () => {
    render(root, vm(), opts);
    const header = root.firstElementChild!;
    expect(header.classList.contains('spot-header')).toBe(true);
    render(root, vm(), opts);
    expect(root.firstElementChild).toBe(header);
    expect(root.querySelector('.switcher')).toBeNull();
  });

  it('fills the header star only when this spot is a favourite', () => {
    render(root, vm({ favouriteIds: [QR.id] }), opts);
    expect(root.querySelector('.spot-header-star')!.getAttribute('aria-pressed')).toBe('true');
    render(root, vm({ favouriteIds: ['east-ave'] }), opts);
    expect(root.querySelector('.spot-header-star')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('passes the header link and star through to the options', () => {
    const onHome = vi.fn();
    const onToggleFavourite = vi.fn();
    render(root, vm(), { ...opts, onHome, onToggleFavourite });
    root.querySelector<HTMLElement>('.spot-header-home')!.click();
    root.querySelector<HTMLElement>('.spot-header-star')!.click();
    expect(onHome).toHaveBeenCalledTimes(1);
    expect(onToggleFavourite).toHaveBeenCalledWith(QR.id);
  });

  it('clears whatever the home screen left behind', () => {
    root.innerHTML = '<header class="home-header"></header><section class="home-others"></section>';
    render(root, vm(), opts);
    expect(root.querySelector('.home-header')).toBeNull();
    expect(root.querySelector('.home-others')).toBeNull();
  });
});
