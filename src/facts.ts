/**
 * Curated, verified trivia about the Weaver line, the Chingford branch, the
 * trains running underneath East Avenue bridge, and the local area. Every fact
 * must be verifiable against a public source before being added.
 *
 * Hard cap: 25. If you want to add a 26th, one has to leave.
 *
 * `category` picks which small icon prefixes the fact in the UI — it turns the
 * ticker into something that visibly cycles through different subjects
 * (line → station → train → local) rather than a single grey line of text.
 */
export type FactCategory = 'line' | 'station' | 'train' | 'local' | 'default';

export interface Fact {
  text: string;
  category: FactCategory;
}

export const FACTS: readonly Fact[] = [
  // The line itself
  { text: 'Chingford branch opened 24 April 1870', category: 'line' },
  { text: 'Built by Great Eastern Railway', category: 'line' },
  { text: 'Electrified November 1960', category: 'line' },
  { text: 'Upgraded to 25 kV in 1983', category: 'line' },
  { text: 'Renamed "Weaver line" in February 2024', category: 'line' },
  { text: 'Named after East End textile workers', category: 'line' },
  // Stations on the branch
  { text: 'Walthamstow Central was called Hoe Street', category: 'station' },
  { text: 'Renamed to Walthamstow Central in 1968', category: 'station' },
  { text: 'Wood Street station opened in 1873', category: 'station' },
  { text: 'Wood Street was almost the Victoria terminus', category: 'station' },
  { text: 'Highams Park was originally "Hale End"', category: 'station' },
  { text: 'Highams Park was renamed in 1894', category: 'station' },
  { text: 'Chingford station rebuilt in 1878', category: 'station' },
  { text: 'Chingford is the end of the line', category: 'station' },
  { text: 'Queen Victoria visited Chingford in 1882', category: 'station' },
  // The trains
  { text: 'Class 710 Aventra — built in Derby', category: 'train' },
  { text: 'Class 710 trains built 2017–2020', category: 'train' },
  { text: 'Class 710 top speed: 75 mph', category: 'train' },
  { text: 'Class 710 four-car trains are 83 m long', category: 'train' },
  // Walthamstow local
  { text: 'William Morris was born in Walthamstow', category: 'local' },
  { text: 'William Morris: textile designer and poet', category: 'local' },
  { text: "Walthamstow Market is Europe's longest", category: 'local' },
  { text: 'Morris Gallery is at Lloyd Park', category: 'local' },
];

/** Pull the fact at `index`, wrapping past either end so a persisted counter
 *  can keep incrementing forever without overflow concerns. */
export function factAt(index: number): Fact {
  const n = FACTS.length;
  return FACTS[((index % n) + n) % n];
}
