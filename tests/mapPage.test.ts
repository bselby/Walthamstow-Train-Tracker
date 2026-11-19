import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  renderMapPage,
  updateMapPage,
  leaveMapPage,
  type CreateEngine,
  type MapEngine,
  type MapPageModel,
  type MapPageOptions,
} from '../src/mapPage';
import type { MapPin } from '../src/mapModel';

const PINS: MapPin[] = [
  {
    id: 'east-avenue',
    name: 'East Avenue Bridge',
    lineName: 'Weaver',
    lineClass: 'line-weaver',
    href: '/walthamstow/east-avenue',
    coords: { lat: 51.58, lng: -0.02 },
    walk: '5 min walk',
  },
  {
    id: 'northcote',
    name: 'Northcote Road Bridge',
    lineName: 'Suffragette',
    lineClass: 'line-suffragette',
    href: '/walthamstow/northcote',
    coords: { lat: 51.59, lng: -0.03 },
    walk: null,
  },
];

interface FakeEngine extends MapEngine {
  calls: Array<[string, unknown]>;
  pick: (id: string) => void;
  move: (c: { lng: number; lat: number; zoom: number }, byUser?: boolean) => void;
}

function fakeEngine(): FakeEngine {
  const calls: Array<[string, unknown]> = [];
  const e: FakeEngine = {
    calls,
    pick: () => {},
    move: () => {},
    setPins(pins, onPick) { calls.push(['setPins', pins]); e.pick = onPick; },
    setYou(p) { calls.push(['setYou', p]); },
    fit(b) { calls.push(['fit', b]); },
    setCamera(c) { calls.push(['setCamera', c]); },
    onMove(fn) { calls.push(['onMove', null]); e.move = (c, byUser = true) => fn(c, byUser); },
    setScheme(s) { calls.push(['setScheme', s]); },
    destroy() { calls.push(['destroy', null]); },
  };
  return e;
}

const model = (o: Partial<MapPageModel> = {}): MapPageModel => ({
  pins: PINS,
  firstView: [[-0.03, 51.58], [-0.02, 51.59]],
  camera: null,
  you: null,
  locationOff: false,
  ...o,
});

let root: HTMLElement;
let engine: FakeEngine;
let onFail: () => void;

function options(o: Partial<MapPageOptions> = {}): MapPageOptions {
  const createEngine: CreateEngine = vi.fn(async (_c, _s, fail) => {
    onFail = fail;
    return engine;
  });
  return {
    onBack: vi.fn(),
    onSeeList: vi.fn(),
    onOpen: vi.fn(),
    onUseLocation: vi.fn(),
    onMove: vi.fn(),
    createEngine,
    ...o,
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
  engine = fakeEngine();
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
});

afterEach(() => leaveMapPage());

