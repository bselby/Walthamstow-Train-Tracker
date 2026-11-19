// The app shell (main.ts) end to end in jsdom: TfL, freight and signalling
// are stubbed; everything else is the real code. main.ts runs on import, so
// each test loads a fresh copy.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Arrival } from '../src/tfl';

const fetchArrivals = vi.fn<(stopPointId: string, lineId: string) => Promise<Arrival[]>>();
const fetchStopArrivals = vi.fn<(stopPointId: string) => Promise<Arrival[]>>();

vi.mock('../src/tfl', () => ({
  fetchArrivals: (stop: string, line: string) => fetchArrivals(stop, line),
  fetchStopArrivals: (stop: string) => fetchStopArrivals(stop),
}));

// MapLibre needs WebGL, which jsdom doesn't have: a fake engine per map visit.
interface FakeEngine {
  app: Element | null;
  fit: ReturnType<typeof vi.fn>;
  setCamera: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  move: ((c: { lng: number; lat: number; zoom: number }) => void) | null;
}
const allEngines = vi.hoisted(() => [] as FakeEngine[]);
// Each boot loads a fresh main.ts, and earlier copies still hear popstate
// with their own (detached) app element: only this boot's engines count.
const engines = (): FakeEngine[] => allEngines.filter((e) => e.app === document.getElementById('app'));
vi.mock('../src/mapEngine', async () => {
  const { vi: v } = await import('vitest');
  return {
    createMapLibreEngine: async (container: HTMLElement) => {
      const e: FakeEngine = { app: container.closest('#app'), fit: v.fn(), setCamera: v.fn(), destroy: v.fn(), move: null };
      allEngines.push(e);
      return {
        setPins: () => {},
        setYou: () => {},
        fit: e.fit,
        setCamera: e.setCamera,
        onMove: (fn: FakeEngine['move']) => { e.move = fn; },
        setScheme: () => {},
        destroy: e.destroy,
      };
    },
  };
});
vi.mock('../src/tdProxy', () => ({ subscribeBerthEvents: () => () => {} }));
vi.mock('../src/freight', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/freight')>()),
  fetchFreight: () => Promise.resolve([]),
}));

function arrival(destinationName: string, timeToStation: number, id: string): Arrival {
  return {
    id,
    vehicleId: id,
    stationName: 'Walthamstow Central',
    lineId: 'weaver',
    destinationName,
    timeToStation,
    expectedArrival: new Date(Date.now() + timeToStation * 1000).toISOString(),
    modeName: 'overground',
    platformName: 'Platform 1',
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

async function boot(path: string): Promise<HTMLElement> {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState({}, '', path);
  await import('../src/main');
  await flush();
  return document.getElementById('app')!;
}

/**
 * Do something that moves through history (back, forward, a link that goes
 * back) and wait for its popstate to land, then for the app to settle. jsdom
 * fires popstate on a later task, so this waits for that event rather than
 * polling the address bar.
 */
async function travel(go: () => void): Promise<void> {
  const landed = new Promise<void>((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
  });
  go();
  await landed;
  await flush();
}

// A plain in-memory store: Node's own localStorage global shadows jsdom's.
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => { data.set(k, String(v)); },
  };
}

