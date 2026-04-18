import { STOPS } from './stops';
import type { Direction } from './direction';
import { currentTheme, type Theme } from './season';
import { toot } from './toot';

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

type NonNullTheme = Exclude<Theme, null>;

const THEME_OVERLAYS: Record<NonNullTheme, string> = {
  'winter-ski': `
    <g class="theme-overlay">
      <rect x="15" y="0.3" width="14" height="3.5" fill="#c13838" rx="0.6"/>
      <rect x="15" y="3" width="14" height="1" fill="#f4f4f7"/>
      <circle cx="22" cy="-0.3" r="1.3" fill="#f4f4f7"/>
    </g>
  `,
  'world-book-day': `
    <g class="theme-overlay">
      <rect x="18" y="0.6" width="10" height="3.4" fill="#2f4ea0" rx="0.3"/>
      <rect x="19" y="1.2" width="8" height="0.3" fill="#f4f4f7"/>
      <rect x="19" y="2.0" width="8" height="0.3" fill="#f4f4f7"/>
      <rect x="19" y="2.8" width="8" height="0.3" fill="#f4f4f7"/>
      <rect x="17.8" y="0.6" width="0.4" height="3.4" fill="#1a2840"/>
    </g>
  `,
  easter: `
    <g class="theme-overlay">
      <ellipse cx="18.5" cy="-0.5" rx="1.2" ry="4" fill="#f4f4f7" stroke="#a65c8a" stroke-width="0.4"/>
      <ellipse cx="22.5" cy="-0.5" rx="1.2" ry="4" fill="#f4f4f7" stroke="#a65c8a" stroke-width="0.4"/>
      <ellipse cx="18.5" cy="0" rx="0.4" ry="2.2" fill="#ffb6d0"/>
      <ellipse cx="22.5" cy="0" rx="0.4" ry="2.2" fill="#ffb6d0"/>
    </g>
  `,
  spring: `
    <g class="theme-overlay">
      <circle cx="44" cy="3.8" r="1.1" fill="#ff9ec7"/>
      <circle cx="45.4" cy="2.8" r="1.1" fill="#ff9ec7"/>
      <circle cx="46.4" cy="4.2" r="1.1" fill="#ff9ec7"/>
      <circle cx="44.6" cy="5.1" r="1.1" fill="#ff9ec7"/>
      <circle cx="45.3" cy="4" r="0.5" fill="#ffd23f"/>
    </g>
  `,
  summer: `
    <g class="theme-overlay">
      <rect x="40" y="7.5" width="3.2" height="2.2" fill="#0a0a0f" rx="0.3"/>
      <rect x="44" y="7.5" width="3.2" height="2.2" fill="#0a0a0f" rx="0.3"/>
      <rect x="43.2" y="8" width="0.8" height="0.5" fill="#0a0a0f"/>
    </g>
  `,
  autumn: `
    <g class="theme-overlay">
      <path d="M 22 -0.5 Q 19 -1.5 17.5 0.5 Q 19.5 -0.5 20.5 1.5 Q 18.8 2.5 19.5 3.5 Q 21 2.5 22 3.2 Q 22 1 22 -0.5 Z" fill="#d97748"/>
      <path d="M 22 1.2 L 22 3.6" stroke="#7a3a1a" stroke-width="0.3" stroke-linecap="round"/>
    </g>
  `,
  halloween: `
    <g class="theme-overlay">
      <ellipse cx="22" cy="1.5" rx="3.5" ry="2.8" fill="#ef6c1a"/>
      <path d="M 22 1 L 22 4" stroke="#b6460e" stroke-width="0.4"/>
      <rect x="21.7" y="-1" width="0.8" height="2.2" fill="#3b5a2a"/>
      <path d="M 20.2 1.5 L 21 1 L 21.8 1.5 Z" fill="#0a0a0f"/>
      <path d="M 22.2 1.5 L 23 1 L 23.8 1.5 Z" fill="#0a0a0f"/>
      <path d="M 20.5 2.5 Q 22 3.2 23.5 2.5" stroke="#0a0a0f" stroke-width="0.4" fill="none"/>
    </g>
  `,
  bonfire: `
    <g class="theme-overlay">
      <circle cx="22" cy="-3" r="0.6" fill="#ffd23f"/>
      <line x1="22" y1="-5.5" x2="22" y2="-3.8" stroke="#ffd23f" stroke-width="0.4"/>
      <line x1="18.8" y1="-4.5" x2="20.8" y2="-3.3" stroke="#ff6b35" stroke-width="0.4"/>
      <line x1="25.2" y1="-4.5" x2="23.2" y2="-3.3" stroke="#ff6b35" stroke-width="0.4"/>
      <line x1="22" y1="-1.8" x2="22" y2="0" stroke="#ffd23f" stroke-width="0.4"/>
      <line x1="17.5" y1="-2" x2="19.5" y2="-1.8" stroke="#ffd23f" stroke-width="0.4"/>
      <line x1="26.5" y1="-2" x2="24.5" y2="-1.8" stroke="#ffd23f" stroke-width="0.4"/>
    </g>
  `,
  christmas: `
    <g class="theme-overlay">
      <path d="M 17 4 L 27 4 L 23 -3 Q 22 -4 21 -3 Z" fill="#c13838"/>
      <rect x="17" y="3" width="10" height="1.2" fill="#f4f4f7"/>
      <circle cx="22" cy="-3.5" r="1.1" fill="#f4f4f7"/>
    </g>
  `,
  'new-year': `
    <g class="theme-overlay">
      <path d="M 18 4 L 26 4 L 22 -5 Z" fill="#ffd23f"/>
      <rect x="18" y="3.4" width="8" height="0.7" fill="#c13838"/>
      <circle cx="15" cy="-2" r="0.35" fill="#ffd23f"/>
      <circle cx="29" cy="-1" r="0.35" fill="#ffd23f"/>
      <circle cx="14" cy="1" r="0.35" fill="#c13838"/>
      <circle cx="30" cy="2" r="0.35" fill="#c13838"/>
    </g>
  `,
};

