// The home screen: "Your favourites", then every other spot. Redrawn every
// second, so it updates the elements it already has instead of rebuilding
// them: a finger already down on a row or a star stays on the same element,
// and a row only moves when its place in the list changes.
import type { HomeModel, HomeRow } from './homeModel';
import { ticketBadgeLabel } from './tapCopy';
import { currentTheme } from './season';
import { passengerTrainSvg } from './trainArt';

export interface HomeOptions {
  onOpen: (id: string) => void;
  onToggleFavourite: (id: string) => void;
  /** The only thing on home that asks the browser for location. */
  onUseLocation: () => void;
  onLocationOff: () => void;
  /** Trains timed so far: the ticket link's label. */
  taps: number;
  onOpenTicket: () => void;
}

// Listeners are attached once, when an element is made, and call through the
// options of the latest render.
let currentOptions: HomeOptions | null = null;

const STAR_PATH = 'M8 1 L10 6 L15 6 L11 9 L12 14 L8 11 L4 14 L5 9 L1 6 L6 6 Z';
const STAR_FILLED = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${STAR_PATH}" fill="currentColor"/></svg>`;
const STAR_OUTLINE = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${STAR_PATH}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;

const TICKET_ICON = '<svg class="ticket-badge-icon" viewBox="0 0 18 14" aria-hidden="true"><path d="M1 1 H17 V5 Q15 7 17 9 V13 H1 V9 Q3 7 1 5 Z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

const PIN = '<svg class="home-pin" viewBox="0 0 22 28" aria-hidden="true"><path d="M11 26 C7 20 1 15 1 10 A10 10 0 0 1 21 10 C21 15 15 20 11 26 Z" fill="var(--pin)" stroke="var(--pin-outline)" stroke-width="2"/><circle cx="11" cy="10" r="3.5" fill="var(--card)"/></svg>';

const LOCATION_TEXT: Record<'locating' | 'on' | 'denied' | 'no-signal', string> = {
  locating: 'Finding you…',
  on: 'Nearest first',
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

  const header = child(root, 'home-header') ?? createHeader();
  updateTicketLink(header, options.taps);
  const out: HTMLElement[] = [header];

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
  const ticket = create('button', 'ticket-badge home-ticket');
  ticket.type = 'button';
  ticket.innerHTML = TICKET_ICON + '<span class="ticket-badge-text"></span>';
  ticket.addEventListener('click', () => currentOptions?.onOpenTicket());
  const train = create('span', 'home-train');
  train.innerHTML = passengerTrainSvg(currentTheme(new Date()));
  const title = document.createElement('h1');
  title.textContent = 'E17 Trains';
  const tagline = create('p', 'home-tagline');
  tagline.textContent = 'When the next train passes, to the second.';
  header.append(ticket, train, title, tagline);
  return header;
}

function updateTicketLink(header: HTMLElement, taps: number): void {
  const label = ticketBadgeLabel(taps);
  const ticket = header.querySelector<HTMLElement>('.home-ticket')!;
  setText(ticket.querySelector('.ticket-badge-text')!, label);
  const spoken = label === 'Your ticket' ? label : `Your ticket: ${label.replace(' · ', ', ')}`;
  if (ticket.getAttribute('aria-label') !== spoken) ticket.setAttribute('aria-label', spoken);
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
    el.insertAdjacentHTML('afterbegin', PIN);
    el.appendChild(create('span', 'home-location-text'));
    const off = create('button', 'home-location-off');
    off.type = 'button';
    off.textContent = 'Turn off';
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
    '<span class="home-row-bar" aria-hidden="true"></span>' +
    '<span class="home-row-text">' +
      '<span class="home-row-name"></span>' +
      '<span class="home-row-meta"></span>' +
    '</span>' +
    '<span class="home-row-countdown">' +
      '<span class="visually-hidden"></span>' +
      '<span class="home-count-num" aria-hidden="true"></span>' +
      '<span class="home-count-unit" aria-hidden="true"></span>' +
    '</span>';
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

  // The line colour comes from a class, so the stylesheet's tokens (and
  // dark mode) decide the shade.
  const lineClass = `home-row line-${row.lineName.toLowerCase()}`;
  if (li.className !== lineClass) li.className = lineClass;

  setText(li.querySelector('.home-row-name')!, row.name);
  setText(li.querySelector('.home-row-meta')!, row.walk === null ? `${row.lineName} line` : `${row.lineName} line · ${row.walk}`);

  const countdown = li.querySelector<HTMLElement>('.home-row-countdown')!;
  const countdownClass = `home-row-countdown ${row.countdown.kind}`;
  if (countdown.className !== countdownClass) countdown.className = countdownClass;
  const { num, unit, spoken } = countdownWords(row.countdown);
  setText(countdown.querySelector('.visually-hidden')!, spoken);
  setText(countdown.querySelector('.home-count-num')!, num);
  setText(countdown.querySelector('.home-count-unit')!, unit);

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

/** "2 min" becomes a big "2" over a small "minutes"; words that are not a
 *  count stay as they are. */
function countdownWords(c: HomeRow['countdown']): { num: string; unit: string; spoken: string } {
  if (c.kind === 'minutes' || c.kind === 'seconds') {
    const n = parseInt(c.text, 10);
    const word = c.kind === 'minutes' ? 'minute' : 'second';
    const unit = n === 1 ? word : `${word}s`;
    return { num: String(n), unit, spoken: `${n} ${unit}` };
  }
  if (c.kind === 'now') return { num: c.text, unit: '', spoken: 'Now' };
  if (c.kind === 'none') return { num: c.text, unit: '', spoken: 'No trains due' };
  if (c.kind === 'stale') return { num: c.text, unit: '', spoken: 'No live times' };
  return { num: c.text, unit: '', spoken: 'Waiting for times' };
}
