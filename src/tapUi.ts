// The "train's here" screen pieces: the per-train button inside each direction
// panel, the register-style thank-you that replaces it, the ask card below the
// panels, and the card ticket that shows the parent's grade. Pure DOM builders;
// state lives in tapStore and is wired in main.ts.
import type { AskKind } from './tapStore';
import { levelFor, promotionFor, registerGapLine } from './tap';

export interface TapDirectionView {
  state: 'none' | 'button' | 'thanks';
  passKey: string | null;
  destination: string | null;
  /** Set in the 'thanks' state. */
  entry: { tapMs: number; predictedMs: number; tapsBefore: number } | null;
}

export interface TapView {
  ask: AskKind;
  taps: number;
  north: TapDirectionView;
  south: TapDirectionView;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local 24-hour HH:MM:SS, as a signal box register would write it. */
function clockTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
 * The slot for one direction: null, the button, or the thank-you. Returns
 * `existing` untouched while the pass, state and tap count are unchanged, so
 * the page's one-second redraw never loses a press or replays the clip.
 */
export function renderTapSlot(
  existing: HTMLElement | null,
  view: TapDirectionView,
  taps: number,
  onTap: (pressedAtMs: number) => void,
): HTMLElement | null {
  if (view.state === 'none' || view.passKey === null) return null;

  const tapsKey = view.state === 'thanks' ? String(taps) : '';
  if (
    existing
    && existing.dataset.passKey === view.passKey
    && existing.dataset.state === view.state
    && (existing.dataset.taps ?? '') === tapsKey
  ) {
    return existing;
  }

  let slot: HTMLElement;
  if (view.state === 'button') {
    slot = renderTapButton(view.destination ?? 'This', onTap);
  } else {
    // The hole is newly clipped only when this thank-you replaces the button
    // for the same train; shown fresh (after a reload) it stays still.
    const justClipped = existing?.dataset.state === 'button'
      && existing.dataset.passKey === view.passKey;
    slot = renderThanks(view, taps, justClipped);
    slot.dataset.taps = tapsKey;
  }
  slot.dataset.passKey = view.passKey;
  slot.dataset.state = view.state;
  return slot;
}

function renderTapButton(destination: string, onTap: (pressedAtMs: number) => void): HTMLElement {
  const button = el('button', 'tap-slot tap-button', `${destination} train is passing`);
  button.type = 'button';
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
    onTap(atMs);
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

function renderThanks(view: TapDirectionView, taps: number, justClipped: boolean): HTMLElement {
  const slot = el('div', 'tap-slot tap-thanks');
  slot.setAttribute('role', 'status');
  const entry = view.entry;
  const promotion = entry ? promotionFor(entry.tapsBefore, taps) : null;

  if (promotion) {
    slot.appendChild(el('p', 'tap-notice-head', 'Staff notice'));
    slot.appendChild(el('p', 'tap-heading', `Promoted to ${promotion.name}`));
    slot.appendChild(el(
      'p',
      'tap-notice-kit',
      `${promotion.kit} ${taps} ${taps === 1 ? 'train' : 'trains'} booked.`,
    ));
  } else {
    slot.appendChild(el('p', 'tap-heading', 'Booked in. Thank you.'));
  }

  if (entry) {
    const register = el('dl', 'tap-register');
    const row = (label: string, ms: number) => {
      const line = el('div', 'tap-register-row');
      line.appendChild(el('dt', 'tap-register-label', label));
      line.appendChild(el('dd', 'tap-register-time', clockTime(ms)));
      register.appendChild(line);
    };
    row('Booked', entry.tapMs);
    row('Predicted', entry.predictedMs);
    slot.appendChild(register);
    slot.appendChild(el('p', 'tap-gap', registerGapLine(entry.tapMs, entry.predictedMs)));
  }

  slot.appendChild(renderTicket(taps, justClipped));
  return slot;
}

const ASK_BODY =
  "Our timings can be a little out. When the front of a train reaches you, tap its button and we'll tune this spot for everyone.";

/** The card below both direction panels. `again` uses the `first` card. */
export function renderAskCard(
  ask: AskKind,
  taps: number,
  onChoice: (choice: 'helping' | 'declined') => void,
): HTMLElement | null {
  if (ask === null) return null;
  if (ask !== 'first' && ask !== 'again') return renderStrip(ask, taps, onChoice);

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

const STRIP_SUMMARY: Record<'ready' | 'invite' | 'off', string> = {
  ready: "Thanks, you're on the staff.",
  invite: 'Want to make it more accurate?',
  off: 'Help tune this spot',
};

const STRIP_HOW =
  "When a train is 30 seconds away, a button appears under its countdown. Tap it as the front of the train reaches you, and we'll tune this spot for everyone.";

/**
 * The permanent strip below the panels once the ask has been answered: the
 * ticket, and inside it how the buttons work and the switch for them. It is a
 * <details>, so it opens without script and keeps its state across redraws.
 * It starts closed; render.ts opens it when it has just replaced an answer.
 */
function renderStrip(
  kind: 'ready' | 'invite' | 'off',
  taps: number,
  onChoice: (choice: 'helping' | 'declined') => void,
): HTMLElement {
  const card = el('details', 'ask-card ask-strip');

  const summary = el('summary', 'ask-strip-summary');
  summary.appendChild(el('span', 'ask-invite', STRIP_SUMMARY[kind]));
  if (kind !== 'off' || taps > 0) summary.appendChild(renderTicket(taps, false));
  card.appendChild(summary);

  const body = el('div', 'ask-strip-body');
  body.appendChild(el('p', 'ask-body', STRIP_HOW));
  if (taps > 0) {
    body.appendChild(el('p', 'ask-count', `${taps} ${taps === 1 ? 'train' : 'trains'} booked.`));
  }
  const off = kind === 'off';
  const button = el('button', off ? 'ask-help' : 'ask-decline', off ? "I'll help" : 'Stop showing me buttons');
  button.type = 'button';
  button.addEventListener('click', () => onChoice(off ? 'helping' : 'declined'));
  body.appendChild(button);
  card.appendChild(body);
  return card;
}

/** Slightly longer than the 300 ms clip, for when no animationend fires
 *  (reduced motion, or the ticket is not on screen). */
const CLIP_WINDOW_MS = 350;

/** The clip plays once: the class comes off when it ends, so nothing that
 *  later re-inserts the ticket can replay it. */
function markJustClipped(hole: HTMLElement): void {
  hole.classList.add('just-clipped');
  const clear = () => hole.classList.remove('just-clipped');
  hole.addEventListener('animationend', clear, { once: true });
  setTimeout(clear, CLIP_WINDOW_MS);
}

/**
 * An old card railway ticket: the grade, and one hole per tap needed for the
 * next grade. At the top grade there is no next grade, so no holes.
 * `justClipped` gives the newest clipped hole the clip movement.
 */
export function renderTicket(taps: number, justClipped: boolean): HTMLElement {
  const level = levelFor(taps);
  const grade = level.name ?? 'No grade yet';

  const ticket = el('div', 'ticket');
  ticket.setAttribute('role', 'img');
  ticket.setAttribute(
    'aria-label',
    level.next
      ? `${grade}. ${level.stepsDone} of ${level.stepsTotal} taps to ${level.next.name}`
      : grade,
  );

  const head = el('div', 'ticket-head');
  head.setAttribute('aria-hidden', 'true');
  head.appendChild(el('span', 'ticket-issuer', 'E17 Trains'));
  head.appendChild(el('span', 'ticket-kind', 'Staff'));
  ticket.appendChild(head);

  const gradeEl = el('div', 'ticket-grade', grade);
  gradeEl.setAttribute('aria-hidden', 'true');
  ticket.appendChild(gradeEl);

  if (level.next && level.stepsTotal > 0) {
    const holes = el('div', 'ticket-holes');
    holes.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < level.stepsTotal; i++) {
      const hole = el('span', 'ticket-hole');
      if (i < level.stepsDone) hole.classList.add('clipped');
      if (justClipped && i === level.stepsDone - 1) markJustClipped(hole);
      holes.appendChild(hole);
    }
    ticket.appendChild(holes);

    const toNext = el('div', 'ticket-next', `To ${level.next.name}`);
    toNext.setAttribute('aria-hidden', 'true');
    ticket.appendChild(toNext);
  }

  return ticket;
}
