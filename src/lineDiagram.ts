import type { Stop } from './stops';

// The line diagram rule, the same at every spot: both end stations as larger
// dots, every station between as a small dot, and a "You" pin at the spot.
// Drawn in a 326 × 62 box; the track runs 12 units in from each side.

export const DIAGRAM_WIDTH = 326;
export const DIAGRAM_HEIGHT = 62;
const INSET = 12;
const TRACK_Y = 50;

export interface LineDiagramLayout {
  stations: { x: number; end: boolean; name: string }[];
  pinX: number;
}

export function lineDiagramLayout(
  stops: readonly Stop[],
  pinPosition: number,
  width = DIAGRAM_WIDTH,
): LineDiagramLayout {
  const last = stops.length - 1;
  const step = last > 0 ? (width - INSET * 2) / last : 0;
  const xAt = (p: number): number => INSET + p * step;
  return {
    stations: stops.map((stop, i) => ({
      x: xAt(i),
      end: i === 0 || i === last,
      name: stop.fullName,
    })),
    pinX: xAt(pinPosition),
  };
}

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
export function lineDiagramSvg(stops: readonly Stop[], pinPosition: number): string {
  const { stations, pinX } = lineDiagramLayout(stops, pinPosition);
  const track = `<rect class="line-track" x="${INSET}" y="${TRACK_Y}" width="${DIAGRAM_WIDTH - INSET * 2}" height="4" rx="2"/>`;
  // In station order, so the passing pulse can find a dot by its index.
  const dots = stations.map((s) => (s.end
    ? `<circle class="line-station end" cx="${r(s.x)}" cy="52" r="7"/>`
    : `<circle class="line-station" cx="${r(s.x)}" cy="52" r="4.5"/>`)).join('');

  // At a station the pin stands a little higher so its tip clears the dot.
  const atStation = Number.isInteger(pinPosition);
  const dy = atStation ? -4 : 0;
  // Text sits right of the pin, or left of it near the right-hand end.
  const textRight = pinX + 15 + 26 <= DIAGRAM_WIDTH;
  const text = textRight
    ? `<text x="${r(pinX + 15)}" y="${24 + dy}">You</text>`
    : `<text x="${r(pinX - 15)}" y="${24 + dy}" text-anchor="end">You</text>`;
  const pin = `<g class="line-pin"><g class="line-pin-mark" transform="translate(${r(pinX - 220)} ${dy})">`
    + `<path d="M220 50 C216 44 209 37 209 29 A11 11 0 0 1 231 29 C231 37 224 44 220 50 Z"/>`
    + `<circle cx="220" cy="29" r="4"/></g>${text}</g>`;

  return `<svg class="line-svg" viewBox="0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}" aria-hidden="true" focusable="false">${track}${dots}${pin}</svg>`;
}