describe('renderMapPage', () => {
  it('draws a back button, the title Map, the map container and a hidden list of spot links', async () => {
    const opts = options();
    renderMapPage(root, model(), opts);
    await flush();
    const back = root.querySelector<HTMLButtonElement>('button.info-back')!;
    expect(back.textContent).toBe('Back');
    back.click();
    expect(opts.onBack).toHaveBeenCalled();
    expect(root.querySelector('h1.info-title')!.textContent).toBe('Map');
    const container = root.querySelector('.map-canvas')!;
    expect(container).not.toBeNull();
    expect(opts.createEngine).toHaveBeenCalledWith(container, 'light', expect.any(Function));
    const list = root.querySelector('ul.visually-hidden')!;
    expect(container.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const links = list.querySelectorAll('a');
    expect([...links].map((a) => a.textContent)).toEqual(['East Avenue Bridge', 'Northcote Road Bridge']);
    expect(links[0].getAttribute('href')).toBe('/walthamstow/east-avenue');
    links[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(opts.onOpen).toHaveBeenCalledWith('northcote');
    expect(engine.calls.find(([n]) => n === 'setPins')![1]).toEqual(PINS);
  });

  it('fits to the first view when there is no camera, and uses the camera when there is one', async () => {
    const opts = options();
    renderMapPage(root, model(), opts);
    await flush();
    expect(engine.calls).toContainEqual(['fit', [[-0.03, 51.58], [-0.02, 51.59]]]);
    expect(engine.calls.some(([n]) => n === 'setCamera')).toBe(false);
    engine.move({ lng: 1, lat: 2, zoom: 3 });
    expect(opts.onMove).toHaveBeenCalledWith({ lng: 1, lat: 2, zoom: 3 });

    leaveMapPage();
    expect(engine.calls).toContainEqual(['destroy', null]);
    engine = fakeEngine();
    renderMapPage(root, model({ camera: { lng: -0.02, lat: 51.58, zoom: 15 } }), options());
    await flush();
    expect(engine.calls).toContainEqual(['setCamera', { lng: -0.02, lat: 51.58, zoom: 15 }]);
    expect(engine.calls.some(([n]) => n === 'fit')).toBe(false);
  });

  it('picking a pin opens a card with name, line, walk and Open', async () => {
    const opts = options();
    renderMapPage(root, model(), opts);
    await flush();
    expect(root.querySelector('.map-card')).toBeNull();

    engine.pick('east-avenue');
    const wrap = root.querySelector('.map-wrap')!;
    expect(wrap.classList.contains('card-open')).toBe(true);
    let card = root.querySelector('.map-card')!;
    expect(card.textContent).toContain('East Avenue Bridge');
    expect(card.textContent).toContain('Weaver line');
    expect(card.textContent).toContain('5 min walk');
    const open = [...card.querySelectorAll('button')].find((b) => b.textContent === 'Open')!;
    open.click();
    expect(opts.onOpen).toHaveBeenCalledWith('east-avenue');

    engine.pick('northcote');
    expect(root.querySelectorAll('.map-card')).toHaveLength(1);
    card = root.querySelector('.map-card')!;
    expect(card.textContent).toContain('Northcote Road Bridge');
    expect(card.textContent).toContain('Suffragette line');
    expect(card.textContent).not.toContain('walk');

    const close = card.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!;
    expect(close.classList.contains('map-card-close')).toBe(true);
    close.click();
    expect(root.querySelector('.map-card')).toBeNull();
    expect(wrap.classList.contains('card-open')).toBe(false);

    engine.pick('northcote');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(root.querySelector('.map-card')).toBeNull();
  });

  it('Use my location shows only when location is off and calls onUseLocation', async () => {
    const opts = options();
    renderMapPage(root, model(), opts);
    await flush();
    expect(root.querySelector('.map-locate')).toBeNull();
    updateMapPage(root, model({ locationOff: true }));
    const button = root.querySelector<HTMLButtonElement>('.map-locate')!;
    expect(button.textContent).toBe('Use my location');
    button.click();
    expect(opts.onUseLocation).toHaveBeenCalled();
    updateMapPage(root, model({ locationOff: false, you: { lat: 51.58, lng: -0.02 } }));
    expect(root.querySelector('.map-locate')).toBeNull();
    expect(engine.calls).toContainEqual(['setYou', { lat: 51.58, lng: -0.02 }]);
  });

  describe('after Use my location', () => {
    const YOU = { lat: 51.6, lng: -0.01 };
    const NEW_VIEW: MapPageModel['firstView'] = [[-0.02, 51.58], [-0.01, 51.6]];
    const fits = () => engine.calls.filter(([n]) => n === 'fit');

    it('fits to the parent and nearest spot on the first fix when the map has not been moved', async () => {
      renderMapPage(root, model({ locationOff: true }), options());
      await flush();
      engine.move({ lng: 0, lat: 0, zoom: 13 }, false); // a resize, not the parent
      root.querySelector<HTMLButtonElement>('.map-locate')!.click();
      updateMapPage(root, model({ locationOff: false }));
      expect(fits()).toHaveLength(1);
      updateMapPage(root, model({ you: YOU, firstView: NEW_VIEW }));
      expect(fits()).toHaveLength(2);
      expect(fits()[1]).toEqual(['fit', NEW_VIEW]);
      // Later fixes leave the map where it is.
      updateMapPage(root, model({ you: { lat: 51.61, lng: -0.01 }, firstView: [[0, 0], [1, 1]] }));
      expect(fits()).toHaveLength(2);
    });

    it('leaves the map alone if the parent has moved it', async () => {
      renderMapPage(root, model({ locationOff: true }), options());
      await flush();
      engine.move({ lng: 0.1, lat: 51.5, zoom: 14 });
      root.querySelector<HTMLButtonElement>('.map-locate')!.click();
      updateMapPage(root, model({ you: YOU, firstView: NEW_VIEW }));
      expect(fits()).toHaveLength(1);
    });

    it('leaves the map alone if it opened on a saved camera', async () => {
      renderMapPage(root, model({ locationOff: true, camera: { lng: 0, lat: 51, zoom: 12 } }), options());
      await flush();
      root.querySelector<HTMLButtonElement>('.map-locate')!.click();
      updateMapPage(root, model({ you: YOU, firstView: NEW_VIEW }));
      expect(fits()).toHaveLength(0);
    });

    it('does not fit on a fix that arrives without the tap', async () => {
      renderMapPage(root, model(), options());
      await flush();
      updateMapPage(root, model({ you: YOU, firstView: NEW_VIEW }));
      expect(fits()).toHaveLength(1);
    });
  });

  it('updateMapPage refreshes the open card walking time', async () => {
    renderMapPage(root, model(), options());
    await flush();
    engine.pick('east-avenue');
    updateMapPage(root, model({ pins: [{ ...PINS[0], walk: '3 min walk' }, PINS[1]] }));
    expect(root.querySelector('.map-card')!.textContent).toContain('3 min walk');
  });

  it("when the engine fails, it says the map can't load and links to the list", async () => {
    const check = (opts: MapPageOptions) => {
      const fail = root.querySelector('.map-fail')!;
      expect(fail.querySelector('p')!.textContent).toBe("The map can't load right now.");
      const link = [...fail.querySelectorAll('a')].find((a) => a.textContent === 'See the list')!;
      expect(link.getAttribute('href')).toBe('/');
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }));
      expect(opts.onSeeList).not.toHaveBeenCalled();
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(opts.onSeeList).toHaveBeenCalled();
      expect(opts.onBack).not.toHaveBeenCalled();
    };

    const rejecting = options({ createEngine: vi.fn(() => Promise.reject(new Error('no webgl'))) });
    renderMapPage(root, model(), rejecting);
    await flush();
    check(rejecting);
    leaveMapPage();

    const failing = options();
    renderMapPage(root, model(), failing);
    await flush();
    expect(root.querySelector('.map-fail')).toBeNull();
    onFail();
    check(failing);
  });

  it('hides Use my location once the map has failed', async () => {
    renderMapPage(root, model({ locationOff: true }), options());
    await flush();
    expect(root.querySelector('.map-locate')).not.toBeNull();
    onFail();
    expect(root.querySelector('.map-locate')).toBeNull();
    updateMapPage(root, model({ locationOff: true }));
    expect(root.querySelector('.map-locate')).toBeNull();
  });

  it('no exclamation marks on the map page', async () => {
    renderMapPage(root, model({ locationOff: true }), options());
    await flush();
    engine.pick('east-avenue');
    onFail();
    expect(root.textContent).not.toContain('!');
  });
});