// The first boot loads (and transforms) main.ts and everything it imports,
// which is slow on a busy machine. Do it once here, in a hook with its own
// time limit, so no single test pays for it. Later boots reuse the transforms.
beforeAll(async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  fetchArrivals.mockImplementation(() => new Promise<Arrival[]>(() => {}));
  fetchStopArrivals.mockImplementation(() => new Promise<Arrival[]>(() => {}));
  await boot('/');
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  fetchArrivals.mockReset();
  fetchStopArrivals.mockReset();
  fetchStopArrivals.mockImplementation(() => new Promise<Arrival[]>(() => {}));
  allEngines.length = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('back from the ticket to the same spot', () => {
  it('shows the kept countdown at once, and a showing thank-you is still showing', async () => {
    // Someone already helping, so the south train's button is open (it is
    // 18 s from the bridge at East Avenue).
    localStorage.setItem('wtt_tap_state', JSON.stringify({ choice: 'helping', taps: 2, deviceId: 'abcdefgh-1234' }));
    fetchArrivals.mockResolvedValueOnce([
      arrival('Chingford', 300, 'n1'),
      arrival('Liverpool Street', 40, 's1'),
    ]);
    // Every later fetch hangs, so only kept data can fill the cards.
    fetchArrivals.mockImplementation(() => new Promise<Arrival[]>(() => {}));

    const root = await boot('/walthamstow/east-avenue-bridge');
    expect(root.querySelectorAll('.direction-card')).toHaveLength(2);

    root.querySelector<HTMLButtonElement>('.direction-card[data-direction="south"] .tap-button')!.click();
    expect(root.querySelector('.tap-thanks')).not.toBeNull();

    root.querySelector<HTMLButtonElement>('.ticket-badge')!.click();
    expect(root.querySelector('h1')!.textContent).toBe('Your ticket');

    // Back, as the browser does it.
    await travel(() => window.history.back());

    expect(window.location.pathname).toBe('/walthamstow/east-avenue-bridge');
    expect(root.querySelector('.quiet-card')).toBeNull();
    expect(root.textContent).not.toContain('Getting the live times');
    expect(root.querySelectorAll('.direction-card')).toHaveLength(2);
    expect(root.querySelector('.direction-card[data-direction="south"] .tap-thanks')).not.toBeNull();
  });

  it('starts clean when the spot shown after the ticket is a different one', async () => {
    fetchArrivals.mockResolvedValueOnce([arrival('Chingford', 300, 'n1'), arrival('Liverpool Street', 200, 's1')]);
    fetchArrivals.mockImplementation(() => new Promise<Arrival[]>(() => {}));

    const root = await boot('/walthamstow/east-avenue-bridge');
    expect(root.querySelectorAll('.direction-card')).toHaveLength(2);
    root.querySelector<HTMLButtonElement>('.ticket-badge')!.click();

    // The address bar now names another spot (a forward or typed route).
    window.history.replaceState({}, '', '/walthamstow/queens-road-station');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();

    expect(root.textContent).toContain('Getting the live times');
  });
});

describe('the map', () => {
  it('opening it from home pushes /map from home, and home stops polling', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    fetchStopArrivals.mockResolvedValue([]);
    const root = await boot('/');
    expect(root.querySelector('.home-map')).not.toBeNull();
    // Home polls on its interval while it shows.
    const before = fetchStopArrivals.mock.calls.length;
    vi.advanceTimersByTime(30_000);
    await flush();
    expect(fetchStopArrivals.mock.calls.length).toBeGreaterThan(before);

    root.querySelector<HTMLButtonElement>('.home-map')!.click();
    await flush();
    expect(window.location.pathname).toBe('/map');
    expect(window.history.state).toEqual({ from: '/' });
    expect(document.title).toBe('E17 Trains — Map');
    expect(root.querySelector('h1')!.textContent).toBe('Map');

    const onMap = fetchStopArrivals.mock.calls.length;
    vi.advanceTimersByTime(90_000);
    await flush();
    expect(fetchStopArrivals.mock.calls.length).toBe(onMap);
  });

  it('a spot opened from the map goes back to it, where it was left', async () => {
    fetchArrivals.mockImplementation(() => new Promise<Arrival[]>(() => {}));
    const root = await boot('/map');
    expect(engines()).toHaveLength(1);
    // Nothing saved yet: the first view is fitted.
    expect(engines()[0].fit).toHaveBeenCalled();

    const camera = { lng: -0.03, lat: 51.58, zoom: 15.5 };
    engines()[0].move!(camera);
    expect(window.history.state.camera).toEqual(camera);

    root.querySelector<HTMLAnchorElement>('.map-list a')!.click();
    await flush();
    expect(window.location.pathname).not.toBe('/map');
    expect(window.history.state).toEqual({ from: '/map' });
    expect(engines()[0].destroy).toHaveBeenCalled();
    expect(root.querySelector('.spot-header-home-label')!.textContent).toBe('Map');
    expect(root.querySelector('.spot-header-home')!.getAttribute('href')).toBe('/map');

    await travel(() => root.querySelector<HTMLAnchorElement>('.spot-header-home')!.click());

    expect(window.location.pathname).toBe('/map');
    expect(engines()).toHaveLength(2);
    expect(engines()[1].setCamera).toHaveBeenCalledWith(camera);
    expect(engines()[1].fit).not.toHaveBeenCalled();
  });

  it('popstate back to /map restores the saved camera', async () => {
    const root = await boot('/');
    root.querySelector<HTMLButtonElement>('.home-map')!.click();
    await flush();
    const camera = { lng: -0.01, lat: 51.59, zoom: 14 };
    engines()[0].move!(camera);

    await travel(() => window.history.back());
    expect(window.location.pathname).toBe('/');
    expect(engines()[0].destroy).toHaveBeenCalled();
    expect(root.querySelector('.home-map')).not.toBeNull();

    await travel(() => window.history.forward());
    expect(window.location.pathname).toBe('/map');
    expect(engines()[1].setCamera).toHaveBeenCalledWith(camera);
  });

  it('opened directly, its back link goes home', async () => {
    const root = await boot('/map');
    root.querySelector<HTMLButtonElement>('.info-back')!.click();
    await flush();
    expect(window.location.pathname).toBe('/');
    expect(root.querySelector('.home-map')).not.toBeNull();
    expect(engines()[0].destroy).toHaveBeenCalled();
  });

  it('a spot opened from home still goes back to home', async () => {
    fetchArrivals.mockImplementation(() => new Promise<Arrival[]>(() => {}));
    const root = await boot('/walthamstow/east-avenue-bridge');
    expect(root.querySelector('.spot-header-home-label')!.textContent).toBe('All spots');
  });
});
