import { describe, it, expect, beforeEach } from 'vitest';
import { renderDirectionStrip, type StripModel } from '../src/strip';
import { getViewpointById } from '../src/viewpoints';

const QR = getViewpointById('queens-road')!;

function model(overrides: Partial<StripModel> = {}): StripModel {
  return {
    direction: 'north',
    pos: 3,
    celebrate: false,
    stops: QR.stops,
    anchorIndex: QR.anchorIndex,
    bridgeStripPosition: null,
    bridgeLabel: null,
    lineNameForAria: 'Suffragette line',
    isFreight: false,
    ...overrides,
  };
}

describe('renderDirectionStrip freight branch', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('passenger: renders the Aventra svg and no .freight class', () => {
    const el = renderDirectionStrip(null, model({ isFreight: false }));
    expect(el.querySelector('.strip-train-svg')).not.toBeNull();
    expect(el.querySelector('.strip-freight-svg')).toBeNull();
    expect(el.querySelector('.strip-train')?.classList.contains('freight')).toBe(false);
  });

  it('freight: renders the Class 66 svg and .freight class', () => {
    const el = renderDirectionStrip(null, model({ isFreight: true }));
    expect(el.querySelector('.strip-freight-svg')).not.toBeNull();
    expect(el.querySelector('.strip-train-svg')).toBeNull();
    expect(el.querySelector('.strip-train')?.classList.contains('freight')).toBe(true);
  });

  it('category swap reuses the strip + pip elements (passenger → freight)', () => {
    const el1 = renderDirectionStrip(null, model({ isFreight: false }));
    const line = el1.querySelector('.strip-line')!;
    const pips = Array.from(el1.querySelectorAll('.strip-pip'));

    const el2 = renderDirectionStrip(el1, model({ isFreight: true }));

    expect(el2).toBe(el1);
    expect(el2.querySelector('.strip-line')).toBe(line);
    pips.forEach((p, i) => expect(el2.querySelectorAll('.strip-pip')[i]).toBe(p));
    expect(el2.querySelector('.strip-freight-svg')).not.toBeNull();
    expect(el2.querySelector('.strip-train-svg')).toBeNull();
  });
});
