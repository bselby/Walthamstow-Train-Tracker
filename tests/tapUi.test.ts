import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  renderTapSlot,
  renderAskCard,
  renderTicket,
  type TapDirectionView,
} from '../src/tapUi';
import { registerGapLine } from '../src/tap';

// Build times from local components so HH:MM:SS does not depend on the
// machine's timezone.
const TAP_MS = new Date(2026, 10, 17, 9, 5, 7).getTime();
const PREDICTED_MS = new Date(2026, 10, 17, 9, 5, 19).getTime();

function buttonView(passKey = 'east-ave|north|1000'): TapDirectionView {
  return { state: 'button', passKey, destination: 'Chingford', entry: null };
}

function thanksView(tapsBefore: number, passKey = 'east-ave|north|1000'): TapDirectionView {
  return {
    state: 'thanks',
    passKey,
    destination: 'Chingford',
    entry: { tapMs: TAP_MS, predictedMs: PREDICTED_MS, tapsBefore },
  };
}

const noop = () => {};

describe('renderTapSlot', () => {
  it('returns null for none', () => {
    const view: TapDirectionView = { state: 'none', passKey: null, destination: null, entry: null };
    expect(renderTapSlot(null, view, 0, noop)).toBeNull();
  });

  it('button state is a button reading "<destination> train is passing"', () => {
    const el = renderTapSlot(null, buttonView(), 0, noop)!;
    expect(el.tagName).toBe('BUTTON');
    expect(el.textContent).toBe('Chingford train is passing');
  });

  it('thanks state shows the register entry and the ticket', () => {
    const el = renderTapSlot(null, thanksView(2), 3, noop)!;
    const text = el.textContent ?? '';
    expect(text).toContain('Booked in. Thank you.');
    expect(text).toContain('09:05:07');
    expect(text).toContain('09:05:19');
    expect(text).toContain(registerGapLine(TAP_MS, PREDICTED_MS));
    expect(el.querySelector('.ticket')).not.toBeNull();
    expect(text).not.toContain('Staff notice');
  });

  it('thanks state on a promotion shows a staff notice instead of the plain heading', () => {
    const el = renderTapSlot(null, thanksView(4), 5, noop)!;
    const text = el.textContent ?? '';
    expect(text).toContain('Staff notice');
    expect(text).toContain('Promoted to Guard');
    expect(text).toContain('Whistle issued');
    expect(text).not.toContain('Booked in. Thank you.');
    expect(el.querySelector('.ticket')).not.toBeNull();
  });

  it('keeps the same element for the same passKey and state', () => {
    const first = renderTapSlot(null, buttonView(), 0, noop);
    const again = renderTapSlot(first, buttonView(), 0, noop);
    expect(again).toBe(first);

    const thanks = renderTapSlot(null, thanksView(2), 3, noop);
    expect(renderTapSlot(thanks, thanksView(2), 3, noop)).toBe(thanks);
  });

  it('a new passKey gives a new element', () => {
    const first = renderTapSlot(null, buttonView('a'), 0, noop);
    const next = renderTapSlot(first, buttonView('b'), 0, noop);
    expect(next).not.toBe(first);
    expect(next!.textContent).toBe('Chingford train is passing');
  });

  describe('booking a press', () => {
    const PRESS_MS = 1_800_000_000_000;

    function pointer(type: string, init: PointerEventInit = {}): PointerEvent {
      return new PointerEvent(type, { bubbles: true, button: 0, isPrimary: true, ...init });
    }

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(PRESS_MS);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('books on release with the press time, once, ignoring the follow-up click', () => {
      const onTap = vi.fn();
      const el = renderTapSlot(null, buttonView(), 0, onTap)!;
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
      const el = renderTapSlot(null, buttonView(), 0, onTap)!;
      el.dispatchEvent(pointer('pointerdown'));
      el.dispatchEvent(pointer('pointercancel'));
      el.dispatchEvent(pointer('pointerup'));
      expect(onTap).not.toHaveBeenCalled();
      expect(el.classList.contains('pressed')).toBe(false);
    });

    it('books nothing when the pointer leaves the button before release', () => {
      const onTap = vi.fn();
      const el = renderTapSlot(null, buttonView(), 0, onTap)!;
      el.dispatchEvent(pointer('pointerdown'));
      el.dispatchEvent(pointer('pointerleave', { bubbles: false }));
      el.dispatchEvent(pointer('pointerup'));
      expect(onTap).not.toHaveBeenCalled();
    });

    it('books nothing for a non-primary button or pointer', () => {
      const onTap = vi.fn();
      const el = renderTapSlot(null, buttonView(), 0, onTap)!;
      el.dispatchEvent(pointer('pointerdown', { button: 2 }));
      el.dispatchEvent(pointer('pointerup', { button: 2 }));
      el.dispatchEvent(pointer('pointerdown', { isPrimary: false }));
      el.dispatchEvent(pointer('pointerup', { isPrimary: false }));
      expect(onTap).not.toHaveBeenCalled();
    });

    it('a keyboard click (no pointerdown) books the train once, at the click time', () => {
      const onTap = vi.fn();
      const el = renderTapSlot(null, buttonView(), 0, onTap)!;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(onTap).toHaveBeenCalledTimes(1);
      expect(onTap).toHaveBeenCalledWith(PRESS_MS);
    });

    it('a keyboard activation after an abandoned pointer press still books', () => {
      const onTap = vi.fn();
      const el = renderTapSlot(null, buttonView(), 0, onTap)!;
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
        const el = renderTapSlot(null, buttonView(), 0, noop)!;
        el.dispatchEvent(pointer('pointerdown'));
        expect(vibrate).not.toHaveBeenCalled();
        el.dispatchEvent(pointer('pointerup'));
        expect(vibrate).toHaveBeenCalledTimes(1);
      } finally {
        delete (navigator as unknown as Record<string, unknown>).vibrate;
      }
    });
  });

  it('clips the new hole only when the thank-you replaces the button', () => {
    const button = renderTapSlot(null, buttonView(), 1, noop);
    const thanks = renderTapSlot(button, thanksView(1), 2, noop)!;
    expect(thanks.querySelectorAll('.ticket-hole.just-clipped')).toHaveLength(1);

    // Same thank-you on a later redraw: same element, so no replay.
    expect(renderTapSlot(thanks, thanksView(1), 2, noop)).toBe(thanks);

    // Shown fresh (e.g. after a reload): no clip movement.
    const fresh = renderTapSlot(null, thanksView(1), 2, noop)!;
    expect(fresh.querySelectorAll('.ticket-hole.just-clipped')).toHaveLength(0);
  });
});

