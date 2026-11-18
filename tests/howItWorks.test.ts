import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHowItWorks } from '../src/howItWorks';
import { LEVELS } from '../src/tap';

let root: HTMLElement;
const handlers = () => ({ onCountMeIn: vi.fn(), onNotNow: vi.fn(), onBack: vi.fn() });
const button = (name: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent!.includes(name))!;

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
});

describe('renderHowItWorks', () => {
  it('opens on page 1 with the three steps', () => {
    renderHowItWorks(root, handlers());
    expect(root.querySelector('h1')!.textContent).toBe('Help us time the trains');
    expect(root.textContent).toContain('1 of 2');
    expect(root.textContent).toContain('Watch for the yellow button');
    expect(root.textContent).toContain('Tap it as the front of the train reaches you');
    expect(root.textContent).toContain("Everyone's taps make the times better");
    expect(root.textContent).not.toContain('Every train you time clips your ticket');
  });

  it('Next: your ticket shows page 2 with the five ranks and moves focus to its heading', () => {
    renderHowItWorks(root, handlers());
    button('Next: your ticket').click();
    const h1 = root.querySelector('h1')!;
    expect(h1.textContent).toBe('Every train you time clips your ticket');
    expect(document.activeElement).toBe(h1);
    expect(root.textContent).toContain('2 of 2');
    const rows = [...root.querySelectorAll('.how-rank')].map((r) => r.textContent);
    expect(rows).toHaveLength(5);
    LEVELS.forEach((l, i) => {
      expect(rows[i]).toContain(l.name);
      expect(rows[i]).toContain(`${l.taps} ${l.taps === 1 ? 'train' : 'trains'}`);
    });
    expect(root.textContent).toContain('No account needed. Your ticket lives on this phone.');
  });

  it('Back on page 2 returns to page 1 and focuses its heading', () => {
    renderHowItWorks(root, handlers());
    button('Next: your ticket').click();
    button('Back').click();
    const h1 = root.querySelector('h1')!;
    expect(h1.textContent).toBe('Help us time the trains');
    expect(document.activeElement).toBe(h1);
  });

  it('has no ticket number', () => {
    renderHowItWorks(root, handlers());
    button('Next: your ticket').click();
    expect(root.textContent).not.toContain('No. 0');
  });

  it('Count me in and Not now each call once, from page 2', () => {
    const h = handlers();
    renderHowItWorks(root, h);
    button('Next: your ticket').click();
    button('Count me in').click();
    expect(h.onCountMeIn).toHaveBeenCalledTimes(1);
    const h2 = handlers();
    renderHowItWorks(root, h2);
    button('Next: your ticket').click();
    button('Not now').click();
    expect(h2.onNotNow).toHaveBeenCalledTimes(1);
  });

  it('Not now on page 1 and Close both leave', () => {
    const h = handlers();
    renderHowItWorks(root, h);
    button('Not now').click();
    expect(h.onNotNow).toHaveBeenCalledTimes(1);
    const h2 = handlers();
    renderHowItWorks(root, h2);
    root.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    expect(h2.onBack).toHaveBeenCalledTimes(1);
  });

  it('labels the drawings or hides them from screen readers', () => {
    renderHowItWorks(root, handlers());
    root.querySelectorAll('svg').forEach((s) => {
      expect(s.getAttribute('aria-hidden') === 'true' || s.hasAttribute('aria-label')).toBe(true);
    });
  });

  it('exits only once, whichever exit is tapped first', () => {
    const h = handlers();
    renderHowItWorks(root, h);
    button('Next: your ticket').click();
    const yes = button('Count me in');
    const no = button('Not now');
    yes.click();
    yes.click();
    no.click();
    expect(h.onCountMeIn).toHaveBeenCalledTimes(1);
    expect(h.onNotNow).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    expect(h.onBack).not.toHaveBeenCalled();
  });
});
