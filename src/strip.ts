import type { Stop } from './stops';
import type { Direction } from './direction';
import { currentTheme, type Theme } from './season';
import { toot } from './toot';
import { passengerTrainSvg, freightTrainSvg } from './trainArt';
import { fracForPos, lineDiagramLayout, lineDiagramSvg, pinPlace, type LineDiagramLayout } from './lineDiagram';
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
  isFreight: boolean,
): HTMLElement {
  const el = document.createElement('div');
  el.className = `strip-train strip-train-${direction}${isFreight ? ' freight' : ''}`;
  // North trains start at the left end, south at the right.
  el.style.setProperty('--x', direction === 'north' ? '0' : '1');
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
const layouts = new WeakMap<HTMLElement, LineDiagramLayout>();

function layoutFor(model: StripModel): LineDiagramLayout {
  return lineDiagramLayout(model.stops, model.pinPosition, model.direction);
}

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
    // Only the shown stations pulse: the train is going through that stop.
    for (const dot of strip.querySelectorAll<SVGElement>('.line-station')) {
      const index = Number(dot.dataset.index);
      if (index >= lo && index <= hi) pulseStation(dot);
    }
  }
  if (model.pos !== null) previousPos[model.direction] = model.pos;
  else delete previousPos[model.direction];

  return strip;
}

function pulseStation(dot: SVGElement): void {
  dot.classList.remove('pulsing');
  dot.getBoundingClientRect(); // restart the animation
  dot.classList.add('pulsing');
}

function diagramLabel(model: StripModel): string {
  const first = model.stops[0].fullName;
  const last = model.stops[model.stops.length - 1].fullName;
  const towards = model.direction === 'north' ? last : first;
  const place = pinPlace(model.stops, model.pinPosition);
  const before = layoutFor(model).stations.filter((st) => !st.end).map((st) => st.name);
  const ordered = model.direction === 'north' ? before : [...before].reverse();
  return `${model.lineNameForAria}, ${first} to ${last}. Trains towards ${towards}.`
    + (place ? ` You are ${place}.` : '')
    + (ordered.length ? ` Trains pass ${ordered.join(' then ')} before reaching you.` : '');
}

function buildSkeleton(model: StripModel): HTMLElement {
  const container = document.createElement('section');
  container.className = `strip strip-${model.direction}`;
  if (model.lineId) container.dataset.line = model.lineId;
  const layout = layoutFor(model);
  layouts.set(container, layout);

  // The train drawings are aria-hidden, so the diagram as a whole carries
  // the screen-reader label.
  const diagram = document.createElement('div');
  diagram.className = 'line-diagram';
  diagram.setAttribute('role', 'img');
  diagram.setAttribute('aria-label', diagramLabel(model));
  diagram.innerHTML = lineDiagramSvg(layout);

  const theme = currentTheme(new Date());
  diagram.appendChild(
    createTrainElement(model.direction, theme, model.isFreight),
  );
  container.appendChild(diagram);

  // Under the track: the two end names at the edges, and each station
  // before the spot centred under its dot.
  const ends = document.createElement('div');
  ends.className = 'line-ends';
  ends.setAttribute('aria-hidden', 'true');
  for (const st of layout.stations) {
    const name = document.createElement('span');
    name.className = st.end ? 'line-end-label' : 'line-stop-label';
    name.textContent = st.end ? st.name : (model.stops[st.index]?.shortName ?? st.name);
    if (!st.end) name.style.setProperty('--x', String(st.frac));
    ends.appendChild(name);
  }
  container.appendChild(ends);

  return container;
}

function updateDynamic(container: HTMLElement, model: StripModel): void {
  const train = container.querySelector<HTMLElement>('.strip-train')!;
  const pin = container.querySelector<SVGElement>('.line-pin');

  setTrain(train, model.pos === null ? null : fracForPos(layouts.get(container) ?? layoutFor(model), model.pos));
  if (pin) pin.classList.toggle('celebrating', model.celebrate);
}

function setTrain(el: HTMLElement, frac: number | null): void {
  if (frac === null) {
    el.classList.add('hidden');
  } else {
    el.classList.remove('hidden');
    el.style.setProperty('--x', String(frac));
  }
}
