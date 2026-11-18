// The home screen: "Your favourites", then every other spot. Redrawn every
// second, so it updates the elements it already has instead of rebuilding
// them: a finger already down on a row or a star stays on the same element,
// and a row only moves when its place in the list changes.
import type { HomeModel, HomeRow } from './homeModel';

export interface HomeOptions {
  onOpen: (id: string) => void;
  onToggleFavourite: (id: string) => void;
  /** The only thing on home that asks the browser for location. */
  onUseLocation: () => void;
  onLocationOff: () => void;
}

// Listeners are attached once, when an element is made, and call through the
// options of the latest render.
let currentOptions: HomeOptions | null = null;

const STAR_PATH = 'M8 1 L10 6 L15 6 L11 9 L12 14 L8 11 L4 14 L5 9 L1 6 L6 6 Z';
const STAR_FILLED = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${STAR_PATH}" fill="currentColor"/></svg>`;
const STAR_OUTLINE = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${STAR_PATH}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;

const LOCATION_TEXT: Record<'locating' | 'on' | 'denied' | 'no-signal', string> = {
  locating: 'Finding you…',
  on: 'Using your location',
  denied: 'Location unavailable',
  'no-signal': 'No GPS signal',
};

export function renderHome(root: HTMLElement, model: HomeModel, options: HomeOptions): void {
  currentOptions = options;

  // Every row already on screen, wherever it sits, so a row that changes
  // section keeps its element.
  const existingRows = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>('.home-row').forEach((li) => {
    if (li.dataset.id) existingRows.set(li.dataset.id, li);
  });
  const rowFor = (row: HomeRow) => updateRow(existingRows.get(row.id) ?? createRow(row.id), row);

  const out: HTMLElement[] = [child(root, 'home-header') ?? createHeader()];

  if (model.favourites.length > 0) {
    out.push(section(root, 'home-favourites', 'Your favourites', model.favourites.map(rowFor)));
  }

  const location = locationControl(root, model.location);
  if (location) out.push(location);

  if (model.others.length > 0) {
    out.push(section(root, 'home-others', model.othersTitle, model.others.map(rowFor)));
  }

  if (model.notice !== null) {
    const notice = child(root, 'home-notice') ?? create('p', 'home-notice');
    notice.setAttribute('role', 'status');
    setText(notice, model.notice);
    out.push(notice);
  }

  out.push(child(root, 'doc-links') ?? createDocLinks());
  place(root, out);
}

/** Put `nodes` into `parent` in order. Nodes already in place are not
 *  touched; anything else in `parent` goes. */
function place(parent: HTMLElement, nodes: HTMLElement[]): void {
  const wanted = new Set<Element>(nodes);
  Array.from(parent.children).forEach((el) => {
    if (!wanted.has(el)) parent.removeChild(el);
  });
  nodes.forEach((node, i) => {
    const at = parent.children[i] ?? null;
    if (at !== node) parent.insertBefore(node, at);
  });
}

function create<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}

/** A direct child of `root` carrying this class, if home already drew one. */
function child(root: HTMLElement, className: string): HTMLElement | null {
  return Array.from(root.children).find((el) => el.classList.contains(className)) as HTMLElement | undefined ?? null;
}

function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function createHeader(): HTMLElement {
  const header = create('header', 'home-header');
  const title = document.createElement('h1');
  title.textContent = 'E17 Trains';
  header.appendChild(title);
  return header;
}

function createDocLinks(): HTMLElement {
  const docs = create('nav', 'doc-links');
  docs.setAttribute('aria-label', 'Site information');
  docs.innerHTML =
    '<a href="/about.html">About</a>' +
    '<span aria-hidden="true">·</span>' +
    '<a href="/privacy.html">Privacy</a>' +
    '<span aria-hidden="true">·</span>' +
    '<a href="/terms.html">Terms</a>';
  return docs;
}

function section(root: HTMLElement, className: string, title: string, rows: HTMLElement[]): HTMLElement {
  let el = child(root, className);
  if (!el) {
    el = create('section', `${className} home-section`);
    el.appendChild(document.createElement('h2'));
    el.appendChild(create('ul', 'home-list'));
  }
  setText(el.querySelector('h2')!, title);
  place(el.querySelector<HTMLElement>('.home-list')!, rows);
  return el;
}

function locationControl(root: HTMLElement, location: HomeModel['location']): HTMLElement | null {
  if (location === 'unavailable') return null;

  if (location === 'off') {
    const existing = child(root, 'home-locate');
    if (existing) return existing;
    const button = create('button', 'home-locate');
    button.type = 'button';
    button.textContent = 'Use my location';
    button.addEventListener('click', () => currentOptions?.onUseLocation());
    return button;
  }

  let el = child(root, 'home-location');
  if (!el) {
    el = create('div', 'home-location');
    el.appendChild(create('span', 'home-location-text'));
    const off = create('button', 'home-location-off');
    off.type = 'button';
    off.textContent = 'off';
    off.setAttribute('aria-label', 'Stop using my location');
    off.addEventListener('click', () => currentOptions?.onLocationOff());
    el.appendChild(off);
  }
  setText(el.querySelector('.home-location-text')!, LOCATION_TEXT[location]);
  return el;
}

function createRow(id: string): HTMLElement {
  const li = create('li', 'home-row');
  li.dataset.id = id;

  const link = create('a', 'home-row-link');
  link.innerHTML =
    '<span class="home-row-dot" aria-hidden="true"></span>' +
    '<span class="home-row-text">' +
      '<span class="home-row-name"></span>' +
      '<span class="home-row-meta"></span>' +
    '</span>' +
    '<span class="home-row-countdown"></span>';
  link.addEventListener('click', (e) => {
    // A new tab, a new window or a middle click is the browser's to handle.
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    currentOptions?.onOpen(id);
  });
  li.appendChild(link);

  const star = create('button', 'home-star');
  star.type = 'button';
  star.addEventListener('click', () => currentOptions?.onToggleFavourite(id));
  li.appendChild(star);

  return li;
}

function updateRow(li: HTMLElement, row: HomeRow): HTMLElement {
  const link = li.querySelector<HTMLAnchorElement>('.home-row-link')!;
  if (link.getAttribute('href') !== row.href) link.setAttribute('href', row.href);

  const dot = li.querySelector<HTMLElement>('.home-row-dot')!;
  if (dot.dataset.color !== row.lineColor) {
    dot.dataset.color = row.lineColor;
    dot.style.backgroundColor = row.lineColor;
  }

  setText(li.querySelector('.home-row-name')!, row.name);
  setText(li.querySelector('.home-row-meta')!, row.walk === null ? row.lineName : `${row.lineName} · ${row.walk}`);

  const countdown = li.querySelector<HTMLElement>('.home-row-countdown')!;
  const countdownClass = `home-row-countdown ${row.countdown.kind}`;
  if (countdown.className !== countdownClass) countdown.className = countdownClass;
  setText(countdown, row.countdown.text);

  const star = li.querySelector<HTMLElement>('.home-star')!;
  const pressed = row.favourite ? 'true' : 'false';
  if (star.getAttribute('aria-pressed') !== pressed) {
    star.setAttribute('aria-pressed', pressed);
    star.classList.toggle('filled', row.favourite);
    star.innerHTML = row.favourite ? STAR_FILLED : STAR_OUTLINE;
  }
  const label = `Favourite: ${row.name}`;
  if (star.getAttribute('aria-label') !== label) star.setAttribute('aria-label', label);

  return li;
}
