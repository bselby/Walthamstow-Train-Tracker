export interface Stop {
  index: number;
  fullName: string;
  abbrev: string;
}

export interface Segment {
  nearIndex: number;
  farIndex: number;
  seconds: number;
}

export const STOPS: readonly Stop[] = [
  { index: 0, fullName: 'Liverpool Street', abbrev: 'Liv' },
  { index: 1, fullName: 'Bethnal Green', abbrev: 'Bth' },
  { index: 2, fullName: 'Hackney Downs', abbrev: 'Hck' },
  { index: 3, fullName: 'Clapton', abbrev: 'Clp' },
  { index: 4, fullName: 'St James Street', abbrev: 'StJ' },
  { index: 5, fullName: 'Walthamstow Central', abbrev: 'WC' },
  { index: 6, fullName: 'Wood Street', abbrev: 'Wds' },
  { index: 7, fullName: 'Highams Park', abbrev: 'Hig' },
  { index: 8, fullName: 'Chingford', abbrev: 'Chg' },
];

export const WC_INDEX = 5;

// Segments from WC going north — used for southbound trains (which approach WC from the north).
export const SEGMENTS_NORTH_OF_WC: readonly Segment[] = [
  { nearIndex: 5, farIndex: 6, seconds: 120 }, // WC ↔ Wds
  { nearIndex: 6, farIndex: 7, seconds: 120 }, // Wds ↔ Hig
  { nearIndex: 7, farIndex: 8, seconds: 180 }, // Hig ↔ Chg
];

// Segments from WC going south — used for northbound trains (which approach WC from the south).
export const SEGMENTS_SOUTH_OF_WC: readonly Segment[] = [
  { nearIndex: 5, farIndex: 4, seconds: 120 }, // WC ↔ StJ
  { nearIndex: 4, farIndex: 3, seconds: 180 }, // StJ ↔ Clp
  { nearIndex: 3, farIndex: 2, seconds: 120 }, // Clp ↔ Hck
  { nearIndex: 2, farIndex: 1, seconds: 180 }, // Hck ↔ Bth
  { nearIndex: 1, farIndex: 0, seconds: 120 }, // Bth ↔ Liv
];

export function getStop(index: number): Stop | undefined {
  if (!Number.isInteger(index)) return undefined;
  return STOPS[index];
}
