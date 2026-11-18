// The ticket page: rank, progress, the ladder of ranks, and the yellow
// button switch. Rebuilt on every call; the caller only calls it when
// something it shows has changed.
import { LEVELS, levelFor } from './tap';
import { NO_TRAINS_LINE, progressLine } from './tapCopy';
import type { TapState } from './tapStore';

export interface TicketModel {
  taps: number;
  choice: TapState['choice'];
  spotNames: string[];
}

export interface TicketHandlers {
  onBack(): void;
  onToggleButton(on: boolean): void;
  onOpenHow(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function dots(taps: number): HTMLElement | null {
  const { next, stepsDone, stepsTotal } = levelFor(taps);
  if (!next) return null;
  const slots = Math.min(stepsTotal, 10);
  const filled = Math.round((stepsDone / stepsTotal) * slots);
  const wrap = el('div', 'ticket-dots');
  wrap.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < slots; i++) {
    wrap.append(el('span', i < filled ? 'ticket-dot filled' : i === filled ? 'ticket-dot next' : 'ticket-dot'));
  }
  return wrap;
}

export function renderTicketPage(root: HTMLElement, model: TicketModel, handlers: TicketHandlers): void {
  const hadFocus = root.contains(document.activeElement)
    && (document.activeElement as HTMLElement).id === 'ticket-show-button';
  const { taps } = model;
  const level = levelFor(taps);

  const back = el('button', 'info-back');
  back.type = 'button';
  back.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 3 L5 9 L11 15"/></svg>';
  back.append('Back');
  back.addEventListener('click', () => handlers.onBack());

  const h1 = el('h1', 'info-title', 'Your ticket');

  const ticket = el('section', 'ticket-card');
  ticket.setAttribute('aria-label', 'Your ticket');
  ticket.append(
    el('span', 'ticket-kicker', 'E17 TRAINS · TRAIN TIMER'),
    el('span', 'ticket-rank', level.name ?? 'No rank yet'),
  );
  const d = dots(taps);
  if (d) ticket.append(d);
  ticket.append(el('span', 'ticket-progress', taps === 0 ? NO_TRAINS_LINE : progressLine(taps)));
  if (model.spotNames.length > 0) {
    ticket.append(el('span', 'ticket-spots', `Timed at ${joinNames(model.spotNames)}`));
  }

  const ladder = el('ul', 'ladder');
  ladder.setAttribute('aria-label', 'Ranks');
  LEVELS.forEach((l) => {
    const current = taps > 0 && l.name === level.name;
    const li = el('li', current ? 'ladder-row current' : 'ladder-row');
    let note: string;
    if (current) note = 'Your rank';
    else if (level.next && l.name === level.next.name) {
      const toGo = l.taps - taps;
      note = `${l.taps} trains · ${toGo} to go`;
    } else note = `${l.taps} trains`;
    li.append(el('span', 'ladder-name', l.name), el('span', 'ladder-note', note));
    ladder.append(li);
  });

  const settings = el('section', 'ticket-settings');
  const label = el('label', 'ticket-toggle');
  label.htmlFor = 'ticket-show-button';
  const box = el('input');
  box.type = 'checkbox';
  box.id = 'ticket-show-button';
  box.checked = model.choice !== 'declined';
  box.addEventListener('change', () => handlers.onToggleButton(box.checked));
  label.append(el('span', undefined, 'Show the yellow button'), box);
  const how = el('button', 'info-link', 'How it works');
  how.type = 'button';
  how.addEventListener('click', () => handlers.onOpenHow());
  settings.append(label, el('span', 'ticket-note', 'Turn it off any time. Your ticket stays as it is.'), how);

  const foot = el('p', 'ticket-foot', 'Your ticket lives on this phone.');

  root.replaceChildren(back, h1, ticket, ladder, settings, foot);
  if (hadFocus) box.focus();
}
