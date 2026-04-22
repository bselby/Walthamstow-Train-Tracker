import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderSwitcher, type SwitcherModel } from '../src/switcher';
import { getViewpointById } from '../src/viewpoints';

const EAST_AVE = getViewpointById('east-ave')!;
const QUEENS_ROAD = getViewpointById('queens-road')!;

function baseModel(overrides: Partial<SwitcherModel> = {}): SwitcherModel {
  return {
    activeViewpoint: EAST_AVE,
    favouriteViewpointId: EAST_AVE.id,
    onSwitch: vi.fn(),
    onSetFavourite: vi.fn(),
    ...overrides,
  };
}

describe('renderSwitcher', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders the active line name + viewpoint name in the closed header', () => {
    const el = renderSwitcher(null, baseModel());
    container.appendChild(el);
    const header = el.querySelector<HTMLElement>('.switcher-header')!;
    expect(header.textContent).toContain('Weaver');
    expect(header.textContent).toContain('East Ave bridge');
  });

  it('closed header has aria-expanded=false and the sheet is not visible', () => {
    const el = renderSwitcher(null, baseModel());
    const header = el.querySelector<HTMLButtonElement>('.switcher-header')!;
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.switcher-sheet')?.classList.contains('open')).toBeFalsy();
  });

  it('clicking the header opens the sheet', () => {
    const el = renderSwitcher(null, baseModel());
    const header = el.querySelector<HTMLButtonElement>('.switcher-header')!;
    header.click();
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.switcher-sheet')?.classList.contains('open')).toBeTruthy();
  });

  it('sheet lists every viewpoint with a row + star button', () => {
    const el = renderSwitcher(null, baseModel());
    const header = el.querySelector<HTMLButtonElement>('.switcher-header')!;
    header.click();
    const rows = el.querySelectorAll('.switcher-row');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    rows.forEach((row) => {
      expect(row.querySelector('.switcher-star')).toBeTruthy();
    });
  });

  it('clicking a row calls onSwitch with its id and does NOT call onSetFavourite', () => {
    const onSwitch = vi.fn();
    const onSetFavourite = vi.fn();
    const el = renderSwitcher(null, baseModel({ onSwitch, onSetFavourite }));
    const header = el.querySelector<HTMLButtonElement>('.switcher-header')!;
    header.click();
    const queensRow = el.querySelector<HTMLButtonElement>(`.switcher-row[data-id="${QUEENS_ROAD.id}"]`)!;
    queensRow.click();
    expect(onSwitch).toHaveBeenCalledWith(QUEENS_ROAD.id);
    expect(onSetFavourite).not.toHaveBeenCalled();
  });

  it('clicking a star calls onSetFavourite with its id and does NOT call onSwitch', () => {
    const onSwitch = vi.fn();
    const onSetFavourite = vi.fn();
    const el = renderSwitcher(null, baseModel({ onSwitch, onSetFavourite }));
    const header = el.querySelector<HTMLButtonElement>('.switcher-header')!;
    header.click();
    const queensStar = el.querySelector<HTMLButtonElement>(
      `.switcher-row[data-id="${QUEENS_ROAD.id}"] .switcher-star`,
    )!;
    queensStar.click();
    expect(onSetFavourite).toHaveBeenCalledWith(QUEENS_ROAD.id);
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('marks the current favourite with a filled star', () => {
    const el = renderSwitcher(null, baseModel({ favouriteViewpointId: QUEENS_ROAD.id }));
    const header = el.querySelector<HTMLButtonElement>('.switcher-header')!;
    header.click();
    const queensStar = el.querySelector<HTMLButtonElement>(
      `.switcher-row[data-id="${QUEENS_ROAD.id}"] .switcher-star`,
    )!;
    expect(queensStar.classList.contains('filled')).toBe(true);
    const eastStar = el.querySelector<HTMLButtonElement>(
      `.switcher-row[data-id="${EAST_AVE.id}"] .switcher-star`,
    )!;
    expect(eastStar.classList.contains('filled')).toBe(false);
  });

  it('marks the active viewpoint with aria-selected=true on its row', () => {
    const el = renderSwitcher(null, baseModel({ activeViewpoint: EAST_AVE }));
    const header = el.querySelector<HTMLButtonElement>('.switcher-header')!;
    header.click();
    const eastRow = el.querySelector<HTMLButtonElement>(`.switcher-row[data-id="${EAST_AVE.id}"]`)!;
    const queensRow = el.querySelector<HTMLButtonElement>(`.switcher-row[data-id="${QUEENS_ROAD.id}"]`)!;
    expect(eastRow.getAttribute('aria-selected')).toBe('true');
    expect(queensRow.getAttribute('aria-selected')).toBe('false');
  });

  it('Escape key closes the sheet', () => {
    const el = renderSwitcher(null, baseModel());
    const header = el.querySelector<HTMLButtonElement>('.switcher-header')!;
    header.click();
    expect(header.getAttribute('aria-expanded')).toBe('true');
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    el.dispatchEvent(event);
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('re-rendering preserves the header DOM element (no flicker)', () => {
    const first = renderSwitcher(null, baseModel());
    const secondModel = baseModel({ activeViewpoint: QUEENS_ROAD });
    const second = renderSwitcher(first, secondModel);
    expect(second).toBe(first); // same node, updated in place
    const header = second.querySelector<HTMLElement>('.switcher-header')!;
    expect(header.textContent).toContain('Suffragette');
  });
});
