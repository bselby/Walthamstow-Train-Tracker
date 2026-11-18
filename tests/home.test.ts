import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHome, type HomeOptions } from '../src/home';
import type { HomeModel, HomeRow } from '../src/homeModel';

const NAMES: Record<string, [string, string, string]> = {
  'east-ave': ['East Avenue Bridge', 'Weaver', '/walthamstow/east-avenue-bridge'],
  'queens-road': ['Queens Road Station', 'Suffragette', '/walthamstow/queens-road-station'],
  'northcote-rd': ['Northcote Road Bridge', 'Suffragette', '/walthamstow/northcote-road-bridge'],
};

function row(id: string, overrides: Partial<HomeRow> = {}): HomeRow {
  const [name, lineName, href] = NAMES[id];
  return {
    id, name, lineName, href,
    lineColor: 'oklch(55% 0.15 155)',
    walk: null,
    countdown: { kind: 'minutes', text: '2 min' },
    favourite: false,
    ...overrides,
  };
}

function model(overrides: Partial<HomeModel> = {}): HomeModel {
  return { favourites: [], others: [], othersTitle: 'All spots', location: 'off', notice: null, ...overrides };
}

function options() {
  return {
    onOpen: vi.fn<(id: string) => void>(),
    onToggleFavourite: vi.fn<(id: string) => void>(),
    onUseLocation: vi.fn<() => void>(),
    onLocationOff: vi.fn<() => void>(),
  } satisfies HomeOptions;
}

