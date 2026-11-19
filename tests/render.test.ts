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
  onOpenHow: noop,
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

  it('freight hero: exactly one .freight-tag reading "Freight" (board 10, shortened to keep the title on one line)', () => {
    render(root, vm({ north: event(freightArrival(), 60) }), opts);
    const tags = root.querySelectorAll('.freight-tag');
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent?.trim()).toBe('Freight');
    expect(tags[0].closest('.card-dest')).not.toBeNull();
  });

  it('freight hero with origin + destination: "Coming from X, off to Y." under the countdown', () => {
    render(root, vm({ north: event(freightArrival(), 60) }), opts);
    const journeys = root.querySelectorAll('.freight-journey');
    expect(journeys).toHaveLength(1);
    const text = journeys[0].textContent!;
    expect(text.startsWith('Coming from Tilbury Riverside Yard')).toBe(true);
    expect(text).toContain(', off to Willesden Euroterminal');
    expect(text.endsWith('.')).toBe(true);
    expect(text).not.toContain('→');
    // Read aloud, each region is set apart from its place name.
    expect(text).toBe('Coming from Tilbury Riverside Yard (Thames Estuary), off to Willesden Euroterminal (Home).');
    for (const hidden of Array.from(journeys[0].querySelectorAll('.visually-hidden'))) {
      expect(hidden.closest('.region-chip')).not.toBeNull();
    }
    const card = journeys[0].closest('.direction-card')!;
    expect(Array.from(card.children).map((c) => c.className.split(' ')[0]))
      .toEqual(['card-top', 'value', 'freight-journey', 'strip']);
  });

  it('freight hero with a reserved slot: the journey line sits in the slot, not under the countdown', () => {
    const tap: TapView = { ...NEUTRAL_TAP, north: { ...NO_TAP, state: 'reserved' } };
    render(root, vm({ north: event(freightArrival(), 60), tap }), opts);
    const journeys = root.querySelectorAll('.freight-journey');
    expect(journeys).toHaveLength(1);
    const slot = journeys[0].parentElement!;
    expect(slot.classList.contains('tap-slot')).toBe(true);
    expect(slot.getAttribute('aria-hidden')).toBeNull();
    const card = slot.closest('.direction-card')!;
    expect(Array.from(card.children).map((c) => c.className.split(' ')[0]))
      .toEqual(['card-top', 'value', 'strip', 'tap-slot']);
    // Redrawn each second, still exactly one line; empty again once the hero is a passenger train.
    render(root, vm({ north: event(freightArrival(), 59), tap }), opts);
    expect(root.querySelectorAll('.freight-journey')).toHaveLength(1);
    render(root, vm({ north: event(passengerArrival(), 120), tap }), opts);
    expect(root.querySelector('.freight-journey')).toBeNull();
    expect(root.querySelector('.direction-card .tap-slot')!.childElementCount).toBe(0);
    expect(root.querySelector('.direction-card .tap-slot')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('freight hero while a thank-you shows: the thank-you keeps the slot', () => {
    const tap: TapView = {
      ...NEUTRAL_TAP,
      taps: 3,
      north: { ...NO_TAP, state: 'thanks', passKey: 'qr|north|1', destination: 'Barking Riverside',
        entry: { tapMs: 1, predictedMs: 1, tapsBefore: 2 } },
    };
    render(root, vm({ north: event(freightArrival(), 60), tap }), opts);
    const slot = root.querySelector('.direction-card .tap-slot')!;
    expect(slot.querySelector('.tap-thanks')).not.toBeNull();
    // Not pushed back under the countdown either: the card keeps its height.
    expect(root.querySelector('.freight-journey')).toBeNull();
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

  it('ticker freight entry says "freight" in words', () => {
    render(root, vm({
      north: event(passengerArrival(), 120),
      northTicker: [event(freightArrival({ id: 'f1' }), 300), event(passengerArrival({ id: 'p1' }), 600)],
    }), opts);
    expect(root.querySelector('.card-then')!.textContent).toBe('then 5 (freight) and 10 min');
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

  // Every node removed from the document during a call, including subtrees.
  function removedDuring(fn: () => void): Node[] {
    const observer = new MutationObserver(() => {});
    observer.observe(root, { childList: true, subtree: true });
    fn();
    const removed = observer.takeRecords().flatMap((r) => Array.from(r.removedNodes));
    observer.disconnect();
    return removed;
  }


  const button = (passKey = 'ea|north|1'): TapDirectionView =>
    ({ ...NO_TAP, state: 'button', passKey, destination: 'Chingford' });
  const thanks = (tapsBefore: number, offline = false): TapDirectionView => ({
    ...NO_TAP, state: 'thanks', passKey: 'ea|north|1', destination: 'Chingford',
    entry: { tapMs: 1_000, predictedMs: 3_000, tapsBefore }, offline,
  });

  it('the cards come straight after the header; the walking time and map link after the cards', () => {
    render(root, withRows(), opts);
    expect(classes()).toEqual([
      'spot-header',
      'direction-card', 'direction-card',
      'spot-tools', 'footer', 'doc-links',
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

  it('names the line\'s end station, not the next stop: East Avenue south is To Liverpool Street', () => {
    render(root, withRows(NEUTRAL_TAP, EA), opts);
    const [north, south] = cards();
    expect(north.querySelector('.card-dest')!.textContent).toBe('To Chingford');
    expect(south.querySelector('.card-dest')!.textContent).toBe('To Liverpool Street');
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
    expect(south.querySelector('.tap-placeholder-title')!.textContent).toBe('Help make this time spot-on');
  });

  it('a pass due for someone who has not answered: the yellow button in the card', () => {
    const tap: TapView = { ...NEUTRAL_TAP, ask: 'first', north: button() };
    render(root, withRows(tap, EA), opts);
    const b = cards()[0].querySelector('.tap-slot .tap-button')!;
    expect(b.textContent).toContain('Tap as the train passes');
  });

  it('timing on and nothing due: an empty reserved slot holds the height', () => {
    const tap: TapView = { ...NEUTRAL_TAP, north: { ...NO_TAP, state: 'reserved' } };
    render(root, withRows(tap, EA), opts);
    const slot = cards()[0].querySelector('.tap-slot')!;
    expect(slot.children).toHaveLength(0);
    expect(slot.getAttribute('aria-hidden')).toBe('true');
    // The reserved slot becomes the button without being replaced.
    render(root, withRows({ ...tap, north: button() }, EA), opts);
    expect(cards()[0].querySelector('.tap-slot')).toBe(slot);
    expect(slot.querySelector('.tap-button')).not.toBeNull();
  });

  it('a second tap that crosses a rank: only its own card shows the rank-up', () => {
    const southThanks = (tapsBefore: number): TapDirectionView => ({
      ...NO_TAP, state: 'thanks', passKey: 'ea|south|1', destination: 'Walthamstow Central',
      entry: { tapMs: 2_000, predictedMs: 4_000, tapsBefore },
    });
    // First tap (the 4th) in the north card.
    render(root, withRows({ ...NEUTRAL_TAP, taps: 4, north: thanks(3) }, EA), opts);
    const northStatus = cards()[0].querySelector('[role="status"]')!;
    // Second tap (the 5th, reaching Guard) in the south card, while north still thanks.
    const removed = removedDuring(() => {
      render(root, withRows({ ...NEUTRAL_TAP, taps: 5, north: thanks(3), south: southThanks(4) }, EA), opts);
    });
    const [north, south] = cards();
    expect(north.querySelector('[role="status"]')).toBe(northStatus);
    expect(removed.includes(northStatus)).toBe(false);
    expect(north.textContent).toContain('Got it. Ticket clipped.');
    expect(north.textContent).not.toContain('Promoted');
    expect(south.textContent).toContain('Promoted to Guard.');
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
    const see = card.querySelector<HTMLAnchorElement>('a.tap-see-ticket')!;
    expect(see.textContent).toBe('See my ticket');
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
    expect(order[ask + 1]).toBe('spot-tools');
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
    root.querySelector<HTMLButtonElement>('.ask-card .ask-decline')!.click();
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
      'spot-header',
      'direction-card', 'direction-card',
      'ask-card', 'spot-tools', 'footer', 'doc-links',
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

describe('render — the rest of the spot screen', () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app')!;
  });

  const TFL_STATUS = 'https://tfl.gov.uk/tube-dlr-overground/status/';
  const both = (overrides: Partial<ViewModel> = {}) => vm({
    north: event(passengerArrival(), 240),
    south: event(passengerArrival({ id: 'p2', destinationName: 'Gospel Oak' }), 540, 'south'),
    ...overrides,
  });
  const classes = () => Array.from(root.children).map((c) => c.className.split(' ')[0]);

  it('the invitation comes after the last direction card, in DOM order', () => {
    render(root, both({ viewpoint: EA, tap: { ...NEUTRAL_TAP, ask: 'first' } }), opts);
    const cards = root.querySelectorAll('.direction-card');
    const invite = root.querySelector('.ask-card')!;
    expect(cards).toHaveLength(2);
    expect(cards[1].compareDocumentPosition(invite) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(invite.textContent).toContain('Fancy timing a train?');
  });

  it('"Show me how" calls onOpenHow; "No thanks" declines', () => {
    const onOpenHow = vi.fn();
    const onHelpChoice = vi.fn();
    render(root, both({ viewpoint: EA, tap: { ...NEUTRAL_TAP, ask: 'again' } }), { ...opts, onOpenHow, onHelpChoice });
    root.querySelector<HTMLAnchorElement>('.ask-card a.ask-how')!.click();
    expect(onOpenHow).toHaveBeenCalledTimes(1);
    root.querySelector<HTMLButtonElement>('.ask-card .ask-decline')!.click();
    expect(onHelpChoice).toHaveBeenCalledWith('declined');
  });

  it('no trains either way: the board 11 card with the TfL status link', () => {
    render(root, vm(), opts);
    const quiet = root.querySelector('.quiet-card')!;
    expect(quiet.querySelector('h2')!.textContent).toBe('No trains for a while');
    expect(quiet.textContent).toContain("The line's having a rest. Check back soon.");
    const link = quiet.querySelector<HTMLAnchorElement>('a')!;
    expect(link.getAttribute('href')).toBe(TFL_STATUS);
    expect(link.textContent).toBe('See what TfL says');
    expect(root.querySelector('.direction-card')).toBeNull();
    expect(classes()[1]).toBe('quiet-card');
  });

  it('connecting: the same card style, plain words', () => {
    render(root, vm({ freshness: { state: 'no-data' } }), opts);
    const card = root.querySelector('.quiet-card')!;
    expect(card.classList.contains('connecting')).toBe(true);
    expect(card.querySelector('h2')!.textContent).toBe('Getting the live times');
    expect(root.textContent).not.toMatch(/TfL…|connecting…/);
    expect(root.querySelector('.direction-card')).toBeNull();
  });

  it('an error before any data: the same card style, no technical detail', () => {
    render(root, vm({ freshness: { state: 'no-data' }, error: 'TfL arrivals HTTP 503' }), opts);
    const card = root.querySelector('.quiet-card')!;
    expect(card.classList.contains('error')).toBe(true);
    expect(card.querySelector('h2')!.textContent).toBe("Can't get the live times");
    expect(root.textContent).not.toContain('HTTP');
    expect(root.textContent).not.toContain('503');
    expect(card.querySelector<HTMLAnchorElement>('a')!.getAttribute('href')).toBe(TFL_STATUS);
    // Never a cause it can't know: a TfL outage is not a signal problem.
    expect(card.textContent).not.toMatch(/signal/i);
  });

  it('live times lost: the paused notice and cards with a dash (board 12)', () => {
    render(root, both({ freshness: { state: 'stale', ageMs: 180_000 } }), opts);
    const notice = root.querySelector('.lost-notice')!;
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.textContent).toContain('Live times paused');
    expect(notice.textContent).toContain("Can't reach the live times right now. We'll keep trying.");
    expect(notice.textContent).not.toMatch(/signal/i);
    expect(classes().slice(0, 4)).toEqual(['spot-header', 'lost-notice', 'direction-card', 'direction-card']);
    for (const card of Array.from(root.querySelectorAll('.direction-card'))) {
      expect(card.classList.contains('lost')).toBe(true);
      expect(card.querySelector('.card-dest')).not.toBeNull();
      expect(card.querySelector('.value')!.textContent).toBe('–');
      expect(card.textContent).toContain('Back when the live times return');
      expect(card.querySelector('.strip, .card-then')).toBeNull();
    }
    expect(root.querySelector('.footer')!.textContent).toBe('Last live times 3 minutes ago');
  });

  it('live times lost: the timing slot stays as it is, only the countdown becomes a dash', () => {
    const pending: TapDirectionView = { ...NO_TAP, state: 'button', passKey: 'ea|north|1', destination: 'Chingford' };
    const thanksOffline: TapDirectionView = {
      ...NO_TAP, state: 'thanks', passKey: 'ea|south|1', destination: 'Walthamstow Central',
      entry: { tapMs: 1_000, predictedMs: 3_000, tapsBefore: 1 }, offline: true,
    };
    const tap: TapView = { ...NEUTRAL_TAP, taps: 2, north: pending, south: { ...NO_TAP, state: 'reserved' } };
    render(root, both({ viewpoint: EA, tap }), opts);
    const northSlot = root.querySelector('.direction-card[data-direction="north"] .tap-slot')!;
    const button = northSlot.querySelector('.tap-button')!;
    render(root, both({ viewpoint: EA, tap, freshness: { state: 'stale', ageMs: 90_000 } }), opts);
    const [north, south] = Array.from(root.querySelectorAll<HTMLElement>('.direction-card'));
    expect(north.classList.contains('lost')).toBe(true);
    // The same slot and button, mid-pass.
    expect(north.querySelector('.tap-slot')).toBe(northSlot);
    expect(northSlot.querySelector('.tap-button')).toBe(button);
    expect(northSlot.className).toBe('tap-slot');
    // The reserved slot keeps its height, empty.
    const reserved = south.querySelector('.tap-slot')!;
    expect(reserved.className).toBe('tap-slot');
    expect(reserved.children).toHaveLength(0);
    // A thank-you while lost, with the no-signal line.
    render(root, both({ viewpoint: EA, tap: { ...tap, south: thanksOffline }, freshness: { state: 'stale', ageMs: 90_000 } }), opts);
    const southSlot = root.querySelector('.direction-card[data-direction="south"] .tap-slot')!;
    expect(southSlot.className).toBe('tap-slot');
    expect(southSlot.textContent).toContain(NO_SIGNAL_LINE);
    expect(Array.from(root.querySelectorAll('.direction-card[data-direction="south"] > *')).map((c) => c.className.split(' ')[0]))
      .toEqual(['card-top', 'value', 'card-lost-note', 'tap-slot']);
  });

  it('back from lost: the same cards fill in again', () => {
    render(root, both({ freshness: { state: 'stale', ageMs: 180_000 } }), opts);
    const card = root.querySelector('.direction-card')!;
    render(root, both(), opts);
    expect(root.querySelector('.lost-notice')).toBeNull();
    expect(root.querySelector('.direction-card')).toBe(card);
    expect(card.classList.contains('lost')).toBe(false);
    expect(card.querySelector('.strip')).not.toBeNull();
  });

  it('fresh: the data age in plain words', () => {
    render(root, both(), opts);
    expect(root.querySelector('.footer')!.textContent).toBe('Live times · updated 5 seconds ago');
  });

  it('the fact sits above the data age and a tap advances it', () => {
    const onAdvanceFact = vi.fn();
    render(root, both({ fact: { text: 'The Chingford branch opened in 1870.', category: 'line' } }), { ...opts, onAdvanceFact });
    const order = classes();
    expect(order.indexOf('fact-line')).toBe(order.indexOf('footer') - 1);
    root.querySelector<HTMLButtonElement>('.fact-line')!.click();
    expect(onAdvanceFact).toHaveBeenCalledTimes(1);
  });

  it('walking time, its off control and "Verify on map" sit together after the cards', () => {
    const onEnableWalkingTime = vi.fn();
    const onDisableWalkingTime = vi.fn();
    const handlers = { ...opts, onEnableWalkingTime, onDisableWalkingTime };
    render(root, both(), handlers);
    const tools = root.querySelector('.spot-tools')!;
    const map = tools.querySelector<HTMLAnchorElement>('a.map-link')!;
    expect(map.textContent).toBe('Verify on map');
    expect(map.href).toBe(`https://www.google.com/maps/search/?api=1&query=${QR.coords.lat},${QR.coords.lng}`);
    tools.querySelector<HTMLElement>('.walking-time-enable')!.click();
    expect(onEnableWalkingTime).toHaveBeenCalledTimes(1);
    render(root, both({ walkingLabel: '4 min walk · 300 m' }), handlers);
    const walking = root.querySelector('.spot-tools .walking-time')!;
    expect(walking.textContent).toContain('4 min walk · 300 m');
    expect(walking.querySelector('.walking-time-off')!.textContent).toBe('Turn off');
    walking.querySelector<HTMLButtonElement>('.walking-time-off')!.click();
    expect(onDisableWalkingTime).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['with trains', () => both()],
    ['with no trains', () => vm()],
    ['while connecting', () => vm({ freshness: { state: 'no-data' } })],
    ['after an error', () => vm({ freshness: { state: 'no-data' }, error: 'x' })],
    ['with live times lost', () => both({ freshness: { state: 'stale', ageMs: 90_000 } })],
  ])('keeps About, Privacy, Terms and the map link %s', (_name, model) => {
    render(root, model(), opts);
    const hrefs = Array.from(root.querySelectorAll<HTMLAnchorElement>('.doc-links a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/about.html', '/privacy.html', '/terms.html']);
    expect(root.querySelector('a.map-link')).not.toBeNull();
  });

  it('no exclamation marks anywhere on the spot screen', () => {
    for (const model of [both({ tap: { ...NEUTRAL_TAP, ask: 'first' } }), vm(), vm({ freshness: { state: 'no-data' } }),
      both({ freshness: { state: 'stale', ageMs: 90_000 } })]) {
      render(root, model, opts);
      expect(root.textContent).not.toContain('!');
    }
  });
});
