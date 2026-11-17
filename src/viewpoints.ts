import type { BerthStep } from './berthEta';
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
  /** Signalling berth steps that place a train a known time from the
   *  viewpoint. When one fires, its ETA replaces the TfL-prediction countdown.
   *  List them in the order a train meets them; a later step supersedes an
   *  earlier one. */
  berthSteps?: readonly BerthStep[];
}

/** How trainPosition estimates the train's strip position around the anchor station.
 *  'east-ave-bridge' = three-phase northbound (dwell at WC → cross bridge → continue to WDS),
 *                      southbound park for 30s after arrival. Specific to East Ave.
 *  'station'         = simple park at anchor index for 30s after arrival both directions.
 *                      Suitable for viewpoints where the station IS the viewpoint. */
export type PositionModel = 'east-ave-bridge' | 'station';

export interface Viewpoint {
  /** Stable internal id — used as a localStorage key and to key tap records
   *  on the server. Never changes, and is not the URL slug. */
  id: string;
  /** Hand-chosen locality, the first part of the viewpoint's URL: 'walthamstow'. */
  place: string;
  /** Second part of the URL: `/<place>/<slug>`. Permanent once published. */
  slug: string;
  /** Short display label for the switcher — 'East Avenue Bridge', 'Queens Road Station'. */
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
  /** Count down to TfL's expected arrival time instead of its aged
   *  timeToStation figure. Set only where the direction offsets were tuned
   *  against expected arrival; see tflTiming.ts. */
  timeFromExpectedArrival?: boolean;
  /** Realtime Trains station CRS (3-char code). When set, the freight proxy
   *  polls /rtt/location?code=gb-nr:<this> alongside TfL passenger arrivals
   *  and merges any inPassengerService=false rows in. Undefined → no freight
   *  poll, e.g. East Ave (Chingford branch is passenger-only). */
  freightStationCode?: string;
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

/** Everything about a line that every viewpoint on it shares. */
export const LINES: Record<LineId, {
  name: string;
  color: string;
  stops: readonly Stop[];
  segments: readonly Segment[];
}> = {
  weaver: { name: 'Weaver', color: WEAVER_BURGUNDY, stops: CHINGFORD_STOPS, segments: CHINGFORD_SEGMENTS },
  suffragette: { name: 'Suffragette', color: SUFFRAGETTE_GREEN, stops: SUFFRAGETTE_STOPS, segments: SUFFRAGETTE_SEGMENTS },
};

/** What is written by hand for one viewpoint. Line name, colour, stops and
 *  inter-stop timings come from LINES. */
export interface ViewpointRecord {
  id: string;
  place: string;
  slug: string;
  name: string;
  description: string;
  coords: { lat: number; lng: number };
  line: LineId;
  stopPointId: string;
  /** Full name of the stop on that line the viewpoint is at or nearest to. */
  anchorStop: string;
  directions: { north: ViewpointDirection; south: ViewpointDirection };
  /** Defaults to 'station'. */
  positionModel?: PositionModel;
  timeFromExpectedArrival?: boolean;
  freightStationCode?: string;
}

export function defineViewpoint(record: ViewpointRecord): Viewpoint {
  const { line: lineId, anchorStop, positionModel, ...rest } = record;
  const line = LINES[lineId];
  const anchorIndex = line.stops.findIndex((s) => s.fullName === anchorStop);
  if (anchorIndex === -1) {
    throw new Error(`Viewpoint ${record.id}: "${anchorStop}" is not a stop on the ${line.name} line`);
  }
  return {
    ...rest,
    lineId,
    lineName: line.name,
    lineColor: line.color,
    stops: line.stops,
    segments: line.segments,
    anchorIndex,
    positionModel: positionModel ?? 'station',
  };
}

export const VIEWPOINTS: readonly Viewpoint[] = [
  defineViewpoint({
    id: 'east-ave',
    place: 'walthamstow',
    slug: 'east-avenue-bridge',
    name: 'East Avenue Bridge',
    description: 'The road bridge over the Weaver line on East Avenue, Walthamstow',
    line: 'weaver',
    stopPointId: '910GWLTWCEN',
    coords: { lat: 51.583486, lng: -0.014564 },
    anchorStop: 'Walthamstow Central',
    positionModel: 'east-ave-bridge',
    timeFromExpectedArrival: true,
    directions: {
      north: {
        label: '→ Chingford',
        tflDirection: 'outbound',
        terminusName: 'Chingford',
        // Bridge time minus TfL's expected arrival at WC, measured against
        // signalled movements on 2026-11-17: 124-146 s over four trains.
        // (TfL's northbound expected arrival runs about a minute ahead of the
        // train actually stopping.) The berth step refines the last 22 s.
        offsetSeconds: 142,
        // Step 1415→1419 = the train passing the Walthamstow Central starter
        // signal, about 11 s after it starts moving. The bridge is ~390 m on.
        // 22 s is worked out from distance and the measured run to Wood Street
        // (recording of 2026-11-17); it has not been checked at the bridge.
        berthSteps: [{ fromBerth: '1415', toBerth: '1419', secondsToViewpoint: 22 }],
      },
      south: {
        label: '← Walthamstow Central',
        tflDirection: 'inbound',
        terminusName: 'Liverpool Street',
        // Same measurement southbound: -33 to +4 s over four trains.
        offsetSeconds: -22,
        // Step 1422→1420 = leaving Wood Street: an early heads-up, ~48 s out.
        // Step 1418→1414 = the signal on the approach to Walthamstow Central,
        // which sits just before the bridge: ~5 s out. Both worked out from
        // distance and measured running times (recording of 2026-11-17); not
        // yet checked at the bridge.
        berthSteps: [
          { fromBerth: '1422', toBerth: '1420', secondsToViewpoint: 48 },
          { fromBerth: '1418', toBerth: '1414', secondsToViewpoint: 5 },
        ],
      },
    },
  }),
  defineViewpoint({
    id: 'queens-road',
    place: 'walthamstow',
    slug: 'queens-road-station',
    name: 'Queens Road Station',
    description: 'Walthamstow Queens Road station, platform view',
    line: 'suffragette',
    stopPointId: '910GWLTHQRD',
    coords: { lat: 51.581539, lng: -0.023774 },
    anchorStop: 'Walthamstow Queens Road',
    // CRS confirmed against the live rtt.io capture in tests/fixtures —
    // query.location.shortCodes is ['WMW'] for Walthamstow Queens Road.
    freightStationCode: 'WMW',
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
  }),
  defineViewpoint({
    id: 'northcote-rd',
    place: 'walthamstow',
    slug: 'northcote-road-bridge',
    name: 'Northcote Road Bridge',
    description: 'The road bridge over the Suffragette line on Northcote Road, Walthamstow',
    line: 'suffragette',
    stopPointId: '910GWLTHQRD',
    coords: { lat: 51.5850951, lng: -0.0310174 },
    anchorStop: 'Walthamstow Queens Road',
    // Same physical track as Queens Road, ~634m down the line — every freight
    // movement past WMW also passes under this bridge ±87s later. The freight
    // DTO's timeToStation is "seconds until the train passes WMW", and
    // computeBridgeTime applies the directions.*.offsetSeconds below identically
    // for passenger and freight, so the same ±87s shift maps it onto the bridge.
    freightStationCode: 'WMW',
    directions: {
      north: {
        label: '→ Barking Riverside',
        tflDirection: 'outbound',
        terminusName: 'Barking Riverside',
        // Bridge is ~718m from BHR, ~634m from WQR (55% of BHR→WQR from the BHR side).
        // Train passes the bridge ~87s before arriving at WQR.
        offsetSeconds: -87,
        // Step ST21→ST23 = leaving Blackhorse Road. 36 s is from
        // scripts/calibrate (bridge 785 m along a 1416 m, 112 s run); not yet
        // checked against a train at the bridge.
        berthSteps: [{ fromBerth: 'ST21', toBerth: 'ST23', secondsToViewpoint: 36 }],
      },
      south: {
        label: '← Gospel Oak',
        tflDirection: 'inbound',
        terminusName: 'Gospel Oak',
        // Train departs WQR and passes the bridge ~87s later.
        offsetSeconds: 87,
        // Step ST22→ST20 = leaving Queens Road. 21 s is from scripts/calibrate
        // (bridge 631 m along a 1416 m, 108 s run); not yet checked at the bridge.
        berthSteps: [{ fromBerth: 'ST22', toBerth: 'ST20', secondsToViewpoint: 21 }],
      },
    },
  }),
];

export const DEFAULT_VIEWPOINT_ID = 'east-ave';

export function getViewpointById(id: string): Viewpoint | undefined {
  return VIEWPOINTS.find((v) => v.id === id);
}

export function getViewpointBySlug(place: string, slug: string): Viewpoint | undefined {
  return VIEWPOINTS.find((v) => v.place === place && v.slug === slug);
}
