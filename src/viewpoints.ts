import type { Stop, Segment } from './stops';
import { STOPS as CHINGFORD_STOPS } from './stops';

// Direction-naming convention (see implementation plan for rationale):
//   'north' = TfL outbound = left-to-right on the strip (toward the higher-index terminus)
//   'south' = TfL inbound  = right-to-left on the strip (toward the lower-index terminus)
// These are opaque labels — they do NOT need to align with geographic north/south.

export type LineId = 'weaver' | 'suffragette';

export interface ViewpointDirection {
  /** Short label above the countdown — e.g. '→ Chingford', '← Walthamstow Central'. */
  label: string;
  /** TfL's direction code — used by classifyDirection to map arrivals to 'north'/'south'. */
  tflDirection: 'outbound' | 'inbound';
  /** Plain-English terminus name for aria-labels + fallback destination parsing. */
  terminusName: string;
  /** Seconds added to arrival.timeToStation to produce bridgeTimeSeconds.
   *  +ve = train passes the viewpoint AFTER arriving at the station (northbound bridge).
   *  -ve = train passes BEFORE arriving (southbound bridge).
   *   0  = station viewpoint (no offset — the viewpoint IS the station). */
  offsetSeconds: number;
}

/** How trainPosition estimates the train's strip position around the anchor station.
 *  'east-ave-bridge' = three-phase northbound (dwell at WC → cross bridge → continue to WDS),
 *                      southbound park for 30s after arrival. Specific to East Ave.
 *  'station'         = simple park at anchor index for 30s after arrival both directions.
 *                      Suitable for viewpoints where the station IS the viewpoint. */
export type PositionModel = 'east-ave-bridge' | 'station';

export interface Viewpoint {
  /** Stable slug — used as localStorage key + in the switcher. */
  id: string;
  /** Short display label for the switcher — 'East Ave bridge', 'Queens Road'. */
  name: string;
  /** Longer copy for screen readers + the switcher sheet subtitle. */
  description: string;
  /** TfL line id — used to filter arrivals from the StopPoint API response. */
  lineId: LineId;
  /** Display line name — 'Weaver', 'Suffragette'. */
  lineName: string;
  /** CSS colour (OKLCH) for the header + train livery. */
  lineColor: string;
  /** TfL NaPTAN StopPoint — what the arrivals API is polled against. */
  stopPointId: string;
  /** Physical location of the viewpoint — used by the walking-time feature. */
  coords: { lat: number; lng: number };
  /** Ordered list of stops on the relevant branch (inbound terminus first, outbound last). */
  stops: readonly Stop[];
  /** Inter-stop travel times — `segments[i]` is the time between stops[i] and stops[i+1]. */
  segments: readonly Segment[];
  /** Which stop in `stops` IS (or is closest to) the viewpoint — used by trainPosition. */
  anchorIndex: number;
  /** Position model tag — 'east-ave-bridge' or 'station'. Picked by trainPosition. */
  positionModel: PositionModel;
  /** Per-direction config. */
  directions: {
    north: ViewpointDirection;
    south: ViewpointDirection;
  };
}

// ─── Chingford branch (Weaver) segments, keyed to CHINGFORD_STOPS ordering ───
// Segment[i] connects stops[i] ↔ stops[i+1]. Derived from the existing
// SEGMENTS_NORTH_OF_WC + SEGMENTS_SOUTH_OF_WC data in stops.ts (same numbers,
// just in a contiguous list).
const CHINGFORD_SEGMENTS: readonly Segment[] = [
  { nearIndex: 0, farIndex: 1, seconds: 120 }, // Liv ↔ Bth
  { nearIndex: 1, farIndex: 2, seconds: 180 }, // Bth ↔ Hck
  { nearIndex: 2, farIndex: 3, seconds: 120 }, // Hck ↔ Clp
  { nearIndex: 3, farIndex: 4, seconds: 180 }, // Clp ↔ StJ
  { nearIndex: 4, farIndex: 5, seconds: 120 }, // StJ ↔ WC
  { nearIndex: 5, farIndex: 6, seconds: 120 }, // WC ↔ Wds
  { nearIndex: 6, farIndex: 7, seconds: 120 }, // Wds ↔ Hig
  { nearIndex: 7, farIndex: 8, seconds: 180 }, // Hig ↔ Chg
];

