// The timing slot inside each direction card: the dashed placeholder, the big
// yellow button, and the "Got it" or rank-up message that replaces it; plus
// the invitation card below the cards. Pure DOM builders; state lives in
// tapStore and is wired in main.ts.
import type { AskKind } from './tapStore';
import { LEVELS, levelFor, promotionFor } from './tap';
import { NO_SIGNAL_LINE, placeholderLine, progressLine, rankUpLines } from './tapCopy';

export interface TapDirectionView {
  state: 'none' | 'placeholder' | 'button' | 'thanks';
  passKey: string | null;
  destination: string | null;
  /** Set in the 'thanks' state. */
  entry: { tapMs: number; predictedMs: number; tapsBefore: number } | null;
  /** Set in the 'placeholder' state: how long until the button opens. */
  msUntilButton: number | null;
  /** In the 'thanks' state: the tap could not be sent. */
  offline: boolean;
}

export interface TapView {
  ask: AskKind;
  taps: number;
  north: TapDirectionView;
  south: TapDirectionView;
}

export interface TapSlotHandlers {
  /** `pressedAtMs` is when the finger landed, not when it lifted. */
  onTap: (pressedAtMs: number) => void;
  onOpenTicket: () => void;
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
 * The slot for one direction: null, or a `.tap-slot` holding the placeholder,
 * the button or the thank-you. The slot element itself is kept from state to
 * state, so its fixed height holds and nothing below it jumps. Its contents
 * are kept while the pass, state and tap count are unchanged, so the page's
 * one-second redraw never loses a press or replays the clip.
 */
export function renderTapSlot(
  existing: HTMLElement | null,
  view: TapDirectionView,
  taps: number,
  handlers: TapSlotHandlers,
): HTMLElement | null {
  if (view.state === 'none') return null;
  if (view.state !== 'placeholder' && view.passKey === null) return null;

  const slot = existing ?? el('div', 'tap-slot');
  const key = view.state === 'placeholder' ? '' : view.passKey!;
  const tapsKey = view.state === 'thanks' ? String(taps) : '';
  const same = slot.dataset.state === view.state
    && (slot.dataset.passKey ?? '') === key
    && (slot.dataset.taps ?? '') === tapsKey;

  if (view.state === 'placeholder') {
    const line = placeholderLine(view.msUntilButton ?? 0);
    const box = same ? slot.querySelector<HTMLElement>('.tap-placeholder') : null;
    if (box) {
      if (box.textContent !== line) box.textContent = line;
    } else {
      slot.replaceChildren(el('div', 'tap-placeholder', line));
    }
  } else if (view.state === 'button') {
    if (!same) slot.replaceChildren(renderTapButton(handlers));
  } else if (same) {
    // The send result can arrive after the thank-you is drawn: add or drop
    // the no-signal line in place, so the status is not announced twice.
    setOffline(slot.querySelector<HTMLElement>('.tap-thanks')!, view.offline);
  } else {
    // The hole is newly clipped only when this thank-you replaces the button
    // for the same train; shown fresh (after a reload) it stays still.
    const justClipped = slot.dataset.state === 'button' && slot.dataset.passKey === key;
    slot.replaceChildren(renderThanks(view, taps, justClipped, handlers));
  }

  slot.dataset.state = view.state;
  slot.dataset.passKey = key;
  slot.dataset.taps = tapsKey;
  return slot;
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

function renderThanks(
  view: TapDirectionView,
  taps: number,
  justClipped: boolean,
  handlers: TapSlotHandlers,
): HTMLElement {
  const box = el('div', 'tap-thanks');
  box.setAttribute('role', 'status');
  const promoted = view.entry !== null && promotionFor(view.entry.tapsBefore, taps) !== null;

  if (promoted) {
    // A rank-up takes the place of "Got it", inside the card, so it never
    // covers a countdown.
    box.classList.add('tap-rankup');
    const lines = rankUpLines(taps);
    box.appendChild(el('p', 'tap-heading', lines.title));
    box.appendChild(el('p', 'tap-line', lines.body));
    if (lines.next) box.appendChild(el('p', 'tap-next', lines.next));
    const see = el('button', 'tap-see-ticket', 'See my ticket');
    see.type = 'button';
    see.addEventListener('click', () => handlers.onOpenTicket());
    box.appendChild(see);
  } else {
    const head = el('div', 'tap-thanks-head');
    const tick = el('span', 'tap-tick');
    tick.innerHTML = TICK_SVG;
    head.appendChild(tick);
    head.appendChild(el('p', 'tap-heading', 'Got it. Ticket clipped.'));
    box.appendChild(head);
    const holes = renderHoles(taps, justClipped);
    if (holes) box.appendChild(holes);
    box.appendChild(el('p', 'tap-line', progressLine(taps)));
  }

  setOffline(box, view.offline);
  return box;
}

function setOffline(box: HTMLElement, offline: boolean): void {
  const line = box.querySelector('.tap-offline');
  if (offline && !line) {
    const note = el('p', 'tap-offline', NO_SIGNAL_LINE);
    const see = box.querySelector('.tap-see-ticket');
    box.insertBefore(note, see);
  } else if (!offline && line) {
    line.remove();
  }
}

/** Slightly longer than the 300 ms clip, for when no animationend fires
 *  (reduced motion, or the slot is not on screen). */
const CLIP_WINDOW_MS = 350;

/** The clip plays once: the class comes off when it ends, so nothing that
 *  later re-inserts the slot can replay it. */
function markJustClipped(hole: HTMLElement): void {
  hole.classList.add('just-clipped');
  const clear = () => hole.classList.remove('just-clipped');
  hole.addEventListener('animationend', clear, { once: true });
  setTimeout(clear, CLIP_WINDOW_MS);
}

/**
 * One hole per train between the current rank and the next, the ones done
 * clipped. Before the second rank the row counts from no trains at all, so
 * the first five read as five holes towards Guard. None at the top rank.
 */
function renderHoles(taps: number, justClipped: boolean): HTMLElement | null {
  const { name, next } = levelFor(taps);
  if (!next) return null;
  const index = LEVELS.findIndex((l) => l.name === name);
  const from = index <= 0 ? 0 : LEVELS[index].taps;
  const total = next.taps - from;
  const done = taps - from;

  const row = el('div', 'tap-holes');
  row.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < total; i++) {
    const hole = el('span', 'tap-hole');
    if (i < done) hole.classList.add('clipped');
    if (i === done - 1) hole.classList.add('newest');
    if (justClipped && i === done - 1) markJustClipped(hole);
    row.appendChild(hole);
  }
  return row;
}

const ASK_BODY =
  "Our timings can be a little out. When the front of a train reaches you, tap its button and we'll tune this spot for everyone.";

/** The card below both direction cards, for `first` and `again` only. The
 *  other kinds used to draw a ticket strip; that job is the header badge's. */
export function renderAskCard(
  ask: AskKind,
  onChoice: (choice: 'helping' | 'declined') => void,
): HTMLElement | null {
  if (ask !== 'first' && ask !== 'again') return null;

  const card = el('section', 'ask-card');

  card.setAttribute('aria-labelledby', 'ask-card-heading');
  const heading = el('h2', 'ask-heading', 'Help make this spot-on');
  heading.id = 'ask-card-heading';
  card.appendChild(heading);
  card.appendChild(el('p', 'ask-body', ASK_BODY));

  const choices = el('div', 'ask-choices');
  const choice = (label: string, value: 'helping' | 'declined', className: string) => {
    const b = el('button', className, label);
    b.type = 'button';
    b.addEventListener('click', () => onChoice(value));
    choices.appendChild(b);
  };
  choice("I'll help", 'helping', 'ask-help');
  choice('Not now', 'declined', 'ask-decline');
  card.appendChild(choices);
  return card;
}
