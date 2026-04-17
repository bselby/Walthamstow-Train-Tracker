import { STOPS } from './stops';
import type { Direction } from './direction';

export interface DirectionStripModel {
  direction: Direction;
  pos: number | null;
  celebrate: boolean;
}

const BRIDGE_SVG = `
<svg class="strip-bridge-svg" viewBox="0 0 28 16" aria-hidden="true">
  <path d="M2 13 L2 10 Q2 3 14 3 Q26 3 26 10 L26 13 Z" fill="currentColor"/>
  <rect x="0" y="13" width="28" height="2" fill="currentColor"/>
</svg>
`;

// Stylised London Overground Class 710 Aventra — side profile with raked cab nose.
// Uses named classes so CSS colours the parts: body (cream), livery/doors (overground orange),
// windows/cab/bogies (ink navy). Mirrors cleanly via scaleX(-1) for southbound.
const TRAIN_SVG = `
<svg class="strip-train-svg" viewBox="0 0 52 22" aria-hidden="true">
  <path class="train-body" d="M1 4 L42 4 L50 8 L50 17 L1 17 Z"/>
  <rect class="train-livery" x="1" y="15" width="49" height="2"/>
  <rect class="train-window" x="4" y="6.5" width="4.5" height="4.5" rx="0.5"/>
  <rect class="train-window" x="11" y="6.5" width="4.5" height="4.5" rx="0.5"/>
  <rect class="train-window" x="18" y="6.5" width="4.5" height="4.5" rx="0.5"/>
  <rect class="train-window" x="25" y="6.5" width="4.5" height="4.5" rx="0.5"/>
  <rect class="train-window" x="32" y="6.5" width="4.5" height="4.5" rx="0.5"/>
  <rect class="train-door" x="9" y="5" width="1.8" height="10.5"/>
  <rect class="train-door" x="23" y="5" width="1.8" height="10.5"/>
  <rect class="train-door" x="37" y="5" width="1.8" height="10.5"/>
  <path class="train-cab" d="M40 6 L48 9 L48 12.5 L40 12.5 Z"/>
  <rect class="train-bogie" x="5" y="17" width="9" height="3" rx="0.5"/>
  <rect class="train-bogie" x="33" y="17" width="9" height="3" rx="0.5"/>
</svg>
`;

/**
 * Render a single direction's strip. If `el` is null, builds a new skeleton and
 * returns it; otherwise updates the existing one in place (preserving the DOM
 * node so CSS transitions survive between renders). The caller is responsible
 * for appending the returned element to the correct parent.
 */
export function renderDirectionStrip(
  el: HTMLElement | null,
  model: DirectionStripModel
): HTMLElement {
  const strip = el ?? buildSkeleton(model.direction);
  updateDynamic(strip, model);
  return strip;
}

function buildSkeleton(direction: Direction): HTMLElement {
  const container = document.createElement('section');
  container.className = `strip strip-${direction}`;
  container.setAttribute(
    'aria-label',
    direction === 'north'
      ? 'Northbound train position on the Weaver line'
      : 'Southbound train position on the Weaver line'
  );

  const line = document.createElement('div');
  line.className = 'strip-line';
  container.appendChild(line);

  for (const stop of STOPS) {
    const pip = document.createElement('div');
    pip.className = 'strip-pip';
    pip.style.setProperty('--pos', String(stop.index));

    const dot = document.createElement('div');
    dot.className = 'strip-pip-dot';
    pip.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'strip-pip-label';
    label.textContent = stop.abbrev;
    pip.appendChild(label);

    container.appendChild(pip);
  }

  const bridge = document.createElement('div');
  bridge.className = 'strip-bridge';
  bridge.style.setProperty('--pos', '5.5');
  bridge.innerHTML = `${BRIDGE_SVG}<span class="strip-bridge-label">East Av</span>`;
  container.appendChild(bridge);

  const train = document.createElement('div');
  train.className = 'strip-train';
  // Start the train off-strip so the first real position change transitions in.
  train.style.setProperty('--pos', direction === 'north' ? '0' : '8');
  train.innerHTML = TRAIN_SVG;
  container.appendChild(train);

  return container;
}

function updateDynamic(container: HTMLElement, model: DirectionStripModel): void {
  const train = container.querySelector<HTMLElement>('.strip-train')!;
  const bridge = container.querySelector<HTMLElement>('.strip-bridge')!;

  setTrain(train, model.pos);
  bridge.classList.toggle('celebrating', model.celebrate);
}

function setTrain(el: HTMLElement, pos: number | null): void {
  if (pos === null) {
    el.classList.add('hidden');
  } else {
    el.classList.remove('hidden');
    el.style.setProperty('--pos', String(pos));
  }
}
