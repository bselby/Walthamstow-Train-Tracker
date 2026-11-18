// The top of the countdown screen: a way back to all spots, the line and
// spot name, and the star. Built once and updated in place, so it survives
// the countdown screen's one-second redraw.
import type { Viewpoint } from './viewpoints';

export interface SpotHeaderModel {
  viewpoint: Viewpoint;
  favourite: boolean;
  onHome: () => void;
  onToggleFavourite: (id: string) => void;
}

// The latest model for each header, so listeners attached at creation call
// the current handlers for the current viewpoint.
const models = new WeakMap<HTMLElement, SpotHeaderModel>();

const STAR_PATH = 'M8 1 L10 6 L15 6 L11 9 L12 14 L8 11 L4 14 L5 9 L1 6 L6 6 Z';
const STAR_FILLED = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${STAR_PATH}" fill="currentColor"/></svg>`;
const STAR_OUTLINE = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${STAR_PATH}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;

export function renderSpotHeader(existing: HTMLElement | null, model: SpotHeaderModel): HTMLElement {
  const el = existing ?? build();
  models.set(el, model);

  const line = el.querySelector<HTMLElement>('.spot-header-line')!;
  if (line.textContent !== model.viewpoint.lineName) line.textContent = model.viewpoint.lineName;
  const name = el.querySelector<HTMLElement>('.spot-header-name')!;
  if (name.textContent !== model.viewpoint.name) name.textContent = model.viewpoint.name;

  const star = el.querySelector<HTMLElement>('.spot-header-star')!;
  const pressed = model.favourite ? 'true' : 'false';
  if (star.getAttribute('aria-pressed') !== pressed) {
    star.setAttribute('aria-pressed', pressed);
    star.classList.toggle('filled', model.favourite);
    star.innerHTML = model.favourite ? STAR_FILLED : STAR_OUTLINE;
  }
  const label = `Favourite: ${model.viewpoint.name}`;
  if (star.getAttribute('aria-label') !== label) star.setAttribute('aria-label', label);

  return el;
}

function build(): HTMLElement {
  const el = document.createElement('header');
  el.className = 'spot-header';
  el.innerHTML = `
    <a class="spot-header-home" href="/"><span class="spot-header-chevron" aria-hidden="true">‹</span>All spots</a>
    <div class="spot-header-title">
      <span class="spot-header-line"></span>
      <h1 class="spot-header-name"></h1>
    </div>
    <button type="button" class="spot-header-star"></button>
  `;

  el.querySelector('.spot-header-home')!.addEventListener('click', (e) => {
    const click = e as MouseEvent;
    // A new tab, a new window or a middle click is the browser's to handle.
    if (click.button !== 0 || click.ctrlKey || click.metaKey || click.shiftKey || click.altKey) return;
    click.preventDefault();
    models.get(el)?.onHome();
  });

  el.querySelector('.spot-header-star')!.addEventListener('click', () => {
    const model = models.get(el);
    model?.onToggleFavourite(model.viewpoint.id);
  });

  return el;
}
