/**
 * Curated, verified trivia about the Weaver line, the Chingford branch, the
 * trains running underneath East Avenue bridge, and the local area. Every fact
 * must be verifiable against a public source before being added.
 *
 * Hard cap: 25. If you want to add a 26th, one has to leave.
 */
export const FACTS: readonly string[] = [
  // The line itself
  'Chingford branch opened 24 April 1870',
  'Built by Great Eastern Railway',
  'Electrified November 1960',
  'Upgraded to 25 kV in 1983',
  'Renamed "Weaver line" in February 2024',
  'Named after East End textile workers',
  // Stations on the branch
  'Walthamstow Central was called Hoe Street',
  'Renamed to Walthamstow Central in 1968',
  'Wood Street station opened in 1873',
  'Wood Street was almost the Victoria terminus',
  'Highams Park was originally "Hale End"',
  'Highams Park was renamed in 1894',
  'Chingford station rebuilt in 1878',
  'Chingford is the end of the line',
  'Queen Victoria visited Chingford in 1882',
  // The trains
  'Class 710 Aventra — built in Derby',
  'Class 710 trains built 2017–2020',
  'Class 710 top speed: 75 mph',
  'Class 710 four-car trains are 83 m long',
  // Walthamstow local
  'William Morris was born in Walthamstow',
  'William Morris: textile designer and poet',
  "Walthamstow Market is Europe's longest",
  'Morris Gallery is at Lloyd Park',
];

/** Pull the fact at `index`, wrapping past either end so a persisted counter
 *  can keep incrementing forever without overflow concerns. */
export function factAt(index: number): string {
  const n = FACTS.length;
  return FACTS[((index % n) + n) % n];
}