describe('renderTapSlot clip window', () => {
  afterEach(() => vi.useRealTimers());

  it('drops the clip class once the animation window has passed, with no animationend', () => {
    vi.useFakeTimers();
    const button = renderTapSlot(null, buttonView(), 1, noop);
    const thanks = renderTapSlot(button, thanksView(1), 2, noop)!;
    expect(thanks.querySelector('.just-clipped')).not.toBeNull();
    vi.advanceTimersByTime(400);
    expect(thanks.querySelector('.just-clipped')).toBeNull();
    expect(thanks.querySelectorAll('.ticket-hole.clipped')).toHaveLength(1);
  });

  it('drops the clip class on animationend', () => {
    const button = renderTapSlot(null, buttonView(), 1, noop);
    const thanks = renderTapSlot(button, thanksView(1), 2, noop)!;
    thanks.querySelector('.just-clipped')!.dispatchEvent(new Event('animationend'));
    expect(thanks.querySelector('.just-clipped')).toBeNull();
  });
});

describe('renderAskCard', () => {
  it('is null when there is nothing to ask', () => {
    expect(renderAskCard(null, 0, noop)).toBeNull();
  });

  it.each(['first', 'again'] as const)('%s: heading, body and two choices', (kind) => {
    const onChoice = vi.fn();
    const card = renderAskCard(kind, 0, onChoice)!;
    expect(card.textContent).toContain('Help make this spot-on');
    expect(card.textContent).toContain('Our timings can be a little out.');
    const buttons = Array.from(card.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent)).toEqual(["I'll help", 'Not now']);
    buttons[0].click();
    expect(onChoice).toHaveBeenLastCalledWith('helping');
    buttons[1].click();
    expect(onChoice).toHaveBeenLastCalledWith('declined');
  });

  it('invite: one line and the ticket, no "Not now"', () => {
    const card = renderAskCard('invite', 3, noop)!;
    expect(card.textContent).toContain('Want to make it more accurate?');
    expect(card.querySelector('.ticket')).not.toBeNull();
    expect(card.textContent).not.toContain('Not now');
  });
});

