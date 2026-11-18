import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  renderTapSlot,
  renderAskCard,
  type TapDirectionView,
} from '../src/tapUi';
import { NO_SIGNAL_LINE, progressLine } from '../src/tapCopy';

const TAP_MS = 1_800_000_000_000;
const PREDICTED_MS = TAP_MS + 12_000;

const BASE: TapDirectionView = {
  state: 'none',
  passKey: null,
  destination: null,
  entry: null,
  msUntilButton: null,
  offline: false,
};

function buttonView(passKey = 'east-ave|north|1000'): TapDirectionView {
  return { ...BASE, state: 'button', passKey, destination: 'Chingford' };
}

function placeholderView(msUntilButton: number): TapDirectionView {
  return { ...BASE, state: 'placeholder', msUntilButton };
}

function thanksView(tapsBefore: number, offline = false, passKey = 'east-ave|north|1000'): TapDirectionView {
  return {
    ...BASE,
    state: 'thanks',
    passKey,
    destination: 'Chingford',
    entry: { tapMs: TAP_MS, predictedMs: PREDICTED_MS, tapsBefore },
    offline,
  };
}

const noop = () => {};
const handlers = (over: Partial<{ onTap: (ms: number) => void; onOpenTicket: () => void }> = {}) => ({
  onTap: noop,
  onOpenTicket: noop,
  ...over,
});

