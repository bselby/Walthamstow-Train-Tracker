import { describe, it, expect } from 'vitest';
import { estimatePosition } from '../src/trainPosition';
import { getViewpointById } from '../src/viewpoints';

const EAST_AVE = getViewpointById('east-ave')!;
const QUEENS_ROAD = getViewpointById('queens-road')!;

describe('estimatePosition — East Ave bridge model', () => {
  it('returns 5 (WC) for tts=0 regardless of direction', () => {
    expect(estimatePosition(0, 'north', EAST_AVE)).toBe(5);
    expect(estimatePosition(0, 'south', EAST_AVE)).toBe(5);
  });

  describe('southbound', () => {
    it('tts=120 → position 6 (Wood Street)', () => {
      expect(estimatePosition(120, 'south', EAST_AVE)).toBe(6);
    });

    it('tts=180 → position 6.5 (halfway Wds↔Hig)', () => {
      expect(estimatePosition(180, 'south', EAST_AVE)).toBe(6.5);
    });

    it('tts=300 → position ≈7.33 (one-third into Hig↔Chg)', () => {
      const pos = estimatePosition(300, 'south', EAST_AVE);
      expect(pos!).toBeCloseTo(7.333, 2);
    });

    it('tts=420 → position 8 (Chingford)', () => {
      expect(estimatePosition(420, 'south', EAST_AVE)).toBe(8);
    });

    it('tts=600 → position 8 (clamped)', () => {
      expect(estimatePosition(600, 'south', EAST_AVE)).toBe(8);
    });

    it('tts=-10 → position 5 (just arrived, parks briefly at WC)', () => {
      expect(estimatePosition(-10, 'south', EAST_AVE)).toBe(5);
    });

    it('tts=-40 → null (beyond southbound post-arrival window)', () => {
      expect(estimatePosition(-40, 'south', EAST_AVE)).toBeNull();
    });
  });

  describe('northbound', () => {
    it('tts=120 → position 4 (St James Street)', () => {
      expect(estimatePosition(120, 'north', EAST_AVE)).toBe(4);
    });

    it('tts=300 → position 3 (Clapton)', () => {
      expect(estimatePosition(300, 'north', EAST_AVE)).toBe(3);
    });

    it('tts=510 → position 1.5 (halfway Bth↔Hck)', () => {
      expect(estimatePosition(510, 'north', EAST_AVE)).toBe(1.5);
    });

    it('tts=-15 → position 5 (dwell phase at WC)', () => {
      expect(estimatePosition(-15, 'north', EAST_AVE)).toBe(5);
    });

    it('tts=-60 → position 5.25 (mid bridge-crossing)', () => {
      const pos = estimatePosition(-60, 'north', EAST_AVE);
      expect(pos!).toBeCloseTo(5.25, 2);
    });

    it('tts=-120 → position 6 (reached Wood Street)', () => {
      expect(estimatePosition(-120, 'north', EAST_AVE)).toBe(6);
    });

    it('tts=-130 → null (beyond northbound post-arrival window)', () => {
      expect(estimatePosition(-130, 'north', EAST_AVE)).toBeNull();
    });
  });
});

describe('estimatePosition — Queens Road (station model)', () => {
  it('tts=0 → anchor index 6 (WQR), both directions', () => {
    expect(estimatePosition(0, 'north', QUEENS_ROAD)).toBe(6);
    expect(estimatePosition(0, 'south', QUEENS_ROAD)).toBe(6);
  });

  it('tts=180 northbound (approaching from south of WQR) → position 5 (BHR)', () => {
    // WQR=6, segment BHR(5) → WQR(6) = 180s. At tts=180, train is at BHR.
    expect(estimatePosition(180, 'north', QUEENS_ROAD)).toBe(5);
  });

  it('tts=180 southbound (approaching from north of WQR) → position 7 (LMR)', () => {
    // Segment WQR(6) → LMR(7) = 180s. At tts=180, train is at LMR.
    expect(estimatePosition(180, 'south', QUEENS_ROAD)).toBe(7);
  });

  it('tts=-10 → position 6 (parks at WQR briefly after arrival)', () => {
    expect(estimatePosition(-10, 'north', QUEENS_ROAD)).toBe(6);
    expect(estimatePosition(-10, 'south', QUEENS_ROAD)).toBe(6);
  });

  it('tts=-40 → null (beyond post-arrival window)', () => {
    expect(estimatePosition(-40, 'north', QUEENS_ROAD)).toBeNull();
    expect(estimatePosition(-40, 'south', QUEENS_ROAD)).toBeNull();
  });

  it('tts > MAX_REASONABLE returns null', () => {
    expect(estimatePosition(2000, 'north', QUEENS_ROAD)).toBeNull();
  });

  it('tts=1800 (MAX_REASONABLE) southbound → clamped to 12 (Barking Riverside)', () => {
    // At exactly the boundary, the check is > not >=, so it proceeds to
    // pre-arrival and walks all southbound segments; beyond the last it clamps.
    expect(estimatePosition(1800, 'south', QUEENS_ROAD)).toBe(12);
  });

  it('tts=360 southbound → between LMR and LHR (walking segments correctly)', () => {
    // Southbound from WQR(6): seg 6→7 = 180s, seg 7→8 = 120s (cum 300).
    // At tts=360, we're in seg 8→9 (LHR→WPk, 240s). progress=(360-300)/240=0.25.
    // toward=8 (LHR, closer to anchor), away=9 (WPk). pos = 8 + 0.25*1 = 8.25.
    const pos = estimatePosition(360, 'south', QUEENS_ROAD);
    expect(pos!).toBeCloseTo(8.25, 2);
  });
});