describe('renderTicket', () => {
  it('shows the grade, the holes for the next grade and an accessible label', () => {
    const t = renderTicket(2, false);
    expect(t.querySelector('.ticket-grade')!.textContent).toBe('Spotter');
    expect(t.querySelectorAll('.ticket-hole')).toHaveLength(4);
    expect(t.querySelectorAll('.ticket-hole.clipped')).toHaveLength(1);
    expect(t.getAttribute('aria-label')).toBe('Spotter. 1 of 4 taps to Guard');
    expect(t.querySelector('.just-clipped')).toBeNull();
  });

  it('top grade: the grade and no holes', () => {
    const t = renderTicket(75, false);
    expect(t.querySelector('.ticket-grade')!.textContent).toBe('Station Master');
    expect(t.querySelectorAll('.ticket-hole')).toHaveLength(0);
    expect(t.getAttribute('aria-label')).toBe('Station Master');
  });

  it('justClipped marks the newest clipped hole with the clip class', () => {
    const t = renderTicket(2, true);
    const marked = t.querySelectorAll('.ticket-hole.just-clipped');
    expect(marked).toHaveLength(1);
    expect(marked[0].classList.contains('clipped')).toBe(true);
  });

  it('justClipped marks only the newest of several clipped holes', () => {
    const t = renderTicket(3, true);
    const clipped = t.querySelectorAll('.ticket-hole.clipped');
    expect(clipped).toHaveLength(2);
    const marked = t.querySelectorAll('.ticket-hole.just-clipped');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toBe(clipped[1]);
  });

  it('justClipped on a fresh ticket (just promoted) marks nothing', () => {
    const t = renderTicket(5, true);
    expect(t.querySelector('.ticket-grade')!.textContent).toBe('Guard');
    expect(t.querySelectorAll('.ticket-hole.clipped')).toHaveLength(0);
    expect(t.querySelector('.just-clipped')).toBeNull();
  });
});

describe('the ticket strip', () => {
  const strip = (kind: 'ready' | 'invite' | 'off', taps: number, onChoice = () => {}) =>
    renderAskCard(kind, taps, onChoice) as HTMLDetailsElement;

  it('ready: thanks, an empty ticket, and the how-it-works text inside', () => {
    const card = strip('ready', 0);
    expect(card.tagName).toBe('DETAILS');
    expect(card.open).toBe(false);
    expect(card.querySelector('summary')!.textContent).toContain("Thanks, you're on the staff.");
    expect(card.querySelector('summary .ticket')).not.toBeNull();
    expect(card.textContent).toContain('30 seconds away');
  });

  it('invite: closed, with the ticket in the summary and the count inside', () => {
    const card = strip('invite', 3);
    expect(card.tagName).toBe('DETAILS');
    expect(card.open).toBe(false);
    expect(card.querySelector('summary .ticket')).not.toBeNull();
    expect(card.textContent).toContain('3 trains booked.');
    expect(card.textContent).toContain('30 seconds away');
  });

  it('counts one train in the singular', () => {
    expect(strip('invite', 1).textContent).toContain('1 train booked.');
  });

  it.each(['ready', 'invite'] as const)('%s: one button, which switches the buttons off', (kind) => {
    const onChoice = vi.fn();
    const buttons = strip(kind, kind === 'invite' ? 2 : 0, onChoice).querySelectorAll('button');
    expect(Array.from(buttons).map((b) => b.textContent)).toEqual(['Stop showing me buttons']);
    buttons[0].click();
    expect(onChoice).toHaveBeenCalledWith('declined');
  });

  it('off: a way back in, with one button that switches helping on', () => {
    const onChoice = vi.fn();
    const card = strip('off', 0, onChoice);
    expect(card.open).toBe(false);
    expect(card.querySelector('summary')!.textContent).toContain('Help tune this spot');
    expect(card.querySelector('.ticket')).toBeNull();
    const buttons = card.querySelectorAll('button');
    expect(Array.from(buttons).map((b) => b.textContent)).toEqual(["I'll help"]);
    buttons[0].click();
    expect(onChoice).toHaveBeenCalledWith('helping');
  });

  it('off: keeps showing the ticket of someone who has booked trains', () => {
    const card = strip('off', 6);
    expect(card.querySelector('summary .ticket')).not.toBeNull();
    expect(card.textContent).toContain('6 trains booked.');
  });
});
