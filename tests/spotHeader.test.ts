import { describe, it, expect, vi } from 'vitest';
import { renderSpotHeader } from '../src/spotHeader';
import { getViewpointById } from '../src/viewpoints';

const EA = getViewpointById('east-ave')!;
const QR = getViewpointById('queens-road')!;

function model(overrides: Partial<Parameters<typeof renderSpotHeader>[1]> = {}) {
  return {
    viewpoint: EA,
    favourite: false,
    onHome: vi.fn<() => void>(),
    onToggleFavourite: vi.fn<(id: string) => void>(),
    ticketLabel: 'Your ticket',
    onOpenTicket: vi.fn<() => void>(),
    ...overrides,
  };
}

describe('renderSpotHeader', () => {
  it('shows the line and the spot name', () => {
    const el = renderSpotHeader(null, model());
    expect(el.classList.contains('spot-header')).toBe(true);
    expect(el.querySelector('.spot-header-line')!.textContent).toBe('Weaver line');
    expect(el.querySelector('h1.spot-header-name')!.textContent).toBe('East Avenue Bridge');
  });

  it('lays out like the boards: back link, badge and star on top, then the name and line', () => {
    const el = renderSpotHeader(null, model());
    const bar = el.querySelector('.spot-header-bar')!;
    expect(Array.from(bar.children).map((c) => c.className.split(' ')[0]))
      .toEqual(['spot-header-home', 'ticket-badge', 'spot-header-star']);
    const title = el.querySelector('.spot-header-title')!;
    expect(Array.from(title.children).map((c) => c.className.split(' ')[0]))
      .toEqual(['spot-header-name', 'spot-header-line']);
    expect(el.firstElementChild).toBe(bar);
  });

  it('the ticket badge shows the label and opens the ticket', () => {
    const m = model({ ticketLabel: 'Spotter · 4 trains' });
    const el = renderSpotHeader(null, m);
    const badge = el.querySelector<HTMLButtonElement>('button.ticket-badge')!;
    expect(badge.textContent).toContain('Spotter · 4 trains');
    expect(badge.getAttribute('aria-label')).toBe('Your ticket: Spotter, 4 trains');
    badge.click();
    expect(m.onOpenTicket).toHaveBeenCalledTimes(1);
    expect(m.onHome).not.toHaveBeenCalled();
  });

  it('with no taps the badge reads "Your ticket"', () => {
    const badge = renderSpotHeader(null, model()).querySelector('.ticket-badge')!;
    expect(badge.textContent).toContain('Your ticket');
    expect(badge.getAttribute('aria-label')).toBe('Your ticket');
  });

  it('the badge is shown at Queens Road too', () => {
    const el = renderSpotHeader(null, model({ viewpoint: QR }));
    expect(el.querySelector('.ticket-badge')).not.toBeNull();
  });

  it('the badge updates in place and calls the latest handler', () => {
    const first = model();
    const el = renderSpotHeader(null, first);
    const badge = el.querySelector('.ticket-badge');
    const second = model({ ticketLabel: 'Spotter · 1 train' });
    renderSpotHeader(el, second);
    expect(el.querySelector('.ticket-badge')).toBe(badge);
    expect(badge!.textContent).toContain('Spotter · 1 train');
    (badge as HTMLElement).click();
    expect(second.onOpenTicket).toHaveBeenCalledTimes(1);
    expect(first.onOpenTicket).not.toHaveBeenCalled();
  });

  it('links back to all spots without a page load', () => {
    const m = model();
    const el = renderSpotHeader(null, m);
    const link = el.querySelector<HTMLAnchorElement>('a.spot-header-home')!;
    expect(link.getAttribute('href')).toBe('/');
    expect(link.textContent).toContain('All spots');
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(ev);
    expect(m.onHome).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('leaves a ctrl-click on the link to the browser', () => {
    const m = model();
    const el = renderSpotHeader(null, m);
    const link = el.querySelector('a.spot-header-home')!;
    let preventedByHeader = true;
    el.addEventListener('click', (e) => { preventedByHeader = e.defaultPrevented; e.preventDefault(); });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
    expect(m.onHome).not.toHaveBeenCalled();
    expect(preventedByHeader).toBe(false);
  });

  it('the star shows and toggles the favourite', () => {
    const m = model({ favourite: true });
    const el = renderSpotHeader(null, m);
    const star = el.querySelector<HTMLElement>('button.spot-header-star')!;
    expect(star.getAttribute('aria-pressed')).toBe('true');
    expect(star.getAttribute('aria-label')).toBe('Favourite: East Avenue Bridge');
    expect(star.classList.contains('filled')).toBe(true);
    star.click();
    expect(m.onToggleFavourite).toHaveBeenCalledWith('east-ave');
    expect(m.onHome).not.toHaveBeenCalled();
  });

  it('an unstarred spot has an unpressed star', () => {
    const star = renderSpotHeader(null, model()).querySelector('.spot-header-star')!;
    expect(star.getAttribute('aria-pressed')).toBe('false');
    expect(star.classList.contains('filled')).toBe(false);
  });

  it('re-rendering keeps the element and updates it, calling the latest handlers', () => {
    const first = model();
    const el = renderSpotHeader(null, first);
    const starBefore = el.querySelector('.spot-header-star');
    const second = model({ viewpoint: QR, favourite: true });
    const again = renderSpotHeader(el, second);
    expect(again).toBe(el);
    expect(el.querySelector('.spot-header-star')).toBe(starBefore);
    expect(el.querySelector('.spot-header-line')!.textContent).toBe('Suffragette line');
    expect(el.querySelector('.spot-header-name')!.textContent).toBe('Queens Road Station');
    el.querySelector<HTMLElement>('.spot-header-star')!.click();
    expect(second.onToggleFavourite).toHaveBeenCalledWith('queens-road');
    expect(first.onToggleFavourite).not.toHaveBeenCalled();
  });
});
