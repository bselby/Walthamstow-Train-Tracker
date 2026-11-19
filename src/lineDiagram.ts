import type { Stop } from './stops';
import type { Direction } from './direction';
import { escapeHtml } from './escapeHtml';

// The line diagram rule, the same at every spot: both end stations as larger
// dots, named in full; the two stations a train passes just before the spot,
// as small named dots; and a "You" pin at the spot. Nothing else, so it is
// clear at a glance where the train is. Drawn in a 326 × 62 box; the track
// runs 12 units in from each side.

export const DIAGRAM_WIDTH = 326;
export const DIAGRAM_HEIGHT = 62;
const INSET = 12;
const TRACK_Y = 50;

/** Fixed places along the track (0 = left end, 1 = right end), so every spot
 *  looks the same. Spaced so each station's name, centred under its dot, has
 *  room between the two end names. [further, nearer] from the spot. */
const MIDDLE_FRACS = { north: [0.33, 0.59], south: [0.67, 0.41] } as const;
const PIN_FRAC = { north: 0.82, south: 0.18 } as const;

export interface DiagramStation {
  /** Index in the line's stops. */
  index: number;
  frac: number;
  end: boolean;
  name: string;
}

export interface LineDiagramLayout {
  /** In line order: the left end, the stations before the spot, the right end. */
  stations: DiagramStation[];
  pinPosition: number;
  pinFrac: number;
}

export function lineDiagramLayout(
  stops: readonly Stop[],
  pinPosition: number,
  direction: Direction,
): LineDiagramLayout {
  const last = stops.length - 1;
  const atStation = Number.isInteger(pinPosition);
  // North trains run up the stop indices (left to right), south ones down.
  // [nearer, further] from the spot, against the direction of travel.
  const before = direction === 'north'
    ? [atStation ? pinPosition - 1 : Math.floor(pinPosition)]
    : [atStation ? pinPosition + 1 : Math.ceil(pinPosition)];
  before.push(direction === 'north' ? before[0] - 1 : before[0] + 1);
  const fracFor = (k: number): number => MIDDLE_FRACS[direction][1 - k];
  const middle: DiagramStation[] = before
    .map((index, k) => ({ index, frac: fracFor(k), end: false, name: stops[index]?.fullName ?? '' }))
    .filter((st) => st.index > 0 && st.index < last)
    .sort((x, y) => x.index - y.index);
  return {
    stations: [
      { index: 0, frac: 0, end: true, name: stops[0].fullName },
      ...middle,
      { index: last, frac: 1, end: true, name: stops[last].fullName },
    ],
    pinPosition,
    pinFrac: PIN_FRAC[direction],
  };
}

/** Where along the drawn track (0 to 1) a train at `pos` (stop index,
 *  fractional between stations) sits: straight lines between the shown
 *  stations and the pin, so it is exactly on each when it is there. */
export function fracForPos(layout: LineDiagramLayout, pos: number): number {
  const anchors = [
    ...layout.stations.map((st) => ({ index: st.index, frac: st.frac })),
    { index: layout.pinPosition, frac: layout.pinFrac },
  ].sort((x, y) => x.index - y.index);
  if (pos <= anchors[0].index) return anchors[0].frac;
  for (let i = 1; i < anchors.length; i++) {
    const lo = anchors[i - 1];
    const hi = anchors[i];
    if (pos <= hi.index) {
      if (hi.index === lo.index) return hi.frac;
      return lo.frac + ((pos - lo.index) / (hi.index - lo.index)) * (hi.frac - lo.frac);
    }
  }
  return anchors[anchors.length - 1].frac;
}

const xAt = (frac: number): number => INSET + frac * (DIAGRAM_WIDTH - INSET * 2);

/** Where the spot is, in words: "at Wood Street" or "between A and B". */
export function pinPlace(stops: readonly Stop[], pinPosition: number): string {
  const lo = stops[Math.floor(pinPosition)];
  const hi = stops[Math.ceil(pinPosition)];
  if (!lo || !hi) return '';
  return lo === hi ? `at ${lo.fullName}` : `between ${lo.fullName} and ${hi.fullName}`;
}

const r = (n: number): string => String(Math.round(n * 100) / 100);

/** The static drawing: track, station dots and the You pin. The moving train
 *  sits on top as its own element so it can glide and be tapped. */
export function lineDiagramSvg(layout: LineDiagramLayout): string {
  const pinX = xAt(layout.pinFrac);
  const track = `<rect class="line-track" x="${INSET}" y="${TRACK_Y}" width="${DIAGRAM_WIDTH - INSET * 2}" height="4" rx="2"/>`;
  // Each dot carries its stop index, so the passing pulse can find it.
  const dots = layout.stations.map((st) => {
    const attrs = `class="line-station${st.end ? ' end' : ''}" data-index="${st.index}" data-name="${escapeHtml(st.name)}" cx="${r(xAt(st.frac))}" cy="52"`;
    return `<circle ${attrs} r="${st.end ? 7 : 4.5}"/>`;
  }).join('');

  // Text sits on the side of the pin away from the stations before it.
  const text = layout.pinFrac > 0.5
    ? `<text x="${r(pinX + 15)}" y="24">You</text>`
    : `<text x="${r(pinX - 15)}" y="24" text-anchor="end">You</text>`;
  const pin = `<g class="line-pin"><g class="line-pin-mark" transform="translate(${r(pinX - 220)} 0)">`
    + `<path d="M220 50 C216 44 209 37 209 29 A11 11 0 0 1 231 29 C231 37 224 44 220 50 Z"/>`
    + `<circle cx="220" cy="29" r="4"/></g>${text}</g>`;

  return `<svg class="line-svg" viewBox="0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}" aria-hidden="true" focusable="false">${track}${dots}${pin}</svg>`;
}
