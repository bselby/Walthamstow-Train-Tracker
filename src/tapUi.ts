// The timing slot inside each direction card: the dashed placeholder, the big
// yellow button, and the "Got it" or rank-up message that replaces it; plus
// the invitation card below the cards. Pure DOM builders; state lives in
// tapStore and is wired in main.ts.
import type { AskKind } from './tapStore';
import { promotionFor } from './tap';
import { HOW_PATH, TICKET_PATH } from './routes';
import { NO_SIGNAL_LINE, PLACEHOLDER, progressLine, rankUpLines } from './tapCopy';

export interface TapDirectionView {
  /** `reserved`: timing is on at this spot but nothing is due, so the slot
   *  holds its height, empty. `placeholder` is the full help box, for
   *  newcomers only (settleHelpBoxes). */
  state: 'none' | 'reserved' | 'placeholder' | 'button' | 'thanks';
  passKey: string | null;
  destination: string | null;
  /** Set in the 'thanks' state. */
  entry: { tapMs: number; predictedMs: number; tapsBefore: number } | null;
  /** Set in the 'placeholder' state: how long until the button opens
   *  (not shown; the box explains the button instead). */
  msUntilButton: number | null;
  /** In the 'thanks' state: the tap could not be sent. */
  offline: boolean;
}

export interface TapView {
  ask: AskKind;
  taps: number;
  /** After someone's newcomer visits there is no slot while waiting, and the
   *  button and thank-you get a shorter one (styles.css); the thank-you and
   *  rank-up drop a line to fit. Fixed for the visit. */
  short?: boolean;
  /** Show the line below the cards that turns location on (locationNudge). */
  nudge?: boolean;
  north: TapDirectionView;
  south: TapDirectionView;
}

export interface TapSlotHandlers {
  /** `pressedAtMs` is when the finger landed, not when it lifted. */
  onTap: (pressedAtMs: number) => void;
  onOpenTicket: () => void;
  onOpenHow: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The slot for one direction: null where timing is off, else a `.tap-slot`
 * of one fixed height (styles.css) holding nothing, the placeholder, the
 * button or the thank-you. The slot element is kept from state to state, so
 * nothing below it ever moves. Its contents are kept while the pass, state
 * and entry are unchanged, so the page's one-second redraw never loses a
 * press, and a tap in the other direction never redraws or re-announces
 * this card's thank-you.
 */
export function renderTapSlot(
  existing: HTMLElement | null,
  view: TapDirectionView,
  handlers: TapSlotHandlers,
  short = false,
): HTMLElement | null {
  if (view.state === 'none') return null;
  if ((view.state === 'button' || view.state === 'thanks') && view.passKey === null) return null;

  const slot = existing ?? el('div', 'tap-slot');
  slot.classList.toggle('tap-slot-short', short);
  const key = view.passKey ?? '';
  // A thank-you is drawn from its own tap, never from the global count.
  const entryKey = view.state === 'thanks' && view.entry ? String(view.entry.tapsBefore) : '';
  const same = slot.dataset.state === view.state
    && (slot.dataset.passKey ?? '') === key
    && (slot.dataset.entry ?? '') === entryKey;

  if (view.state === 'reserved') {
    if (!same) slot.replaceChildren();
  } else if (view.state === 'placeholder') {
    if (!same) slot.replaceChildren(renderPlaceholder(handlers));
  } else if (view.state === 'button') {
    if (!same) slot.replaceChildren(renderTapButton(handlers));
  } else if (same) {
    // The send result can arrive after the thank-you is drawn: add or drop
    // the no-signal line in place, so the status is not announced twice.
    setOffline(slot.querySelector<HTMLElement>('.tap-thanks')!, view.offline, short);
  } else {
    slot.replaceChildren(renderThanks(view, handlers, short));
  }

  if (view.state === 'reserved') slot.setAttribute('aria-hidden', 'true');
  else slot.removeAttribute('aria-hidden');
  slot.dataset.state = view.state;
  slot.dataset.passKey = key;
  slot.dataset.entry = entryKey;
  return slot;
}

function renderPlaceholder(handlers: TapSlotHandlers): HTMLElement {
  const box = el('button', 'tap-placeholder');
  box.type = 'button';
  box.appendChild(el('span', 'tap-placeholder-title', PLACEHOLDER.title));
  box.appendChild(el('span', 'tap-placeholder-body', PLACEHOLDER.body));
  box.appendChild(el('span', 'tap-placeholder-cue', PLACEHOLDER.cue));
  box.addEventListener('click', () => handlers.onOpenHow());
  return box;
}

function renderTapButton(handlers: TapSlotHandlers): HTMLElement {
  const button = el('button', 'tap-button');
  button.type = 'button';
  button.appendChild(el('span', 'tap-button-main', 'Tap as the train passes'));
  button.appendChild(el('span', 'tap-button-sub', 'when the front reaches you'));
  let committed = false;
  // The time the finger landed, while a press is pending.
  let pressedAtMs: number | null = null;
  // A pointer press started on this button: the browser's click that may
  // follow belongs to it, not to the keyboard.
  let pointerSequence = false;

  const discard = () => {
    pressedAtMs = null;
    button.classList.remove('pressing');
  };
  // One booking per button, stamped with the moment the finger landed.
  const commit = (atMs: number) => {
    if (committed) return;
    committed = true;
    discard();
    button.classList.add('pressed');
    button.setAttribute('aria-disabled', 'true');
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(20);
    }
    handlers.onTap(atMs);
  };

