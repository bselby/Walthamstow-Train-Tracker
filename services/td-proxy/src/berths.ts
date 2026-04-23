import type { BerthEvent, RawCAMsg } from './types.js';

interface WatchedBerth {
  td: string;
  from: string;
  to: string;
  station: string;
  event: BerthEvent['event'];
  offsetSeconds: number;
}

// Q4 berths for the Chingford branch (Weaver line), derived from SMART data.
// Berth offset signs: negative = step fires BEFORE actual departure/arrival.
const WATCHED: WatchedBerth[] = [
  // ── Walthamstow Central ────────────────────────────────────────────────────
  { td: 'Q4', from: '1415', to: '1419', station: 'WALTHMSWC', event: 'depart-north', offsetSeconds: -11 },
  { td: 'Q4', from: '1418', to: '1414', station: 'WALTHMSWC', event: 'arrive-south', offsetSeconds: 43 },
  { td: 'Q4', from: '1414', to: '1412', station: 'WALTHMSWC', event: 'depart-south', offsetSeconds: -12 },
  { td: 'Q4', from: '1413', to: '1415', station: 'WALTHMSWC', event: 'arrive-north', offsetSeconds: 44 },

  // ── Wood Street ───────────────────────────────────────────────────────────
  { td: 'Q4', from: '1419', to: '1421', station: 'WOOD ST',   event: 'arrive-north', offsetSeconds: 36  },
  { td: 'Q4', from: '1421', to: '1423', station: 'WOOD ST',   event: 'depart-north', offsetSeconds: -13 },
  { td: 'Q4', from: '1424', to: '1422', station: 'WOOD ST',   event: 'arrive-south', offsetSeconds: 25  },
  { td: 'Q4', from: '1422', to: '1420', station: 'WOOD ST',   event: 'depart-south', offsetSeconds: -25 },

  // ── Highams Park ──────────────────────────────────────────────────────────
  { td: 'Q4', from: '1427', to: '1429', station: 'HIGHAMSPK', event: 'arrive-north', offsetSeconds: 40  },
  { td: 'Q4', from: '1429', to: '1431', station: 'HIGHAMSPK', event: 'depart-north', offsetSeconds: -34 },
  { td: 'Q4', from: '1434', to: '1432', station: 'HIGHAMSPK', event: 'arrive-south', offsetSeconds: 43  },
  { td: 'Q4', from: '1432', to: '1430', station: 'HIGHAMSPK', event: 'depart-south', offsetSeconds: -12 },

  // ── St James Street ───────────────────────────────────────────────────────
  { td: 'Q4', from: '1411', to: '1413', station: 'STJAMESST', event: 'arrive-north', offsetSeconds: 47  },
  { td: 'Q4', from: '1413', to: '1415', station: 'STJAMESST', event: 'depart-north', offsetSeconds: -33 },
  { td: 'Q4', from: '1412', to: '1410', station: 'STJAMESST', event: 'arrive-south', offsetSeconds: 28  },
  { td: 'Q4', from: '1410', to: '1408', station: 'STJAMESST', event: 'depart-south', offsetSeconds: -25 },
];

// Build a lookup map: "TD:from:to" → WatchedBerth for O(1) matching
const LOOKUP = new Map<string, WatchedBerth>(
  WATCHED.map((b) => [`${b.td}:${b.from}:${b.to}`, b])
);

export function matchBerth(msg: RawCAMsg): BerthEvent | null {
  const key = `${msg.area_id}:${msg.from}:${msg.to}`;
  const berth = LOOKUP.get(key);
  if (!berth) return null;

  return {
    td: msg.area_id,
    fromBerth: msg.from,
    toBerth: msg.to,
    trainId: msg.descr,
    timestamp: parseInt(msg.time, 10),
    station: berth.station,
    event: berth.event,
    offsetSeconds: berth.offsetSeconds,
  };
}
