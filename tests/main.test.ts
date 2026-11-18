// The app shell (main.ts) end to end in jsdom: TfL, freight and signalling
// are stubbed; everything else is the real code. main.ts runs on import, so
// each test loads a fresh copy.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Arrival } from '../src/tfl';

const fetchArrivals = vi.fn<(stopPointId: string, lineId: string) => Promise<Arrival[]>>();

vi.mock('../src/tfl', () => ({
  fetchArrivals: (stop: string, line: string) => fetchArrivals(stop, line),
  fetchStopArrivals: () => new Promise<Arrival[]>(() => {}),
}));
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

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  fetchArrivals.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
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
    window.history.back();
    for (let i = 0; i < 20 && window.location.pathname === '/ticket'; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    await flush();

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
