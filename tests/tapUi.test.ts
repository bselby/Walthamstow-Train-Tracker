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
    expect(renderTapSlot(null, BASE, 0, handlers())).toBeNull();
  });

  it('placeholder: a dashed box saying when the button comes', () => {
    const el = renderTapSlot(null, placeholderView(300_000), 0, handlers())!;
    expect(el.classList.contains('tap-slot')).toBe(true);
    const box = el.querySelector('.tap-placeholder')!;
    expect(box.textContent).toBe('Yellow button pops up here in 5 min');
    expect(el.querySelector('.tap-button')).toBeNull();
  });

  it('placeholder updates its minutes in place, keeping the element', () => {
    const first = renderTapSlot(null, placeholderView(300_000), 0, handlers())!;
    const next = renderTapSlot(first, placeholderView(170_000), 0, handlers())!;
    expect(next).toBe(first);
    expect(next.textContent).toBe('Yellow button pops up here in 3 min');
  });

  it('button state is the big yellow button', () => {
    const el = renderTapSlot(null, buttonView(), 0, handlers())!;
    const button = el.querySelector<HTMLButtonElement>('button.tap-button')!;
    expect(button).not.toBeNull();
    expect(button.textContent).toContain('Tap as the train passes');
    expect(button.textContent).toContain('when the front reaches you');
  });

  it('the button replaces the placeholder in the same slot element', () => {
    const placeholder = renderTapSlot(null, placeholderView(60_000), 0, handlers())!;
    const button = renderTapSlot(placeholder, buttonView(), 0, handlers())!;
    expect(button.querySelector('.tap-button')).not.toBeNull();
    expect(button.querySelector('.tap-placeholder')).toBeNull();
  });

  it('thanks: "Got it. Ticket clipped." and the progress line', () => {
    const el = renderTapSlot(null, thanksView(2), 3, handlers())!;
    const text = el.textContent ?? '';
    expect(el.querySelector('[role="status"]')).not.toBeNull();
    expect(text).toContain('Got it. Ticket clipped.');
    expect(text).toContain(progressLine(3));
    expect(text).not.toContain(NO_SIGNAL_LINE);
    expect(text).not.toContain('Undo');
    expect(text).not.toContain('!');
  });

  it('thanks offline: adds the no-signal line', () => {
    const el = renderTapSlot(null, thanksView(2, true), 3, handlers())!;
    const text = el.textContent ?? '';
    expect(text).toContain('Ticket clipped');
    expect(text).toContain(NO_SIGNAL_LINE);
  });

  it('a send that fails after the thank-you shows adds the line in place', () => {
    const sent = renderTapSlot(null, thanksView(2), 3, handlers())!;
    const status = sent.querySelector('[role="status"]');
    const failed = renderTapSlot(sent, thanksView(2, true), 3, handlers())!;
    expect(failed).toBe(sent);
    expect(failed.querySelector('[role="status"]')).toBe(status);
    expect(failed.textContent).toContain(NO_SIGNAL_LINE);
  });

  it('thanks crossing 5 taps: the rank-up words and a "See my ticket" control', () => {
    const onOpenTicket = vi.fn();
    const el = renderTapSlot(null, thanksView(4), 5, handlers({ onOpenTicket }))!;
    const text = el.textContent ?? '';
    expect(text).toContain('Promoted to Guard.');
    expect(text).toContain('Five trains timed. Whistle and flag at the ready.');
    expect(text).toContain("Ten more and you're a Signaller.");
    expect(text).not.toContain('Got it. Ticket clipped.');
    expect(text).not.toContain('Undo');
    const see = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'See my ticket')!;
    expect(see).toBeDefined();
    see.click();
    expect(onOpenTicket).toHaveBeenCalledTimes(1);
  });

  it('rank-up at the top rank has no next line', () => {
    const text = renderTapSlot(null, thanksView(59), 60, handlers())!.textContent ?? '';
    expect(text).toContain('Promoted to Station Master.');
    expect(text).not.toContain('more and you');
  });

  it('rank-up offline also carries the no-signal line', () => {
    const text = renderTapSlot(null, thanksView(4, true), 5, handlers())!.textContent ?? '';
    expect(text).toContain('Promoted to Guard.');
    expect(text).toContain(NO_SIGNAL_LINE);
  });

  it('keeps the same element for the same passKey and state', () => {
    const first = renderTapSlot(null, buttonView(), 0, handlers());
    const again = renderTapSlot(first, buttonView(), 0, handlers());
    expect(again).toBe(first);

    const thanks = renderTapSlot(null, thanksView(2), 3, handlers());
    expect(renderTapSlot(thanks, thanksView(2), 3, handlers())).toBe(thanks);
  });

  it('a new passKey gives a new button', () => {
    const first = renderTapSlot(null, buttonView('a'), 0, handlers())!;
    const firstButton = first.querySelector('.tap-button');
    const next = renderTapSlot(first, buttonView('b'), 0, handlers())!;
    expect(next.querySelector('.tap-button')).not.toBe(firstButton);
  });

  describe('booking a press', () => {
    const PRESS_MS = 1_800_000_000_000;

    function pointer(type: string, init: PointerEventInit = {}): PointerEvent {
      return new PointerEvent(type, { bubbles: true, button: 0, isPrimary: true, ...init });
    }
    const button = (onTap: (ms: number) => void) =>
      renderTapSlot(null, buttonView(), 0, handlers({ onTap }))!.querySelector<HTMLButtonElement>('.tap-button')!;

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

  describe('the ticket holes in the thank-you', () => {
    afterEach(() => vi.useRealTimers());

    it('one hole per train to the next rank, the ones done clipped', () => {
      // 4 taps: Spotter, 4 of the 5 trains to Guard.
      const el = renderTapSlot(null, thanksView(3), 4, handlers())!;
      expect(el.querySelectorAll('.tap-hole')).toHaveLength(5);
      expect(el.querySelectorAll('.tap-hole.clipped')).toHaveLength(4);
    });

    it('counts from the current rank once past the first', () => {
      // 7 taps: Guard, 2 of the 10 trains to Signaller.
      const el = renderTapSlot(null, thanksView(6), 7, handlers())!;
      expect(el.querySelectorAll('.tap-hole')).toHaveLength(10);
      expect(el.querySelectorAll('.tap-hole.clipped')).toHaveLength(2);
    });

    it('clips the newest hole only when the thank-you replaces the button', () => {
      const button = renderTapSlot(null, buttonView(), 1, handlers());
      const thanks = renderTapSlot(button, thanksView(1), 2, handlers())!;
      const marked = thanks.querySelectorAll('.tap-hole.just-clipped');
      expect(marked).toHaveLength(1);
      expect(marked[0]).toBe(thanks.querySelectorAll('.tap-hole.clipped')[1]);

      // Same thank-you on a later redraw: same element, so no replay.
      expect(renderTapSlot(thanks, thanksView(1), 2, handlers())).toBe(thanks);

      // Shown fresh (e.g. after a reload): no clip movement.
      const fresh = renderTapSlot(null, thanksView(1), 2, handlers())!;
      expect(fresh.querySelectorAll('.just-clipped')).toHaveLength(0);
    });

    it('drops the clip class once the animation window has passed, with no animationend', () => {
      vi.useFakeTimers();
      const button = renderTapSlot(null, buttonView(), 1, handlers());
      const thanks = renderTapSlot(button, thanksView(1), 2, handlers())!;
      expect(thanks.querySelector('.just-clipped')).not.toBeNull();
      vi.advanceTimersByTime(400);
      expect(thanks.querySelector('.just-clipped')).toBeNull();
      expect(thanks.querySelectorAll('.tap-hole.clipped')).toHaveLength(2);
    });

    it('drops the clip class on animationend', () => {
      const button = renderTapSlot(null, buttonView(), 1, handlers());
      const thanks = renderTapSlot(button, thanksView(1), 2, handlers())!;
      thanks.querySelector('.just-clipped')!.dispatchEvent(new Event('animationend'));
      expect(thanks.querySelector('.just-clipped')).toBeNull();
    });

    it('the holes are hidden from screen readers; the progress line says it', () => {
      const el = renderTapSlot(null, thanksView(2), 3, handlers())!;
      expect(el.querySelector('.tap-holes')!.getAttribute('aria-hidden')).toBe('true');
    });
  });
});

describe('renderAskCard', () => {
  it('is null when there is nothing to ask', () => {
    expect(renderAskCard(null, noop)).toBeNull();
  });

  it.each(['first', 'again'] as const)('%s: heading, body and two choices', (kind) => {
    const onChoice = vi.fn();
    const card = renderAskCard(kind, onChoice)!;
    expect(card.textContent).toContain('Help make this spot-on');
    expect(card.textContent).toContain('Our timings can be a little out.');
    const buttons = Array.from(card.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent)).toEqual(["I'll help", 'Not now']);
    buttons[0].click();
    expect(onChoice).toHaveBeenLastCalledWith('helping');
    buttons[1].click();
    expect(onChoice).toHaveBeenLastCalledWith('declined');
  });

  // The old ticket strip under the panels is gone: its job is the header badge.
  it.each(['ready', 'invite', 'off'] as const)('%s: no strip under the cards', (kind) => {
    expect(renderAskCard(kind, noop)).toBeNull();
  });
});
