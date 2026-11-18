import { describe, it, expect } from 'vitest';
import { passengerTrainSvg, freightTrainSvg, outfitOverlay } from '../src/trainArt';
import type { Theme } from '../src/season';

const THEMES: Exclude<Theme, null>[] = [
  'winter-ski', 'world-book-day', 'easter', 'spring', 'summer',
  'autumn', 'halloween', 'bonfire', 'christmas', 'new-year',
];

describe('outfitOverlay', () => {
  it('is empty for no theme', () => {
    expect(outfitOverlay(null)).toBe('');
  });
  it('is non-empty and distinct for each of the ten themes', () => {
    const seen = new Set<string>();
    for (const t of THEMES) {
      const o = outfitOverlay(t);
      expect(o.length).toBeGreaterThan(0);
      seen.add(o);
    }
    expect(seen.size).toBe(THEMES.length);
  });
  it('uses the dark navy stroke (fireworks are plain bursts, so excluded)', () => {
    for (const t of THEMES.filter((x) => x !== 'bonfire')) {
      expect(outfitOverlay(t)).toContain('#1F2A44');
    }
  });
});

describe('passengerTrainSvg', () => {
  it('takes its colour from currentColor, with no line literals', () => {
    const svg = passengerTrainSvg(null);
    expect(svg.match(/fill="currentColor"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(svg).not.toContain('#7A2E54');
    expect(svg).not.toContain('#1E7B4B');
  });
  it('has the agreed root element', () => {
    const svg = passengerTrainSvg(null);
    expect(svg).toContain('viewBox="-6 -30 136 90"');
    expect(svg).toContain('class="train-svg train-passenger"');
    expect(svg).toContain('aria-hidden="true"');
  });
  it('includes the outfit for the theme', () => {
    expect(passengerTrainSvg('christmas')).toContain(outfitOverlay('christmas'));
    expect(passengerTrainSvg(null)).not.toContain(outfitOverlay('christmas'));
  });
});

describe('freightTrainSvg', () => {
  it('is the brown freight drawing', () => {
    const svg = freightTrainSvg();
    expect(svg).toContain('#8A5A2B');
    expect(svg).toContain('viewBox="0 0 150 50"');
    expect(svg).toContain('class="train-svg train-freight"');
  });
});
