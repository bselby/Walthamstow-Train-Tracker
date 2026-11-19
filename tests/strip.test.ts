import { describe, it, expect, beforeEach } from 'vitest';
import { renderDirectionStrip, clearPreviousPositions, type StripModel } from '../src/strip';
import { getViewpointById } from '../src/viewpoints';
import { lineDiagramLayout, fracForPos } from '../src/lineDiagram';

const QR = getViewpointById('queens-road')!;
const EA = getViewpointById('east-ave')!;

function model(overrides: Partial<StripModel> = {}): StripModel {
  return {
    direction: 'north',
    pos: 3,
    celebrate: false,
    stops: QR.stops,
    anchorIndex: QR.anchorIndex,
    pinPosition: QR.pinPosition,
    lineNameForAria: 'Suffragette line',
    isFreight: false,
    ...overrides,
  };
}

describe('renderDirectionStrip line diagram', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    clearPreviousPositions();
  });

  it('names both ends of the line under the diagram', () => {
    const el = renderDirectionStrip(null, model());
    const ends = Array.from(el.querySelectorAll('.line-end-label')).map((e) => e.textContent);
    expect(ends).toEqual(['Gospel Oak', 'Barking Riverside']);
  });

  it('names the two stations before the spot, in line order', () => {
    const el = renderDirectionStrip(null, model({
      stops: EA.stops, pinPosition: EA.pinPosition, lineNameForAria: 'Weaver line', direction: 'south', pos: 7,
    }));
    const names = Array.from(el.querySelectorAll('.line-stop-label')).map((e) => e.textContent);
    expect(names).toEqual(['Wood Street', 'Highams Park']);
  });

  it('uses the short name in the middle where one is set: Queens Road', () => {
    const nc = getViewpointById('northcote-rd')!;
    const el = renderDirectionStrip(null, model({
      stops: nc.stops, pinPosition: nc.pinPosition, direction: 'south', pos: 8,
    }));
    const names = Array.from(el.querySelectorAll('.line-stop-label')).map((e) => e.textContent);
    expect(names).toEqual(['Queens Road', 'Leyton Midland Road']);
  });

  it('has no bridge drawing', () => {
    const el = renderDirectionStrip(null, model({ stops: EA.stops, pinPosition: EA.pinPosition }));
    expect(el.querySelector('.strip-bridge')).toBeNull();
  });

  it('marks the spot with one You pin', () => {
    const el = renderDirectionStrip(null, model());
    const pins = el.querySelectorAll('.line-pin');
    expect(pins).toHaveLength(1);
    expect(pins[0].textContent?.trim()).toBe('You');
  });

  it('draws only the ends and the two stations before the spot, the ends larger', () => {
    const el = renderDirectionStrip(null, model());
    expect(el.querySelectorAll('.line-station')).toHaveLength(4);
    const ends = el.querySelectorAll('.line-station.end');
    expect(ends).toHaveLength(2);
    expect(Number(ends[0].getAttribute('r'))).toBeGreaterThan(
      Number(el.querySelector('.line-station:not(.end)')!.getAttribute('r')),
    );
  });

  it('labels the diagram for screen readers with the line and both ends', () => {
    const el = renderDirectionStrip(null, model());
    const img = el.querySelector('[role="img"]');
    expect(img).not.toBeNull();
    const label = img!.getAttribute('aria-label') ?? '';
    expect(label).toContain('Suffragette line');
    expect(label).toContain('Gospel Oak');
    expect(label).toContain('Barking Riverside');
  });

  it('says where you are: between two stations for a bridge', () => {
    const el = renderDirectionStrip(null, model({
      stops: EA.stops, pinPosition: EA.pinPosition, lineNameForAria: 'Weaver line',
    }));
    const label = el.querySelector('[role="img"]')!.getAttribute('aria-label')!;
    expect(label).toContain('between Walthamstow Central and Wood Street');
  });
});

describe('renderDirectionStrip freight branch', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    clearPreviousPositions();
  });

  it('passenger: renders the passenger drawing and no .freight class', () => {
    const el = renderDirectionStrip(null, model({ isFreight: false }));
    expect(el.querySelector('.train-passenger')).not.toBeNull();
    expect(el.querySelector('.train-freight')).toBeNull();
    expect(el.querySelector('.strip-train')?.classList.contains('freight')).toBe(false);
  });

  it('freight: renders the freight drawing and .freight class', () => {
    const el = renderDirectionStrip(null, model({ isFreight: true }));
    expect(el.querySelector('.train-freight')).not.toBeNull();
    expect(el.querySelector('.train-passenger')).toBeNull();
    expect(el.querySelector('.strip-train')?.classList.contains('freight')).toBe(true);
  });

  it('category swap reuses the diagram and station elements (passenger → freight)', () => {
    const el1 = renderDirectionStrip(null, model({ isFreight: false }));
    const line = el1.querySelector('.line-svg')!;
    const stations = Array.from(el1.querySelectorAll('.line-station'));

    const el2 = renderDirectionStrip(el1, model({ isFreight: true }));

    expect(el2).toBe(el1);
    expect(el2.querySelector('.line-svg')).toBe(line);
    stations.forEach((s, i) => expect(el2.querySelectorAll('.line-station')[i]).toBe(s));
    expect(el2.querySelector('.train-freight')).not.toBeNull();
    expect(el2.querySelector('.train-passenger')).toBeNull();
  });
});

describe('renderDirectionStrip behaviour', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    clearPreviousPositions();
  });

  it('moves the train to pos and hides it when there is none', () => {
    const el = renderDirectionStrip(null, model({ direction: 'south', pos: 4.5 }));
    const train = el.querySelector<HTMLElement>('.strip-train')!;
    const l = lineDiagramLayout(QR.stops, QR.pinPosition, 'south');
    expect(train.style.getPropertyValue('--x')).toBe(String(fracForPos(l, 4.5)));
    renderDirectionStrip(el, model({ direction: 'south', pos: null }));
    expect(train.classList.contains('hidden')).toBe(true);
  });

  it('pulses a shown station as the train goes through it', () => {
    const m = { stops: EA.stops, pinPosition: EA.pinPosition, lineNameForAria: 'Weaver line', direction: 'north' as const };
    const el = renderDirectionStrip(null, model({ ...m, pos: 3.5 }));
    renderDirectionStrip(el, model({ ...m, pos: 4.2 }));
    const dot = (name: string) => el.querySelector(`.line-station[data-name="${name}"]`)!;
    expect(dot('St James Street').classList.contains('pulsing')).toBe(true);
    expect(dot('Walthamstow Central').classList.contains('pulsing')).toBe(false);
    renderDirectionStrip(el, model({ ...m, pos: 5.1 }));
    expect(dot('Walthamstow Central').classList.contains('pulsing')).toBe(true);
    renderDirectionStrip(el, model({ ...m, pos: null }));
  });

  it('celebrates on the pin when the train passes', () => {
    const el = renderDirectionStrip(null, model({ celebrate: true }));
    expect(el.querySelector('.line-pin')!.classList.contains('celebrating')).toBe(true);
    renderDirectionStrip(el, model({ celebrate: false }));
    expect(el.querySelector('.line-pin')!.classList.contains('celebrating')).toBe(false);
  });
});
