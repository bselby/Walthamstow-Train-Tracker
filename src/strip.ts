import type { Stop } from './stops';
import type { Direction } from './direction';
import { currentTheme, type Theme } from './season';
import { toot } from './toot';
import { passengerTrainSvg, freightTrainSvg } from './trainArt';
import { lineDiagramSvg, pinPlace } from './lineDiagram';
import type { LineId } from './viewpoints';

export interface StripModel {
  direction: Direction;
  pos: number | null;
  celebrate: boolean;
  stops: readonly Stop[];
  anchorIndex: number;
  /** Where the "You" pin sits, in stop indices (fractional between stations). */
  pinPosition: number;
  lineNameForAria: string; // e.g. 'Weaver line', 'Suffragette line'
  /** Picks the door and stripe colour of the passenger train. */
  lineId?: LineId;
  /** When true the strip draws the freight train instead of the passenger
   *  train. Outfits are skipped: freight is never dressed. */
  isFreight: boolean;
}

function trainSvg(isFreight: boolean, theme: Theme): string {
  return isFreight ? freightTrainSvg() : passengerTrainSvg(theme);
}

function createTrainElement(
  direction: Direction,
  theme: Theme,
  lastIndex: number,
  isFreight: boolean,
): HTMLElement {
  const el = document.createElement('div');
  el.className = `strip-train strip-train-${direction}${isFreight ? ' freight' : ''}`;
  // North trains start at position 0 (left), south at lastIndex (right).
  el.style.setProperty('--pos', direction === 'north' ? '0' : String(lastIndex));
  el.dataset.theme = theme ?? '';
  el.dataset.category = isFreight ? 'freight' : 'passenger';

  const inner = document.createElement('div');
  inner.className = 'strip-train-inner';
  inner.innerHTML = trainSvg(isFreight, theme);
  el.appendChild(inner);

  el.addEventListener('click', () => {
    toot();
    el.classList.remove('tooting');
    void el.offsetWidth;
    el.classList.add('tooting');
  });

  return el;
}

function refreshTrainCategory(strip: HTMLElement, isFreight: boolean, theme: Theme): void {
  const train = strip.querySelector<HTMLElement>('.strip-train');
  if (!train) return;
  const nextCategory = isFreight ? 'freight' : 'passenger';
  if (train.dataset.category === nextCategory && train.dataset.theme === (theme ?? '')) return;
  train.dataset.category = nextCategory;
  train.dataset.theme = theme ?? '';
  train.classList.toggle('freight', isFreight);
  const inner = train.querySelector<HTMLElement>('.strip-train-inner');
  if (inner) inner.innerHTML = trainSvg(isFreight, theme);
}

const previousPos: Partial<Record<Direction, number>> = {};
// Remember which viewpoint each direction's strip last rendered for, so we can
// tear down and rebuild when it changes.
const previousViewpointStops = new WeakMap<HTMLElement, readonly Stop[]>();

/** Called by render.ts on viewpoint switch to prevent the previous viewpoint's
 *  last-known position from triggering a stale station pulse on the first
 *  render of the new viewpoint's strips. */
export function clearPreviousPositions(): void {
  for (const key of Object.keys(previousPos) as Direction[]) {
    delete previousPos[key];
  }
}

export function renderDirectionStrip(
  el: HTMLElement | null,
  model: StripModel,
): HTMLElement {
  // If the stops list changed (e.g. user switched viewpoints), force a rebuild.
  const stale = el !== null && previousViewpointStops.get(el) !== model.stops;
  const strip = stale || el === null ? buildSkeleton(model) : el;
  previousViewpointStops.set(strip, model.stops);

  refreshTrainCategory(strip, model.isFreight, currentTheme(new Date()));
  updateDynamic(strip, model);

  const prev = previousPos[model.direction];
  if (prev !== undefined && model.pos !== null && prev !== model.pos) {
    const lo = Math.min(prev, model.pos);
    const hi = Math.max(prev, model.pos);
    for (let i = Math.ceil(lo); i <= Math.floor(hi); i++) {
      pulseStation(strip, i);
    }
  }
  if (model.pos !== null) previousPos[model.direction] = model.pos;
  else delete previousPos[model.direction];

  return strip;
}

function pulseStation(strip: HTMLElement, index: number): void {
  const dot = strip.querySelectorAll<SVGElement>('.line-station')[index];
  if (!dot) return;
  dot.classList.remove('pulsing');
  dot.getBoundingClientRect(); // restart the animation
  dot.classList.add('pulsing');
}

function diagramLabel(model: StripModel): string {
  const first = model.stops[0].fullName;
  const last = model.stops[model.stops.length - 1].fullName;
  const towards = model.direction === 'north' ? last : first;
  const place = pinPlace(model.stops, model.pinPosition);
  return `${model.lineNameForAria}, ${first} to ${last}. Trains towards ${towards}.`
    + (place ? ` You are ${place}.` : '');
}

function buildSkeleton(model: StripModel): HTMLElement {
  const container = document.createElement('section');
  container.className = `strip strip-${model.direction}`;
  if (model.lineId) container.dataset.line = model.lineId;
  // Expose the stop count to CSS so --pos → left math scales.
  container.style.setProperty('--stop-count', String(model.stops.length));

  // The train drawings are aria-hidden, so the diagram as a whole carries
  // the screen-reader label.
  const diagram = document.createElement('div');
  diagram.className = 'line-diagram';
  diagram.setAttribute('role', 'img');
  diagram.setAttribute('aria-label', diagramLabel(model));
  diagram.innerHTML = lineDiagramSvg(model.stops, model.pinPosition);

  const theme = currentTheme(new Date());
  diagram.appendChild(
    createTrainElement(model.direction, theme, model.stops.length - 1, model.isFreight),
  );
  container.appendChild(diagram);

  const ends = document.createElement('div');
  ends.className = 'line-ends';
  ends.setAttribute('aria-hidden', 'true');
  for (const stop of [model.stops[0], model.stops[model.stops.length - 1]]) {
    const name = document.createElement('span');
    name.className = 'line-end-label';
    name.textContent = stop.fullName;
    ends.appendChild(name);
  }
  container.appendChild(ends);

  return container;
}

function updateDynamic(container: HTMLElement, model: StripModel): void {
  const train = container.querySelector<HTMLElement>('.strip-train')!;
  const pin = container.querySelector<SVGElement>('.line-pin');

  setTrain(train, model.pos);
  if (pin) pin.classList.toggle('celebrating', model.celebrate);
}

function setTrain(el: HTMLElement, pos: number | null): void {
  if (pos === null) {
    el.classList.add('hidden');
  } else {
    el.classList.remove('hidden');
    el.style.setProperty('--pos', String(pos));
  }
}