describe('renderTapSlot', () => {
  it('returns null for none', () => {
    expect(renderTapSlot(null, BASE, handlers())).toBeNull();
  });

  it('placeholder: a dashed box saying when the button comes', () => {
    const el = renderTapSlot(null, placeholderView(300_000), handlers())!;
    expect(el.classList.contains('tap-slot')).toBe(true);
    const box = el.querySelector('.tap-placeholder')!;
    expect(box.textContent).toBe('Yellow button pops up here in 5 min');
    expect(el.querySelector('.tap-button')).toBeNull();
  });

  it('placeholder updates its minutes in place, keeping the element', () => {
    const first = renderTapSlot(null, placeholderView(300_000), handlers())!;
    const next = renderTapSlot(first, placeholderView(170_000), handlers())!;
    expect(next).toBe(first);
    expect(next.textContent).toBe('Yellow button pops up here in 2 min');
  });

  it('button state is the big yellow button', () => {
    const el = renderTapSlot(null, buttonView(), handlers())!;
    const button = el.querySelector<HTMLButtonElement>('button.tap-button')!;
    expect(button).not.toBeNull();
    expect(button.textContent).toContain('Tap as the train passes');
    expect(button.textContent).toContain('when the front reaches you');
  });

  it('the button replaces the placeholder in the same slot element', () => {
    const placeholder = renderTapSlot(null, placeholderView(60_000), handlers())!;
    const button = renderTapSlot(placeholder, buttonView(), handlers())!;
    expect(button.querySelector('.tap-button')).not.toBeNull();
    expect(button.querySelector('.tap-placeholder')).toBeNull();
  });

  it('thanks: "Got it. Ticket clipped." and the progress line', () => {
    const el = renderTapSlot(null, thanksView(2), handlers())!;
    const text = el.textContent ?? '';
    expect(el.querySelector('[role="status"]')).not.toBeNull();
    expect(el.querySelector('.tap-tick svg')).not.toBeNull();
    expect(el.querySelector('.tap-holes')).toBeNull();
    expect(text).toContain('Got it. Ticket clipped.');
    expect(text).toContain(progressLine(3));
    expect(text).not.toContain(NO_SIGNAL_LINE);
    expect(text).not.toContain('Undo');
    expect(text).not.toContain('!');
  });

  it('thanks offline: adds the no-signal line', () => {
    const el = renderTapSlot(null, thanksView(2, true), handlers())!;
    const text = el.textContent ?? '';
    expect(text).toContain('Ticket clipped');
    expect(text).toContain(NO_SIGNAL_LINE);
  });

  it('a send that fails after the thank-you shows adds the line in place', () => {
    const sent = renderTapSlot(null, thanksView(2), handlers())!;
    const status = sent.querySelector('[role="status"]');
    const failed = renderTapSlot(sent, thanksView(2, true), handlers())!;
    expect(failed).toBe(sent);
    expect(failed.querySelector('[role="status"]')).toBe(status);
    expect(failed.textContent).toContain(NO_SIGNAL_LINE);
  });

  it('thanks crossing 5 taps: the rank-up words and a "See my ticket" control', () => {
    const onOpenTicket = vi.fn();
    const el = renderTapSlot(null, thanksView(4), handlers({ onOpenTicket }))!;
    const text = el.textContent ?? '';
    expect(text).toContain('Promoted to Guard.');
    expect(text).toContain("Ten more and you're a Signaller.");
    expect(text).not.toContain('Got it. Ticket clipped.');
    expect(text).not.toContain('Undo');
    // A text link to the ticket's own address, opened in the app.
    const see = el.querySelector<HTMLAnchorElement>('a.tap-see-ticket')!;
    expect(see.textContent).toBe('See my ticket');
    expect(see.getAttribute('href')).toBe('/ticket');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    see.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(onOpenTicket).toHaveBeenCalledTimes(1);
  });

  it('rank-up at the top rank shows the kit in place of the next rank', () => {
    const text = renderTapSlot(null, thanksView(59), handlers())!.textContent ?? '';
    expect(text).toContain('Promoted to Station Master.');
    expect(text).toContain('Top hat optional.');
    expect(text).not.toContain('more and you');
  });

  it('rank-up offline: the no-signal line stands in for the next rank', () => {
    const el = renderTapSlot(null, thanksView(4, true), handlers())!;
    expect(el.textContent).toContain('Promoted to Guard.');
    expect(el.textContent).toContain(NO_SIGNAL_LINE);
    expect(el.querySelector<HTMLElement>('.tap-next')!.hidden).toBe(true);
    expect(el.querySelector('.tap-see-ticket')).not.toBeNull();
  });

  it('a thank-you is drawn from its own tap, not the global count', () => {
    // This card's tap was the 4th; it reads 4 whatever happens elsewhere.
    const el = renderTapSlot(null, thanksView(3), handlers())!;
    expect(el.textContent).toContain(progressLine(4));
    const status = el.querySelector('[role="status"]');
    expect(renderTapSlot(el, thanksView(3), handlers())!.querySelector('[role="status"]')).toBe(status);
  });

  it('keeps the same element for the same passKey and state', () => {
    const first = renderTapSlot(null, buttonView(), handlers());
    const again = renderTapSlot(first, buttonView(), handlers());
    expect(again).toBe(first);

    const thanks = renderTapSlot(null, thanksView(2), handlers());
    expect(renderTapSlot(thanks, thanksView(2), handlers())).toBe(thanks);
  });

  it('a new passKey gives a new button', () => {
    const first = renderTapSlot(null, buttonView('a'), handlers())!;
    const firstButton = first.querySelector('.tap-button');
    const next = renderTapSlot(first, buttonView('b'), handlers())!;
    expect(next.querySelector('.tap-button')).not.toBe(firstButton);
  });

  describe('booking a press', () => {
    const PRESS_MS = 1_800_000_000_000;

    function pointer(type: string, init: PointerEventInit = {}): PointerEvent {
      return new PointerEvent(type, { bubbles: true, button: 0, isPrimary: true, ...init });
    }
    const button = (onTap: (ms: number) => void) =>
      renderTapSlot(null, buttonView(), handlers({ onTap }))!.querySelector<HTMLButtonElement>('.tap-button')!;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(PRESS_MS);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('books on release with the press time, once, ignoring the follow-up click', () => {
      const onTap = vi.fn();
      const el = button(onTap);
      el.dispatchEvent(pointer('pointerdown'));
      expect(onTap).not.toHaveBeenCalled();
      vi.setSystemTime(PRESS_MS + 400);
      el.dispatchEvent(pointer('pointerup'));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      expect(onTap).toHaveBeenCalledTimes(1);
      expect(onTap).toHaveBeenCalledWith(PRESS_MS);
    });

    it('books nothing when the press is cancelled (a scroll)', () => {
      const onTap = vi.fn();
      const el = button(onTap);
      el.dispatchEvent(pointer('pointerdown'));
      el.dispatchEvent(pointer('pointercancel'));
      el.dispatchEvent(pointer('pointerup'));
      expect(onTap).not.toHaveBeenCalled();
      expect(el.classList.contains('pressed')).toBe(false);
    });

    it('books nothing when the pointer leaves the button before release', () => {
      const onTap = vi.fn();
      const el = button(onTap);
      el.dispatchEvent(pointer('pointerdown'));
      el.dispatchEvent(pointer('pointerleave', { bubbles: false }));
      el.dispatchEvent(pointer('pointerup'));
      expect(onTap).not.toHaveBeenCalled();
    });

    it('books nothing for a non-primary button or pointer', () => {
      const onTap = vi.fn();
      const el = button(onTap);
      el.dispatchEvent(pointer('pointerdown', { button: 2 }));
      el.dispatchEvent(pointer('pointerup', { button: 2 }));
      el.dispatchEvent(pointer('pointerdown', { isPrimary: false }));
      el.dispatchEvent(pointer('pointerup', { isPrimary: false }));
      expect(onTap).not.toHaveBeenCalled();
    });

    it('a keyboard click (no pointerdown) books the train once, at the click time', () => {
      const onTap = vi.fn();
      const el = button(onTap);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(onTap).toHaveBeenCalledTimes(1);
      expect(onTap).toHaveBeenCalledWith(PRESS_MS);
    });

    it('a keyboard activation after an abandoned pointer press still books', () => {
      const onTap = vi.fn();
      const el = button(onTap);
      el.dispatchEvent(pointer('pointerdown'));
      el.dispatchEvent(pointer('pointerleave', { bubbles: false }));
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(onTap).toHaveBeenCalledTimes(1);
    });

    it('vibrates on the commit, not the press', () => {
      const vibrate = vi.fn();
      Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
      try {
        const el = button(noop);
        el.dispatchEvent(pointer('pointerdown'));
        expect(vibrate).not.toHaveBeenCalled();
        el.dispatchEvent(pointer('pointerup'));
        expect(vibrate).toHaveBeenCalledTimes(1);
      } finally {
        delete (navigator as unknown as Record<string, unknown>).vibrate;
      }
    });
  });

  // The holes row moved to the ticket page so the thank-you fits the slot.
  it('the thank-you and rank-up carry no ticket holes', () => {
    const button = renderTapSlot(null, buttonView(), handlers());
    const thanks = renderTapSlot(button, thanksView(1), handlers())!;
    expect(thanks.querySelector('.tap-holes, .tap-hole, .just-clipped')).toBeNull();
    expect(renderTapSlot(null, thanksView(4), handlers())!.querySelector('.tap-hole')).toBeNull();
  });
});

