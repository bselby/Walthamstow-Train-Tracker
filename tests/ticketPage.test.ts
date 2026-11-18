import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderTicketPage } from '../src/ticketPage';

let root: HTMLElement;
const handlers = () => ({ onBack: vi.fn(), onToggleButton: vi.fn(), onOpenHow: vi.fn() });
const model = (o: Partial<Parameters<typeof renderTicketPage>[1]> = {}) => ({
  taps: 4,
  choice: 'helping' as const,
  spotNames: [] as string[],
  ...o,
});

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
});

describe('renderTicketPage', () => {
  it('shows the rank, progress line and a five-item ladder with Your rank on Spotter', () => {
    renderTicketPage(root, model(), handlers());
    expect(root.querySelector('h1')!.textContent).toBe('Your ticket');
    expect(root.querySelector('.ticket-rank')!.textContent).toBe('Spotter');
    expect(root.textContent).toContain("That's 4 trains timed. One more and you're a Guard.");
    const items = root.querySelectorAll('.ladder li');
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toContain('Your rank');
    expect(root.textContent!.match(/Your rank/g)).toHaveLength(1);
    expect(items[1].textContent).toContain('5 trains');
    expect(root.textContent).not.toContain('No. 0001');
  });

  it('omits Timed at when no spots, joins two with "and", three with commas', () => {
    renderTicketPage(root, model(), handlers());
    expect(root.textContent).not.toContain('Timed at');
    renderTicketPage(root, model({ spotNames: ['East Avenue Bridge', 'Northcote Road Bridge'] }), handlers());
    expect(root.textContent).toContain('Timed at East Avenue Bridge and Northcote Road Bridge');
    renderTicketPage(root, model({ spotNames: ['A', 'B', 'C'] }), handlers());
    expect(root.textContent).toContain('Timed at A, B and C');
  });

  it('unchecks the checkbox when declined and reports toggles', () => {
    const h = handlers();
    renderTicketPage(root, model({ choice: 'declined' }), h);
    const box = root.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    expect(box.checked).toBe(false);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(h.onToggleButton).toHaveBeenCalledWith(true);
    expect(root.textContent).toContain('Turn it off any time. Your ticket stays as it is.');
    expect(root.textContent).toContain('Your ticket lives on this phone.');
  });

  it('is checked for unset and helping', () => {
    renderTicketPage(root, model({ choice: 'unset' }), handlers());
    expect(root.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(true);
  });

  it('wires Back and How it works', () => {
    const h = handlers();
    renderTicketPage(root, model(), h);
    root.querySelector<HTMLElement>('.info-back')!.click();
    [...root.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent === 'How it works')!.click();
    expect(h.onBack).toHaveBeenCalled();
    expect(h.onOpenHow).toHaveBeenCalled();
  });

  it('renders at zero taps with the no-trains line and no Your rank', () => {
    renderTicketPage(root, model({ taps: 0 }), handlers());
    expect(root.textContent).toContain('No trains timed yet. Time one to become a Spotter.');
    expect(root.textContent).not.toContain('Your rank');
    expect(root.querySelectorAll('.ladder li')).toHaveLength(5);
  });

  it('says "1 train" (singular) on the Spotter row', () => {
    renderTicketPage(root, model({ taps: 0 }), handlers());
    const spotter = root.querySelectorAll('.ladder li')[0];
    expect(spotter.querySelector('.ladder-note')!.textContent).toBe('1 train · 1 to go');
    renderTicketPage(root, model({ taps: 7 }), handlers());
    expect(root.querySelectorAll('.ladder li')[0].querySelector('.ladder-note')!.textContent).toBe('1 train');
  });

  it('keeps focus on the checkbox across a re-render', () => {
    renderTicketPage(root, model(), handlers());
    root.querySelector<HTMLInputElement>('input[type=checkbox]')!.focus();
    renderTicketPage(root, model({ choice: 'declined' }), handlers());
    expect(document.activeElement).toBe(root.querySelector('input[type=checkbox]'));
  });
});