describe('renderHome', () => {
  let root: HTMLElement;
  let opts: ReturnType<typeof options>;
  const texts = (sel: string) => Array.from(root.querySelectorAll(sel)).map((e) => e.textContent);
  const ids = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel)).map((e) => e.dataset.id);

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('main');
    document.body.appendChild(root);
    opts = options();
  });

  it('shows favourites, then the location button, then all spots', () => {
    renderHome(root, model({ favourites: [row('east-ave', { favourite: true })], others: [row('queens-road')] }), opts);
    expect(texts('h2')).toEqual(['Your favourites', 'All spots']);
    expect(root.querySelector('.home-locate')?.textContent).toBe('Use my location');
    const order = Array.from(root.children).map((c) => c.className.split(' ')[0]);
    expect(order.indexOf('home-favourites')).toBeLessThan(order.indexOf('home-locate'));
    expect(order.indexOf('home-locate')).toBeLessThan(order.indexOf('home-others'));
    expect(root.querySelector('h1')?.textContent).toBe('E17 Trains');
  });

  it('the header is a card with a train, the title and the promise', () => {
    renderHome(root, model({ others: [row('queens-road')] }), opts);
    const header = root.querySelector('.home-header')!;
    expect(header.querySelector('svg.train-passenger')).not.toBeNull();
    expect(header.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(header.querySelector('.home-tagline')!.textContent).toBe('When the next train passes, to the second.');
  });

  it('hides the favourites section when there are none', () => {
    renderHome(root, model({ others: [row('queens-road')] }), opts);
    expect(root.querySelector('.home-favourites')).toBeNull();
    expect(texts('h2')).toEqual(['All spots']);
  });

  it('hides the other-spots section when every spot is a favourite', () => {
    renderHome(root, model({ favourites: [row('queens-road', { favourite: true })] }), opts);
    expect(root.querySelector('.home-others')).toBeNull();
  });

  it('titles the list "Near you" when the model says so', () => {
    renderHome(root, model({ others: [row('queens-road')], othersTitle: 'Near you', location: 'on' }), opts);
    expect(texts('h2')).toEqual(['Near you']);
  });

  it('a row is a real link with name, line, walk and countdown', () => {
    renderHome(root, model({ others: [row('queens-road', { walk: '4 min walk' })] }), opts);
    const link = root.querySelector<HTMLAnchorElement>('.home-row[data-id="queens-road"] a.home-row-link')!;
    expect(link.getAttribute('href')).toBe('/walthamstow/queens-road-station');
    expect(link.querySelector('.home-row-name')!.textContent).toBe('Queens Road Station');
    expect(link.querySelector('.home-row-meta')!.textContent).toBe('Suffragette line · 4 min walk');
    const countdown = link.querySelector('.home-row-countdown')!;
    expect(countdown.querySelector('.home-count-num')!.textContent).toBe('2');
    expect(countdown.querySelector('.home-count-unit')!.textContent).toBe('minutes');
    expect(countdown.classList.contains('minutes')).toBe(true);
  });

  it('colours the row by its line with a class, so the theme can follow', () => {
    renderHome(root, model({ others: [row('east-ave'), row('queens-road')] }), opts);
    expect(root.querySelector('[data-id="east-ave"]')!.classList.contains('line-weaver')).toBe(true);
    expect(root.querySelector('[data-id="queens-road"]')!.classList.contains('line-suffragette')).toBe(true);
  });

  it.each([
    [{ kind: 'minutes', text: '1 min' }, '1', 'minute', '1 minute'],
    [{ kind: 'minutes', text: '7 min' }, '7', 'minutes', '7 minutes'],
    [{ kind: 'seconds', text: '25 sec' }, '25', 'seconds', '25 seconds'],
    [{ kind: 'now', text: 'NOW' }, 'NOW', '', 'Now'],
    [{ kind: 'none', text: 'No trains' }, 'No trains', '', 'No trains due'],
    [{ kind: 'loading', text: '…' }, '…', '', 'Waiting for times'],
    [{ kind: 'stale', text: '—' }, '—', '', 'No live times'],
  ] as const)('countdown %o shows %s %s and is announced as "%s"', (countdown, num, unit, spoken) => {
    renderHome(root, model({ others: [row('queens-road', { countdown })] }), opts);
    const el = root.querySelector('.home-row-countdown')!;
    expect(el.classList.contains(countdown.kind)).toBe(true);
    expect(el.querySelector('.home-count-num')!.textContent).toBe(num);
    expect(el.querySelector('.home-count-unit')!.textContent).toBe(unit);
    expect(el.querySelector('.visually-hidden')!.textContent).toBe(spoken);
    expect(el.querySelector('.home-count-num')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('leaves the walk out of a row when there is none', () => {
    renderHome(root, model({ others: [row('queens-road')] }), opts);
    expect(root.querySelector('.home-row-meta')!.textContent).toBe('Suffragette line');
  });

  it('clicking a row opens it without a page load', () => {
    renderHome(root, model({ others: [row('queens-road')] }), opts);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    root.querySelector('.home-row-name')!.dispatchEvent(ev);
    expect(opts.onOpen).toHaveBeenCalledWith('queens-road');
    expect(ev.defaultPrevented).toBe(true);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }])(
    'a click with %o is left to the browser',
    (init) => {
      renderHome(root, model({ others: [row('queens-road')] }), opts);
      const link = root.querySelector('a.home-row-link')!;
      link.addEventListener('click', (e) => e.preventDefault()); // stop jsdom navigating; runs after ours
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
      let preventedByHome = false;
      root.addEventListener('click', (e) => { preventedByHome = e.defaultPrevented; }, { capture: true });
      link.dispatchEvent(ev);
      expect(opts.onOpen).not.toHaveBeenCalled();
      expect(preventedByHome).toBe(false);
    },
  );

  it('the star toggles without opening the row, and is not inside the link', () => {
    renderHome(root, model({ favourites: [row('east-ave', { favourite: true })], others: [row('queens-road')] }), opts);
    const star = root.querySelector<HTMLElement>('.home-row[data-id="queens-road"] .home-star')!;
    expect(star.closest('a')).toBeNull();
    expect(star.getAttribute('aria-pressed')).toBe('false');
    expect(star.getAttribute('aria-label')).toBe('Favourite: Queens Road Station');
    expect(root.querySelector('.home-row[data-id="east-ave"] .home-star')!.getAttribute('aria-pressed')).toBe('true');
    star.click();
    expect(opts.onToggleFavourite).toHaveBeenCalledWith('queens-road');
    expect(opts.onOpen).not.toHaveBeenCalled();
  });

  it('asks for location only when the button is tapped', () => {
    renderHome(root, model({ others: [row('queens-road')] }), opts);
    expect(opts.onUseLocation).not.toHaveBeenCalled();
    root.querySelector<HTMLElement>('.home-locate')!.click();
    expect(opts.onUseLocation).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['locating', 'Finding you…'],
    ['on', 'Nearest first'],
    ['denied', 'Location unavailable'],
    ['no-signal', 'No GPS signal'],
  ] as const)('location %s shows "%s" with an off button', (location, text) => {
    renderHome(root, model({ others: [row('queens-road')], location }), opts);
    expect(root.querySelector('.home-locate')).toBeNull();
    expect(root.querySelector('.home-location-text')!.textContent).toBe(text);
    expect(root.querySelector('.home-location-off')!.textContent).toBe('Turn off');
    root.querySelector<HTMLElement>('.home-location-off')!.click();
    expect(opts.onLocationOff).toHaveBeenCalledTimes(1);
  });

  it('shows no location control where the browser has none', () => {
    renderHome(root, model({ others: [row('queens-road')], location: 'unavailable' }), opts);
    expect(root.querySelector('.home-locate')).toBeNull();
    expect(root.querySelector('.home-location')).toBeNull();
  });

  it('a countdown that changes keeps its elements', () => {
    renderHome(root, model({ others: [row('queens-road')] }), opts);
    const num = root.querySelector('.home-count-num');
    renderHome(root, model({ others: [row('queens-road', { countdown: { kind: 'seconds', text: '40 sec' } })] }), opts);
    expect(root.querySelector('.home-count-num')).toBe(num);
  });

  it('keeps each row element across redraws and re-sorts', () => {
    renderHome(root, model({ others: [row('east-ave'), row('queens-road')] }), opts);
    const before = root.querySelector('[data-id="queens-road"]');
    const starBefore = before!.querySelector('.home-star');
    renderHome(root, model({
      others: [row('queens-road', { countdown: { kind: 'seconds', text: '40 sec' } }), row('east-ave')],
    }), opts);
    const after = root.querySelector('[data-id="queens-road"]');
    expect(after).toBe(before);
    expect(after!.querySelector('.home-star')).toBe(starBefore);
    expect(ids('.home-others .home-row')).toEqual(['queens-road', 'east-ave']);
    const countdown = after!.querySelector('.home-row-countdown')!;
    expect(countdown.querySelector('.home-count-num')!.textContent).toBe('40');
    expect(countdown.classList.contains('seconds')).toBe(true);
    expect(countdown.classList.contains('minutes')).toBe(false);
  });

  it('does not move a row that is already in place', () => {
    renderHome(root, model({ others: [row('east-ave'), row('queens-road')] }), opts);
    const list = root.querySelector('.home-others .home-list')!;
    const moved: Node[] = [];
    new MutationObserver((records) => records.forEach((r) => moved.push(...Array.from(r.addedNodes))))
      .observe(list, { childList: true });
    renderHome(root, model({ others: [row('east-ave'), row('queens-road')] }), opts);
    return Promise.resolve().then(() => expect(moved).toEqual([]));
  });

  it('a row moving into favourites keeps its element', () => {
    renderHome(root, model({ others: [row('east-ave'), row('queens-road')] }), opts);
    const before = root.querySelector('[data-id="queens-road"]');
    renderHome(root, model({ favourites: [row('queens-road', { favourite: true })], others: [row('east-ave')] }), opts);
    expect(root.querySelector('.home-favourites [data-id="queens-road"]')).toBe(before);
    expect(before!.querySelector('.home-star')!.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelectorAll('[data-id="queens-road"]').length).toBe(1);
  });

  it('drops a row that is no longer in the model', () => {
    renderHome(root, model({ others: [row('east-ave'), row('queens-road')] }), opts);
    renderHome(root, model({ others: [row('east-ave')] }), opts);
    expect(ids('.home-row')).toEqual(['east-ave']);
  });

  it('uses the latest handlers after a redraw', () => {
    renderHome(root, model({ others: [row('queens-road')] }), opts);
    const later = options();
    renderHome(root, model({ others: [row('queens-road')] }), later);
    root.querySelector<HTMLElement>('.home-star')!.click();
    expect(later.onToggleFavourite).toHaveBeenCalledWith('queens-road');
    expect(opts.onToggleFavourite).not.toHaveBeenCalled();
  });

  it('clears whatever the countdown screen left behind', () => {
    root.innerHTML = '<div class="spot-header"></div><section class="row"></section><div class="footer"></div>';
    renderHome(root, model({ others: [row('queens-road')] }), opts);
    expect(root.querySelector('.spot-header')).toBeNull();
    expect(root.querySelector('.row')).toBeNull();
    expect(root.querySelector('.footer')).toBeNull();
  });

  it('shows the TfL notice when set, and removes it when cleared', () => {
    renderHome(root, model({ others: [row('queens-road')], notice: "Can't reach TfL. Trying again." }), opts);
    expect(root.querySelector('.home-notice')!.textContent).toBe("Can't reach TfL. Trying again.");
    renderHome(root, model({ others: [row('queens-road')] }), opts);
    expect(root.querySelector('.home-notice')).toBeNull();
  });

  it('ends with the site links', () => {
    renderHome(root, model({ others: [row('queens-road')] }), opts);
    const last = root.lastElementChild!;
    expect(last.classList.contains('doc-links')).toBe(true);
    expect(Array.from(last.querySelectorAll('a')).map((a) => a.getAttribute('href')))
      .toEqual(['/about.html', '/privacy.html', '/terms.html']);
  });
});
