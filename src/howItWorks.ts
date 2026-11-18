// How it works: two pages in one screen. Page 1 explains the yellow button,
// page 2 shows the ticket and the ranks. Rebuilt on every page change; the
// caller paints it once per visit.
import { LEVELS } from './tap';

export interface HowHandlers {
  onCountMeIn(): void;
  onNotNow(): void;
  onBack(): void;
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

const CLOSE_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M4 4 L16 16 M16 4 L4 16"/></svg>';
const BACK_ICON = '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 3 L5 9 L11 15"/></svg>';
const NEXT_ICON = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3 L13 9 L7 15"/></svg>';

// The train reaching the pin: the front of the train meets "You".
const PASSING_SVG = '<svg class="how-art" width="220" height="56" viewBox="0 0 220 56" aria-hidden="true">'
  + '<rect class="how-track" x="0" y="50" width="220" height="4" rx="2"/>'
  + '<g transform="translate(72 19) scale(0.62)"><path class="how-train-body" d="M4 12 H90 Q106 12 113 27 L116 36 Q116 41 111 41 H4 Z" stroke-width="2.5" stroke-linejoin="round"/><path class="how-train-ink" d="M93 16 Q104 17 109 28 H95 Z"/><rect class="how-train-ink" x="10" y="17" width="78" height="10" rx="3"/><rect class="how-train-line" x="26" y="15" width="10" height="23" rx="1.5" stroke-width="1.5"/><rect class="how-train-line" x="62" y="15" width="10" height="23" rx="1.5" stroke-width="1.5"/><rect class="how-train-stripe" x="4" y="33" width="112" height="4"/><circle class="how-train-lamp" cx="111" cy="33" r="2.6"/><path class="how-train-pan" d="M40 12 L47 5 L54 12 M43 5 H51" fill="none" stroke-width="2" stroke-linecap="round"/><rect class="how-train-ink" x="10" y="40" width="26" height="5" rx="2"/><rect class="how-train-ink" x="74" y="40" width="26" height="5" rx="2"/></g>'
  + '<path class="how-pin" d="M150 48 C146 42 139 35 139 27 A11 11 0 0 1 161 27 C161 35 154 42 150 48 Z" stroke-width="2"/><circle class="how-pin-dot" cx="150" cy="27" r="4"/>'
  + '<text class="how-pin-label" x="166" y="22" font-size="13" font-weight="800">You</text></svg>';

function topBar(page: 1 | 2, go: (p: 1 | 2) => void, handlers: HowHandlers): HTMLElement {
  const bar = el('div', 'how-bar');
  if (page === 2) {
    const back = el('button', 'how-back');
    back.type = 'button';
    back.innerHTML = BACK_ICON;
    back.append('Back');
    back.addEventListener('click', () => go(1));
    bar.append(back);
  }
  bar.append(el('span', 'how-count', `${page} of 2`));
  const close = el('button', 'how-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.innerHTML = CLOSE_ICON;
  close.addEventListener('click', () => handlers.onBack());
  bar.append(close);
  return bar;
}

function step(n: number, title: string, ...rest: HTMLElement[]): HTMLElement {
  const wrap = el('div', 'how-step');
  const body = el('div', 'how-step-body');
  body.append(el('span', 'how-step-title', title), ...rest);
  wrap.append(el('span', 'how-step-num', String(n)), body);
  return wrap;
}

function pageOne(go: (p: 1 | 2) => void, handlers: HowHandlers): HTMLElement[] {
  const head = el('div', 'how-head');
  head.append(
    el('span', 'how-new', 'New'),
    el('h1', 'how-title', 'Help us time the trains'),
    el('p', 'how-lede', "Our times can be a few seconds out. You're right here, so you can help put them right."),
  );
  const art = el('span');
  art.innerHTML = PASSING_SVG;
  const steps = el('div', 'how-steps');
  steps.append(
    step(
      1,
      'Watch for the yellow button',
      el('span', 'how-step-text', 'It pops up about 30 seconds before a train arrives.'),
      el('span', 'how-demo', 'Tap as the train passes'),
    ),
    step(
      2,
      'Tap it as the front of the train reaches you',
      art.firstElementChild as HTMLElement,
      el('span', 'how-step-text', 'Just once is plenty.'),
    ),
    step(
      3,
      "Everyone's taps make the times better",
      el('span', 'how-step-text', 'The more people tap, the better it gets for every family here.'),
    ),
  );
  const next = el('button', 'how-primary', 'Next: your ticket');
  next.type = 'button';
  next.insertAdjacentHTML('beforeend', NEXT_ICON);
  next.addEventListener('click', () => go(2));
  const notNow = el('button', 'how-secondary', 'Not now');
  notNow.type = 'button';
  notNow.addEventListener('click', () => handlers.onNotNow());
  return [head, steps, el('div', 'how-spacer'), next, notNow];
}

function pageTwo(handlers: HowHandlers): HTMLElement[] {
  const head = el('div', 'how-head');
  head.append(
    el('h1', 'how-title', 'Every train you time clips your ticket'),
    el('p', 'how-lede', 'Time more trains to move up the ranks, from Spotter to Station Master.'),
  );

  const ticket = el('div', 'how-ticket');
  ticket.setAttribute('aria-hidden', 'true');
  const dots = el('div', 'how-ticket-dots');
  for (let i = 0; i < 5; i++) dots.append(el('span', i === 0 ? 'how-dot filled' : 'how-dot'));
  ticket.append(
    el('span', 'how-ticket-kicker', 'E17 TRAINS · TRAIN TIMER'),
    el('span', 'how-ticket-rank', LEVELS[0].name),
    dots,
    el('span', 'how-ticket-line', `Your first train makes you a ${LEVELS[0].name}.`),
  );

  const ranks = el('ul', 'how-ranks');
  ranks.setAttribute('aria-label', 'The ranks');
  LEVELS.forEach((l) => {
    const li = el('li', 'how-rank');
    li.append(el('span', 'how-rank-name', l.name), el('span', 'how-rank-note', `${l.taps} ${l.taps === 1 ? 'train' : 'trains'}`));
    ranks.append(li);
  });
  const ranksWrap = el('div', 'how-ranks-wrap');
  ranksWrap.append(el('span', 'how-ranks-title', 'The ranks'), ranks);

  const yes = el('button', 'how-primary', 'Count me in');
  yes.type = 'button';
  yes.addEventListener('click', () => handlers.onCountMeIn());
  const notNow = el('button', 'how-secondary', 'Not now');
  notNow.type = 'button';
  notNow.addEventListener('click', () => handlers.onNotNow());
  return [
    head,
    ticket,
    ranksWrap,
    el('p', 'how-foot', 'No account needed. Your ticket lives on this phone.'),
    el('div', 'how-spacer'),
    yes,
    notNow,
  ];
}

export function renderHowItWorks(root: HTMLElement, raw: HowHandlers): void {
  // Only one way out per visit: the buttons stay in the DOM until the browser
  // has gone back, so a quick second tap must not go back again.
  let left = false;
  const once = (fn: () => void) => (): void => {
    if (left) return;
    left = true;
    fn();
  };
  const handlers: HowHandlers = {
    onCountMeIn: once(raw.onCountMeIn),
    onNotNow: once(raw.onNotNow),
    onBack: once(raw.onBack),
  };
  const paint = (page: 1 | 2, moveFocus: boolean): void => {
    const go = (p: 1 | 2): void => paint(p, true);
    const sheet = el('section', 'how-sheet');
    sheet.append(topBar(page, go, handlers), ...(page === 1 ? pageOne(go, handlers) : pageTwo(handlers)));
    root.replaceChildren(sheet);
    if (moveFocus) {
      const h1 = sheet.querySelector('h1')!;
      h1.tabIndex = -1;
      h1.focus();
    }
  };
  paint(1, false);
}
