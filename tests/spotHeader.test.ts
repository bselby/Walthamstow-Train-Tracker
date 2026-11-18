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
    ...overrides,
  };
}

describe('renderSpotHeader', () => {
  it('shows the line and the spot name', () => {
    const el = renderSpotHeader(null, model());
    expect(el.classList.contains('spot-header')).toBe(true);
    expect(el.querySelector('.spot-header-line')!.textContent).toBe('Weaver');
    expect(el.querySelector('h1.spot-header-name')!.textContent).toBe('East Avenue Bridge');
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
    expect(el.querySelector('.spot-header-line')!.textContent).toBe('Suffragette');
    expect(el.querySelector('.spot-header-name')!.textContent).toBe('Queens Road Station');
    el.querySelector<HTMLElement>('.spot-header-star')!.click();
    expect(second.onToggleFavourite).toHaveBeenCalledWith('queens-road');
    expect(first.onToggleFavourite).not.toHaveBeenCalled();
  });
});
