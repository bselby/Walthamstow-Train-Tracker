export type Region =
  | 'Scotland'
  | 'Wales'
  | 'The North'
  | 'Midlands'
  | 'West Country'
  | 'East Anglia'
  | 'Kent'
  | 'Thames Estuary'
  | 'Home'
  | 'Elsewhere';

// Ordered keyword → region map. First matching keyword wins, so put more-specific
// names first (e.g. 'basford hall' before 'crewe'). Case-insensitive substring match.
const REGION_KEYWORDS: ReadonlyArray<readonly [string, Region]> = [
  // Scotland
  ['mossend', 'Scotland'],
  ['coatbridge', 'Scotland'],
  ['grangemouth', 'Scotland'],
  ['aberdeen', 'Scotland'],
  ['inverness', 'Scotland'],
  ['millerhill', 'Scotland'],
  ['valleyfield', 'Scotland'],
  // Wales
  ['cardiff', 'Wales'],
  ['swansea', 'Wales'],
  ['margam', 'Wales'],
  ['pontypool', 'Wales'],
  ['wentlooge', 'Wales'],
  // West Country
  ['merehead', 'West Country'],
  ['whatley', 'West Country'],
  ['exeter', 'West Country'],
  ['plymouth', 'West Country'],
  ['fawley', 'West Country'],
  ['bristol', 'West Country'],
  ['westbury', 'West Country'],
  // Thames Estuary
  ['tilbury', 'Thames Estuary'],
  ['london gateway', 'Thames Estuary'],
  ['shell haven', 'Thames Estuary'],
  ['thamesport', 'Thames Estuary'],
  ['isle of grain', 'Thames Estuary'],
  ['purfleet', 'Thames Estuary'],
  // East Anglia
  ['felixstowe', 'East Anglia'],
  ['ipswich', 'East Anglia'],
  ['harwich', 'East Anglia'],
  ['whitemoor', 'East Anglia'],
  ['peterborough', 'East Anglia'],
  ['ely', 'East Anglia'],
  ['parkeston', 'East Anglia'],
  // Kent (Channel Tunnel region)
  ['dollands moor', 'Kent'],
  ['hoo junction', 'Kent'],
  ['dover', 'Kent'],
  ['folkestone', 'Kent'],
  ['ashford', 'Kent'],
  ['ramsgate', 'Kent'],
  // The North — NE / Yorkshire / NW. Specific yard names before host city
  // names so 'Crewe Basford Hall' resolves via 'basford hall' rather than
  // generic 'crewe' (both map to The North today, but the specificity hedges
  // against future region splits).
  ['basford hall', 'The North'],
  ['crewe', 'The North'],
  ['arpley', 'The North'],
  ['trafford park', 'The North'],
  ['manchester', 'The North'],
  ['liverpool', 'The North'],
  ['carlisle', 'The North'],
  ['leeds', 'The North'],
  ['doncaster', 'The North'],
  ['immingham', 'The North'],
  ['hull', 'The North'],
  ['knottingley', 'The North'],
  ['drax', 'The North'],
  ['ferrybridge', 'The North'],
  ['newcastle', 'The North'],
  ['tyne', 'The North'],
  ['tees', 'The North'],
  ['middlesbrough', 'The North'],
  ['boulby', 'The North'],
  // Midlands
  ['daventry', 'Midlands'],
  ['bescot', 'Midlands'],
  ['walsall', 'Midlands'],
  ['lawley street', 'Midlands'],
  ['landor street', 'Midlands'],
  ['leicester', 'Midlands'],
  ['derby', 'Midlands'],
  ['mountsorrel', 'Midlands'],
  ['birmingham', 'Midlands'],
  // Home — London + immediate surrounds (Willesden, Wembley, Stratford, etc.)
  ['willesden', 'Home'],
  ['wembley', 'Home'],
  ['stratford', 'Home'],
  ['temple mills', 'Home'],
  ['acton', 'Home'],
  ['cricklewood', 'Home'],
  ['bow', 'Home'],
  ['west hampstead', 'Home'],
];

export function regionFor(yardName: string): Region {
  const n = (yardName ?? '').trim().toLowerCase();
  if (!n) return 'Elsewhere';
  for (const [keyword, region] of REGION_KEYWORDS) {
    if (n.includes(keyword)) return region;
  }
  return 'Elsewhere';
}

// ── Session novelty tracking ──────────────────────────────────────
// A chip shimmers the first time a region appears in a session. Persisted to
// sessionStorage (not localStorage) so each new session gets fresh delight.

const STORAGE_KEY = 'wtt_seen_freight_regions';
const NON_SHIMMER_REGIONS = new Set<Region>(['Home', 'Elsewhere']);

let memoFallback: Set<Region> | null = null;

function loadSeen(): Set<Region> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as Region[]);
    return new Set();
  } catch {
    memoFallback ??= new Set();
    return memoFallback;
  }
}

function saveSeen(seen: Set<Region>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    memoFallback = seen;
  }
}

export function isNewRegionThisSession(region: Region): boolean {
  if (NON_SHIMMER_REGIONS.has(region)) return false;
  const seen = loadSeen();
  if (seen.has(region)) return false;
  seen.add(region);
  saveSeen(seen);
  return true;
}

// Test-only — reset in-memory + session memo.
export function __resetRegionMemoForTests(): void {
  memoFallback = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // intentionally swallowed
  }
}
