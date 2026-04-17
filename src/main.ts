import { fetchArrivals } from './tfl';
import { pickNextPerDirection } from './bridge';
import { classifyFreshness } from './freshness';
import { startPoller } from './poller';
import { render, type ViewModel } from './render';
import { WALTHAMSTOW_CENTRAL_STOPPOINT_ID, POLL_INTERVAL_MS } from './constants';
import type { BridgeEvent } from './bridge';

const root = document.getElementById('app')!;

let lastFetchMs: number | null = null;
let lastEvents: { north?: BridgeEvent; south?: BridgeEvent } = {};
let lastError: string | undefined;

function buildViewModel(): ViewModel {
  return {
    north: lastEvents.north,
    south: lastEvents.south,
    freshness: classifyFreshness(lastFetchMs, Date.now()),
    error: lastFetchMs === null ? lastError : undefined
  };
}

function rerender(): void {
  render(root, buildViewModel());
}

async function tick(): Promise<void> {
  try {
    const arrivals = await fetchArrivals(WALTHAMSTOW_CENTRAL_STOPPOINT_ID);
    lastEvents = pickNextPerDirection(arrivals);
    lastFetchMs = Date.now();
    lastError = undefined;
  } catch (err) {
    lastError = err instanceof Error ? err.message : 'Network error — check connection';
  }
  rerender();
}

// Re-render every second so countdowns tick down and the "updated Xs ago" label advances,
// independent of the 20s poll interval.
setInterval(rerender, 1000);

startPoller(tick, POLL_INTERVAL_MS);
