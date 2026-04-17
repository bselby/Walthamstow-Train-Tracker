import { STOPS } from './stops';
import type { Direction } from './direction';

export interface StripModel {
  northPos: number | null;
  southPos: number | null;
  celebrate: { direction: Direction } | null;
}

const BRIDGE_SVG = `
<svg class="strip-bridge-svg" viewBox="0 0 28 16" aria-hidden="true">
  <path d="M2 13 L2 10 Q2 4 14 4 Q26 4 26 10 L26 13 Z" fill="currentColor"/>
  <rect x="2" y="13" width="24" height="1.5" fill="currentColor"/>
</svg>
`;

const TRAIN_SVG = `
<svg class="strip-train-svg" viewBox="0 0 40 24" aria-hidden="true">
  <g class="strip-train-body">
    <rect x="4" y="4" width="32" height="12" rx="3" fill="currentColor"/>
    <rect x="28" y="1" width="5" height="5" rx="1" fill="currentColor"/>
    <rect x="9" y="7" width="6" height="5" rx="1" fill="#0a0a0f"/>
    <circle cx="12" cy="9.5" r="0.6" fill="currentColor"/>
    <path d="M11 10.5 Q12 11.5 13 10.5" stroke="currentColor" stroke-width="0.6" fill="none" stroke-linecap="round"/>
    <circle cx="11" cy="17.5" r="2.5" fill="#0a0a0f" stroke="currentColor" stroke-width="1"/>
    <circle cx="29" cy="17.5" r="2.5" fill="#0a0a0f" stroke="currentColor" stroke-width="1"/>
  </g>
  <g class="strip-smoke">
    <circle class="strip-smoke-puff" cx="30" cy="-2" r="1.5" fill="currentColor"/>
    <circle class="strip-smoke-puff strip-smoke-puff-b" cx="30" cy="-2" r="1.5" fill="currentColor"/>
    <circle class="strip-smoke-puff strip-smoke-puff-c" cx="30" cy="-2" r="1.5" fill="currentColor"/>
  </g>
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