describe('renderAskCard', () => {
  const handlers = () => ({ onChoice: vi.fn(), onOpenHow: vi.fn() });

  it('is null when there is nothing to ask', () => {
    expect(renderAskCard(null, handlers())).toBeNull();
  });

  it.each(['first', 'again'] as const)('%s: the board 1 invitation', (kind) => {
    const card = renderAskCard(kind, handlers())!;
    expect(card.querySelector('h2')!.textContent).toBe('Fancy timing a train?');
    expect(card.textContent).toContain("Tap as it passes and you'll help make this countdown spot-on.");
    const how = card.querySelector<HTMLAnchorElement>('a.ask-how')!;
    expect(how.textContent).toBe('Show me how');
    expect(how.getAttribute('href')).toBe('/how-it-works');
    const no = card.querySelector<HTMLButtonElement>('button.ask-decline')!;
    expect(no.textContent).toBe('No thanks');
    expect(card.textContent).not.toMatch(/!/);
  });

  it('"Show me how" opens the explainer in place; "No thanks" declines', () => {
    const h = handlers();
    const card = renderAskCard('first', h)!;
    const how = card.querySelector<HTMLAnchorElement>('a.ask-how')!;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    how.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(h.onOpenHow).toHaveBeenCalledTimes(1);
    expect(h.onChoice).not.toHaveBeenCalled();
    card.querySelector<HTMLButtonElement>('button.ask-decline')!.click();
    expect(h.onChoice).toHaveBeenCalledWith('declined');
  });

  it('"Show me how" with a modifier is left to the browser', () => {
    const h = handlers();
    const how = renderAskCard('again', h)!.querySelector<HTMLAnchorElement>('a.ask-how')!;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true });
    how.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(h.onOpenHow).not.toHaveBeenCalled();
  });

  // The old ticket strip under the panels is gone: its job is the header badge.
  it.each(['ready', 'invite', 'off'] as const)('%s: no strip under the cards', (kind) => {
    expect(renderAskCard(kind, handlers())).toBeNull();
  });
});