function createTrainElement(direction: Direction, theme: Theme): HTMLElement {
  const el = document.createElement('div');
  el.className = `strip-train strip-train-${direction}`;
  el.style.setProperty('--pos', direction === 'north' ? '0' : '8');

  // Inner wrapper so we can animate a toot-wobble scale (in Task 7) without
  // overwriting the outer translate positioning.
  const inner = document.createElement('div');
  inner.className = 'strip-train-inner';

  let svg = TRAIN_SVG;
  if (theme !== null) {
    // Inject the overlay right before the closing </svg> tag.
    svg = svg.replace('</svg>', `${THEME_OVERLAYS[theme]}</svg>`);
  }
  inner.innerHTML = svg;

  el.appendChild(inner);

  // Tap to toot — emits a synth honk and triggers the wobble animation.
  el.addEventListener('click', () => {
    toot();
    el.classList.remove('tooting');
    void el.offsetWidth; // force reflow so the animation restarts
    el.classList.add('tooting');
  });

  return el;
}

/**
 * Render a single direction's strip. If `el` is null, builds a new skeleton and
 * returns it; otherwise updates the existing one in place (preserving the DOM
 * node so CSS transitions survive between renders). The caller is responsible
 * for appending the returned element to the correct parent.
 */
const previousPos: Partial<Record<Direction, number>> = {};

export function renderDirectionStrip(
  el: HTMLElement | null,
  model: DirectionStripModel
): HTMLElement {
  const strip = el ?? buildSkeleton(model.direction);
  updateDynamic(strip, model);

  // Pulse any station pips the train crossed since the last render — a small
  // toddler-delight so you can see the train "visiting" each stop.
  const prev = previousPos[model.direction];
  if (prev !== undefined && model.pos !== null && prev !== model.pos) {
    const lo = Math.min(prev, model.pos);
    const hi = Math.max(prev, model.pos);
    for (let i = Math.ceil(lo); i <= Math.floor(hi); i++) {
      pulsePip(strip, i);
    }
  }
  if (model.pos !== null) {
    previousPos[model.direction] = model.pos;
  } else {
    delete previousPos[model.direction];
  }

  return strip;
}

function pulsePip(strip: HTMLElement, index: number): void {
  const pips = strip.querySelectorAll<HTMLElement>('.strip-pip');
  const pip = pips[index];
  if (!pip) return;
  pip.classList.remove('pulsing');
  // Force a reflow so the animation restarts even if the class was just removed.
  void pip.offsetWidth;
  pip.classList.add('pulsing');
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

  const theme = currentTheme(new Date());
  const train = createTrainElement(direction, theme);
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
