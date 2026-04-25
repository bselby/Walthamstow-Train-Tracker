import { TFL_ARRIVALS_URL } from './constants';

export type ServiceCategory = 'passenger' | 'freight';

export interface Arrival {
  id: string;
  stationName: string;
  lineId: string;
  destinationName: string;
  timeToStation: number; // seconds until arrival at the station
  expectedArrival: string; // ISO 8601
  modeName: string;
  platformName: string;
  /** TfL's authoritative travel direction — "outbound" = towards Chingford (northbound
   *  past our bridge), "inbound" = towards Liverpool Street (southbound past our bridge).
   *  Preferred over parsing destinationName because destinations change during
   *  engineering works (shuttles to Wood Street or Highams Park don't contain
   *  "Chingford" but are still northbound). */
  direction?: string;
  /** Stable identifier for the physical train. TfL reuses `id` (the prediction
   *  row's key) across polls, but a new prediction for the same vehicle yields a
   *  fresh `id` — so only `vehicleId` lets us detect whether the hero is still
   *  the same train when scoring stability. */
  vehicleId?: string;
  /** Category of service. Undefined → passenger (all TfL rows). The freight
   *  proxy populates this as 'freight' for rtt.io rows where
   *  scheduleMetadata.inPassengerService === false. */
  category?: ServiceCategory;
  /** ATOC operator code (two letters). Freight only — set from the rtt.io
   *  scheduleMetadata.operator.code. Used as a defence-in-depth check
   *  alongside category, and to render the operator chip on the freight hero. */
  operatorCode?: string;
  /** Four-character headcode (e.g. '6M23'). Freight only and not always
   *  present — /rtt/location?code=… does not return headcode in the default
   *  response, so this stays undefined unless the proxy hits /rtt/service. */
  headcode?: string;
  /** Free-text origin location — yard or depot for freight, terminus for
   *  passenger. TfL passenger rows leave this undefined; the freight proxy
   *  populates it from the rtt.io top-level origin[0].location.description.
   *  Rendered as part of the hero's 'origin → destination' subtitle when
   *  the hero is a freight row. */
  origin?: string;
}

export async function fetchArrivals(stopPointId: string, lineId: string): Promise<Arrival[]> {
  const response = await fetch(TFL_ARRIVALS_URL(stopPointId));
  if (!response.ok) {
    throw new Error(`TfL API error: ${response.status}`);
  }
  const data = (await response.json()) as Arrival[];
  // The /Arrivals endpoint returns predictions across every line that serves
  // the stop (Weaver + Suffragette at shared interchanges, plus any bus / tube
  // modes that share a NaPTAN). We only want the active viewpoint's line.
  return data.filter((a) => a.lineId === lineId);
}
