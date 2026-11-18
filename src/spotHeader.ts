// The top of the countdown screen: a way back to all spots, the ticket badge
// and the star on one row, then the spot name and its line. Built once and
// updated in place, so it survives the countdown screen's one-second redraw.
import type { Viewpoint } from './viewpoints';

export interface SpotHeaderModel {
  viewpoint: Viewpoint;
  favourite: boolean;
  onHome: () => void;
  onToggleFavourite: (id: string) => void;
  /** From ticketBadgeLabel: "Your ticket", or "Spotter · 4 trains". */
  ticketLabel: string;
  onOpenTicket: () => void;
  /** A tap's thank-you is showing: the badge lights up yellow (board 5). */
  ticketFresh?: boolean;
}

// The latest model for each header, so listeners attached at creation call
// the current handlers for the current viewpoint.
const models = new WeakMap<HTMLElement, SpotHeaderModel>();

const STAR_PATH = 'M8 1 L10 6 L15 6 L11 9 L12 14 L8 11 L4 14 L5 9 L1 6 L6 6 Z';
const STAR_FILLED = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${STAR_PATH}" fill="currentColor"/></svg>`;
const STAR_OUTLINE = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${STAR_PATH}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;

const CHEVRON = '<svg class="spot-header-chevron" viewBox="0 0 18 18" aria-hidden="true"><path d="M11 3 L5 9 L11 15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TICKET_ICON = '<svg class="ticket-badge-icon" viewBox="0 0 18 14" aria-hidden="true"><path d="M1 1 H17 V5 Q15 7 17 9 V13 H1 V9 Q3 7 1 5 Z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

export function renderSpotHeader(existing: HTMLElement | null, model: SpotHeaderModel): HTMLElement {
  const el = existing ?? build();
  models.set(el, model);

  const line = el.querySelector<HTMLElement>('.spot-header-line')!;
  const lineText = `${model.viewpoint.lineName} line`;
  if (line.textContent !== lineText) line.textContent = lineText;
  const name = el.querySelector<HTMLElement>('.spot-header-name')!;
  if (name.textContent !== model.viewpoint.name) name.textContent = model.viewpoint.name;

  const badge = el.querySelector<HTMLElement>('.ticket-badge')!;
  const badgeText = badge.querySelector<HTMLElement>('.ticket-badge-text')!;
  if (badgeText.textContent !== model.ticketLabel) {
    // Two halves that each stay on one line, so a narrow phone wraps the
    // badge between "Spotter ·" and "4 trains" rather than overlapping.
    const [rank, count] = model.ticketLabel.split(' · ');
    badgeText.replaceChildren(nowrap(count === undefined ? rank : `${rank} ·`));
    if (count !== undefined) badgeText.append(' ', nowrap(count));
  }
  const badgeLabel = model.ticketLabel === 'Your ticket'
    ? 'Your ticket'
    : `Your ticket: ${model.ticketLabel.replace(' · ', ', ')}`;
  if (badge.getAttribute('aria-label') !== badgeLabel) badge.setAttribute('aria-label', badgeLabel);
  badge.classList.toggle('fresh', model.ticketFresh === true);

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

function nowrap(text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'ticket-badge-part';
  span.textContent = text;
  return span;
}

function build(): HTMLElement {
  const el = document.createElement('header');
  el.className = 'spot-header';
  el.innerHTML = `
    <div class="spot-header-bar">
      <a class="spot-header-home" href="/">${CHEVRON}All spots</a>
      <button type="button" class="ticket-badge">${TICKET_ICON}<span class="ticket-badge-text"></span></button>
      <button type="button" class="spot-header-star"></button>
    </div>
    <div class="spot-header-title">
      <h1 class="spot-header-name"></h1>
      <span class="spot-header-line"></span>
    </div>
  `;

  el.querySelector('.spot-header-home')!.addEventListener('click', (e) => {
    const click = e as MouseEvent;
    // A new tab, a new window or a middle click is the browser's to handle.
    if (click.button !== 0 || click.ctrlKey || click.metaKey || click.shiftKey || click.altKey) return;
    click.preventDefault();
    models.get(el)?.onHome();
  });

  el.querySelector('.ticket-badge')!.addEventListener('click', () => {
    models.get(el)?.onOpenTicket();
  });

  el.querySelector('.spot-header-star')!.addEventListener('click', () => {
    const model = models.get(el);
    model?.onToggleFavourite(model.viewpoint.id);
  });

  return el;
}