// ─── Suffragette line stops (Gospel Oak → Barking Riverside) ───
// Ordered inbound terminus (GOk, left of strip) → outbound terminus (BkR, right of strip).
// North-direction trains on our app = left-to-right = toward Barking Riverside.
const SUFFRAGETTE_STOPS: readonly Stop[] = [
  { index: 0, fullName: 'Gospel Oak', abbrev: 'GOk' },
  { index: 1, fullName: 'Upper Holloway', abbrev: 'UHo' },
  { index: 2, fullName: 'Crouch Hill', abbrev: 'CrH' },
  { index: 3, fullName: 'Harringay Green Lanes', abbrev: 'HGL' },
  { index: 4, fullName: 'South Tottenham', abbrev: 'STm' },
  { index: 5, fullName: 'Blackhorse Road', abbrev: 'BHR' },
  { index: 6, fullName: 'Walthamstow Queens Road', abbrev: 'WQR' },
  { index: 7, fullName: 'Leyton Midland Road', abbrev: 'LMR' },
  { index: 8, fullName: 'Leytonstone High Road', abbrev: 'LHR' },
  { index: 9, fullName: 'Wanstead Park', abbrev: 'WPk' },
  { index: 10, fullName: 'Woodgrange Park', abbrev: 'WGP' },
  { index: 11, fullName: 'Barking', abbrev: 'Bkg' },
  { index: 12, fullName: 'Barking Riverside', abbrev: 'BkR' },
];

// Approximate inter-stop travel times from TfL's timetable.
// Exact numbers aren't critical — this drives the cartoon-train animation only.
const SUFFRAGETTE_SEGMENTS: readonly Segment[] = [
  { nearIndex: 0, farIndex: 1, seconds: 180 }, // GOk ↔ UHo
  { nearIndex: 1, farIndex: 2, seconds: 120 }, // UHo ↔ CrH
  { nearIndex: 2, farIndex: 3, seconds: 180 }, // CrH ↔ HGL
  { nearIndex: 3, farIndex: 4, seconds: 180 }, // HGL ↔ STm
  { nearIndex: 4, farIndex: 5, seconds: 240 }, // STm ↔ BHR
  { nearIndex: 5, farIndex: 6, seconds: 180 }, // BHR ↔ WQR
  { nearIndex: 6, farIndex: 7, seconds: 180 }, // WQR ↔ LMR
  { nearIndex: 7, farIndex: 8, seconds: 120 }, // LMR ↔ LHR
  { nearIndex: 8, farIndex: 9, seconds: 240 }, // LHR ↔ WPk
  { nearIndex: 9, farIndex: 10, seconds: 180 }, // WPk ↔ WGP
  { nearIndex: 10, farIndex: 11, seconds: 300 }, // WGP ↔ Bkg
  { nearIndex: 11, farIndex: 12, seconds: 240 }, // Bkg ↔ BkR
];

// Line colours sourced from TfL's November 2024 Overground rebrand palette.
// OKLCH values tuned to look right on the app's cream background in daylight.
const WEAVER_BURGUNDY = 'oklch(35% 0.12 10)';
const SUFFRAGETTE_GREEN = 'oklch(55% 0.15 155)';

export const VIEWPOINTS: readonly Viewpoint[] = [
  {
    id: 'east-ave',
    name: 'East Ave bridge',
    description: 'The road bridge over the Weaver line on East Avenue, Walthamstow',
    lineId: 'weaver',
    lineName: 'Weaver',
    lineColor: WEAVER_BURGUNDY,
    stopPointId: '910GWLTWCEN',
    coords: { lat: 51.583486, lng: -0.014564 },
    stops: CHINGFORD_STOPS,
    segments: CHINGFORD_SEGMENTS,
    anchorIndex: 5, // Walthamstow Central
    positionModel: 'east-ave-bridge',
    directions: {
      north: {
        label: '→ Chingford',
        tflDirection: 'outbound',
        terminusName: 'Chingford',
        offsetSeconds: 90, // dwell at WC + cross bridge
      },
      south: {
        label: '← Walthamstow Central',
        tflDirection: 'inbound',
        terminusName: 'Liverpool Street',
        offsetSeconds: -20, // crosses bridge 20s before reaching WC
      },
    },
  },
  {
    id: 'queens-road',
    name: 'Queens Road',
    description: 'Walthamstow Queens Road station, platform view',
    lineId: 'suffragette',
    lineName: 'Suffragette',
    lineColor: SUFFRAGETTE_GREEN,
    stopPointId: '910GWLTHQRD', // VERIFY during implementation via TfL /StopPoint/Search
    coords: { lat: 51.581539, lng: -0.023774 },
    stops: SUFFRAGETTE_STOPS,
    segments: SUFFRAGETTE_SEGMENTS,
    anchorIndex: 6, // Walthamstow Queens Road
    positionModel: 'station',
    directions: {
      north: {
        label: '→ Barking Riverside',
        tflDirection: 'outbound',
        terminusName: 'Barking Riverside',
        offsetSeconds: 0,
      },
      south: {
        label: '← Gospel Oak',
        tflDirection: 'inbound',
        terminusName: 'Gospel Oak',
        offsetSeconds: 0,
      },
    },
  },
];

export const DEFAULT_VIEWPOINT_ID = 'east-ave';

export function getViewpointById(id: string): Viewpoint | undefined {
  return VIEWPOINTS.find((v) => v.id === id);
}
