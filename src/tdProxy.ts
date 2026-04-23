const PROXY_URL = 'https://e17trains-td-proxy.fly.dev';

export interface BerthEvent {
  td: string;
  fromBerth: string;
  toBerth: string;
  trainId: string;
  /** Unix ms timestamp from the TD message */
  timestamp: number;
  station: string;
  event: 'depart-north' | 'depart-south' | 'arrive-north' | 'arrive-south';
  /** Seconds from step firing to actual physical event (negative = fires before) */
  offsetSeconds: number;
}

export type BerthCallback = (event: BerthEvent) => void;

/** How long a berth-based ETA remains valid before we fall back to TfL timing. */
export const BERTH_ETA_TTL_MS = 3 * 60 * 1000;

const callbacks = new Set<BerthCallback>();
let source: EventSource | null = null;

export function subscribeBerthEvents(cb: BerthCallback): () => void {
  callbacks.add(cb);
  ensureConnected();
  return () => { callbacks.delete(cb); };
}

function ensureConnected(): void {
  if (source && source.readyState !== EventSource.CLOSED) return;
  source = new EventSource(`${PROXY_URL}/events`);
  source.onmessage = (e: MessageEvent) => {
    let data: unknown;
    try { data = JSON.parse(e.data as string); } catch { return; }
    if (typeof data !== 'object' || data === null) return;
    if ((data as Record<string, unknown>)['type'] === 'connected') return;
    for (const cb of callbacks) cb(data as BerthEvent);
  };
  // EventSource reconnects automatically on error — no extra handling needed
}
