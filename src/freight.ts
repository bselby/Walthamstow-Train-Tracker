import type { Arrival } from './tfl';
import type { Viewpoint } from './viewpoints';

/** Live timeToStation threshold (seconds) beyond which we hide the freight
 *  strip glyph but keep the countdown + ticker. estimatePosition uses
 *  passenger-speed segment timings; freight runs at different speeds and may
 *  not even be on our modelled stops yet beyond ~5 min, so a best-effort
 *  position would be dishonest. */
export const FREIGHT_STRIP_MAX_TTS_SECONDS = 300;

export function clampFreightPosition(
  pos: number | null,
  liveTtsSeconds: number,
  isFreight: boolean,
): number | null {
  if (isFreight && liveTtsSeconds > FREIGHT_STRIP_MAX_TTS_SECONDS) return null;
  return pos;
}

const FREIGHT_HEADCODE_FIRST_CHARS = new Set(['0', '4', '5', '6', '7', '8']);

export function isFreightByHeadcode(headcode: string | undefined): boolean {
  if (!headcode || headcode.length < 1) return false;
  return FREIGHT_HEADCODE_FIRST_CHARS.has(headcode[0]);
}

export interface FreightArrivalDTO {
  id: string;
  headcode: string;
  operatorCode: string;
  operatorName: string;
  origin: string;
  destination: string;
  timeToStation: number;
  expectedPass: string;
  direction: 'outbound' | 'inbound';
  category: 'freight';
}

export interface FreightResponse {
  arrivals: FreightArrivalDTO[];
  fetchedAt: string;
}

function hasRequiredFields(dto: Partial<FreightArrivalDTO>): dto is FreightArrivalDTO {
  return typeof dto.id === 'string'
    && typeof dto.headcode === 'string'
    && typeof dto.timeToStation === 'number'
    && typeof dto.expectedPass === 'string'
    && (dto.direction === 'outbound' || dto.direction === 'inbound');
}

export function parseFreightResponse(response: FreightResponse, viewpoint: Viewpoint): Arrival[] {
  return response.arrivals
    .filter(hasRequiredFields)
    .map((dto) => ({
      id: dto.id,
      stationName: viewpoint.stops[viewpoint.anchorIndex].fullName,
      lineId: viewpoint.lineId,
      destinationName: dto.destination,
      origin: dto.origin,
      timeToStation: dto.timeToStation,
      expectedArrival: dto.expectedPass,
      modeName: 'freight',
      platformName: '',
      direction: dto.direction,
      category: 'freight' as const,
      operatorCode: dto.operatorCode,
      headcode: dto.headcode,
    }));
}

export async function fetchFreight(stationCode: string, viewpoint: Viewpoint): Promise<Arrival[]> {
  const url = `/.netlify/functions/freight?station=${encodeURIComponent(stationCode)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Freight proxy error: ${response.status}`);
  }
  const data = (await response.json()) as FreightResponse;
  return parseFreightResponse(data, viewpoint);
}