  // pointerdown only records the press: the browser does not yet know whether
  // the touch starts a scroll. The tap is booked on release on the button.
  button.addEventListener('pointerdown', (event) => {
    if (committed || event.button !== 0 || event.isPrimary === false) return;
    pointerSequence = true;
    pressedAtMs = Date.now();
    button.classList.add('pressing');
  });
  button.addEventListener('pointerup', (event) => {
    if (pressedAtMs === null || event.button !== 0 || event.isPrimary === false) return;
    commit(pressedAtMs);
  });
  // A scroll took over the touch: no click follows, so a later keyboard
  // activation stands on its own.
  button.addEventListener('pointercancel', () => {
    discard();
    pointerSequence = false;
  });
  button.addEventListener('pointerleave', discard);
  // A key press starts a keyboard activation, even if an abandoned pointer
  // press (released off the button) left pointerSequence set.
  button.addEventListener('keydown', () => {
    pointerSequence = false;
  });
  // Keyboard activation has no pointerdown before it.
  button.addEventListener('click', () => {
    if (pointerSequence) {
      pointerSequence = false;
      return;
    }
    commit(Date.now());
  });
  return button;
}

const TICK_SVG =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10 L8.5 14.5 L16 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderThanks(view: TapDirectionView, handlers: TapSlotHandlers, short: boolean): HTMLElement {
  const box = el('div', 'tap-thanks');
  box.setAttribute('role', 'status');
  const before = view.entry?.tapsBefore ?? 0;
  const after = before + 1;
  const promoted = view.entry !== null && promotionFor(before, after) !== null;

  if (promoted) {
    // A rank-up takes the place of "Got it", inside the card, so it never
    // covers a countdown. Trimmed to fit the slot: the title, the next rank
    // (or the kit at the top rank), and a link to the ticket. The short slot
    // has no room for the link; the header's ticket badge opens it there.
    box.classList.add('tap-rankup');
    const lines = rankUpLines(after);
    box.appendChild(el('p', 'tap-heading', lines.title));
    box.appendChild(el('p', 'tap-line tap-next', lines.next ?? lines.body));
    if (!short) box.appendChild(seeTicketLink(handlers));
  } else {
    const head = el('div', 'tap-thanks-head');
    const tick = el('span', 'tap-tick');
    tick.innerHTML = TICK_SVG;
    head.appendChild(tick);
    head.appendChild(el('p', 'tap-heading', 'Got it. Ticket clipped.'));
    box.appendChild(head);
    box.appendChild(el('p', 'tap-line', progressLine(after)));
  }

  setOffline(box, view.offline, short);
  return box;
}

function seeTicketLink(handlers: TapSlotHandlers): HTMLElement {
  const see = el('a', 'tap-see-ticket', 'See my ticket');
  see.href = TICKET_PATH;
  see.addEventListener('click', (e) => {
    // A new tab or window is the browser's to handle.
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    handlers.onOpenTicket();
  });
  return see;
}

/** Add or drop the no-signal line. In a rank-up it stands in for the next
 *  rank line, and in the short slot for the progress line too, so the
 *  message still fits the slot. */
function setOffline(box: HTMLElement, offline: boolean, short: boolean): void {
  const line = box.querySelector('.tap-offline');
  if (offline && !line) {
    box.insertBefore(el('p', 'tap-offline', NO_SIGNAL_LINE), box.querySelector('.tap-see-ticket'));
  } else if (!offline && line) {
    line.remove();
  }
  if (box.classList.contains('tap-rankup')) {
    const next = box.querySelector<HTMLElement>('.tap-next');
    if (next) next.hidden = offline;
  } else if (short) {
    const progress = box.querySelector<HTMLElement>(':scope > .tap-line');
    if (progress) progress.hidden = offline;
  }
}

export interface AskCardHandlers {
  onChoice: (choice: 'helping' | 'declined') => void;
  /** "Show me how": the explainer, on its own address. */
  onOpenHow: () => void;
}

const STOPWATCH_SVG =
  '<svg class="ask-icon" viewBox="0 0 30 30" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="15" cy="17" r="10"/><path d="M15 17 V11"/><path d="M12 3 H18"/><path d="M15 3 V7"/></g></svg>';

/** The invitation (board 1) below both direction cards, for `first` and
 *  `again` only. The other kinds used to draw a ticket strip; that job is the
 *  header badge's. "Show me how" opens the explainer, whose "Count me in" is
 *  the yes; "No thanks" is the no. */
export function renderAskCard(ask: AskKind, handlers: AskCardHandlers): HTMLElement | null {
  if (ask !== 'first' && ask !== 'again') return null;

  const card = el('section', 'ask-card');
  card.setAttribute('aria-labelledby', 'ask-card-heading');

  const head = el('div', 'ask-head');
  head.innerHTML = STOPWATCH_SVG;
  const heading = el('h2', 'ask-heading', 'Fancy timing a train?');
  heading.id = 'ask-card-heading';
  head.appendChild(heading);
  card.appendChild(head);
  card.appendChild(el('p', 'ask-body', "Tap as it passes and you'll help make this countdown spot-on."));

  const how = el('a', 'ask-how', 'Show me how');
  how.href = HOW_PATH;
  how.addEventListener('click', (e) => {
    // A new tab or window is the browser's to handle.
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    handlers.onOpenHow();
  });
  card.appendChild(how);

  const no = el('button', 'ask-decline', 'No thanks');
  no.type = 'button';
  no.addEventListener('click', () => handlers.onChoice('declined'));
  card.appendChild(no);
  return card;
}
