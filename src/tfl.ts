import { TFL_ARRIVALS_URL } from './constants';

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
