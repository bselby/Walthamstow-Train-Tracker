import { STOPS } from './stops';
import type { Direction } from './direction';

export interface StripModel {
  northPos: number | null;
  southPos: number | null;
  celebrate: { direction: Direction } | null;
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
  <!-- Body: boxy mid-section with raked nose on the leading (right) end -->
  <path class="train-body" d="M1 4 L42 4 L50 8 L50 17 L1 17 Z"/>
  <!-- Orange livery stripe along bottom edge (Overground brand stripe) -->
  <rect class="train-livery" x="1" y="15" width="49" height="2"/>
  <!-- Side windows (5 equal rectangles) -->
  <rect class="train-window" x="4" y="6.5" width="4.5" height="4.5" rx="0.5"/>
  <rect class="train-window" x="11" y="6.5" width="4.5" height="4.5" rx="0.5"/>
  <rect class="train-window" x="18" y="6.5" width="4.5" height="4.5" rx="0.5"/>
  <rect class="train-window" x="25" y="6.5" width="4.5" height="4.5" rx="0.5"/>
  <rect class="train-window" x="32" y="6.5" width="4.5" height="4.5" rx="0.5"/>
  <!-- Orange sliding doors (3 visible) -->
  <rect class="train-door" x="9" y="5" width="1.8" height="10.5"/>
  <rect class="train-door" x="23" y="5" width="1.8" height="10.5"/>
  <rect class="train-door" x="37" y="5" width="1.8" height="10.5"/>
  <!-- Cab window at the raked nose -->
  <path class="train-cab" d="M40 6 L48 9 L48 12.5 L40 12.5 Z"/>
  <!-- Bogies (wheel groupings) -->
  <rect class="train-bogie" x="5" y="17" width="9" height="3" rx="0.5"/>
  <rect class="train-bogie" x="33" y="17" width="9" height="3" rx="0.5"/>
</svg>
`;

export function renderStrip(root: HTMLElement, model: StripModel): void {
  let container = root.querySelector<HTMLElement>('.strip');

  if (!container) {
    container = buildSkeleton();
    root.appendChild(container);
  }

  updateDynamic(container, model);
}

function buildSkeleton(): HTMLElement {
  const container = document.createElement('section');
  container.className = 'strip';
  container.setAttribute('aria-label', 'Train positions on the Weaver line');

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

  const trainN = document.createElement('div');
  trainN.className = 'strip-train strip-train-north';
  trainN.style.setProperty('--pos', '0');
  trainN.innerHTML = TRAIN_SVG;
  container.appendChild(trainN);

  const trainS = document.createElement('div');
  trainS.className = 'strip-train strip-train-south';
  trainS.style.setProperty('--pos', '8');
  trainS.innerHTML = TRAIN_SVG;
  container.appendChild(trainS);

  return container;
}

function updateDynamic(container: HTMLElement, model: StripModel): void {
  const trainN = container.querySelector<HTMLElement>('.strip-train-north')!;
  const trainS = container.querySelector<HTMLElement>('.strip-train-south')!;
  const bridge = container.querySelector<HTMLElement>('.strip-bridge')!;

  setTrain(trainN, model.northPos);
  setTrain(trainS, model.southPos);

  bridge.classList.toggle('celebrating', model.celebrate !== null);
}

function setTrain(el: HTMLElement, pos: number | null): void {
  if (pos === null) {
    el.classList.add('hidden');
  } else {
    el.classList.remove('hidden');
    el.style.setProperty('--pos', String(pos));
  }
}
