import { describe, it, expect } from 'vitest';
import { estimatePosition } from '../src/trainPosition';

describe('estimatePosition', () => {
  it('returns 5 (WC) for tts=0 regardless of direction', () => {
    expect(estimatePosition(0, 'north')).toBe(5);
    expect(estimatePosition(0, 'south')).toBe(5);
  });

  describe('southbound (train approaching WC from the north)', () => {
    it('tts=120 → position 6 (Wood Street, one segment north)', () => {
      expect(estimatePosition(120, 'south')).toBe(6);
    });

    it('tts=180 → position 6.5 (halfway between Wds and Hig)', () => {
      expect(estimatePosition(180, 'south')).toBe(6.5);
    });

    it('tts=300 → position ≈7.33 (one-third into Hig↔Chg segment)', () => {
      const pos = estimatePosition(300, 'south');
      expect(pos).not.toBeNull();
      expect(pos!).toBeCloseTo(7.333, 2);
    });

    it('tts=420 → position 8 (Chingford, end of modelled range)', () => {
      expect(estimatePosition(420, 'south')).toBe(8);
    });

    it('tts=600 → position 8 (clamped to Chingford — beyond modelled segments)', () => {
      expect(estimatePosition(600, 'south')).toBe(8);
    });
  });

  describe('northbound (train approaching WC from the south)', () => {
    it('tts=120 → position 4 (St James Street, one segment south of WC)', () => {
      expect(estimatePosition(120, 'north')).toBe(4);
    });

    it('tts=300 → position 3 (Clapton, exactly at station)', () => {
      expect(estimatePosition(300, 'north')).toBe(3);
    });

    it('tts=510 → position 1.5 (halfway between Bethnal Green and Hackney Downs)', () => {
      expect(estimatePosition(510, 'north')).toBe(1.5);
    });

    it('tts=680 → position ≈0.33 (two-thirds from Liverpool Street toward Bethnal Green)', () => {
      const pos = estimatePosition(680, 'north');
      expect(pos).not.toBeNull();
      expect(pos!).toBeCloseTo(0.333, 2);
    });

    it('tts=1000 → position 0 (clamped to Liverpool Street — beyond modelled segments)', () => {
      expect(estimatePosition(1000, 'north')).toBe(0);
    });
  });

  describe('northbound post-WC with dwell model (train parks at WC, then travels to bridge, then to Wds)', () => {
    it('tts=-10 → position 5 (still dwelling at WC, within 30s dwell)', () => {
      expect(estimatePosition(-10, 'north')).toBe(5);
    });

    it('tts=-30 → position 5 (end of dwell, about to depart WC)', () => {
      expect(estimatePosition(-30, 'north')).toBe(5);
    });

    it('tts=-60 → position 5.25 (30s into the 60s WC→bridge travel)', () => {
      expect(estimatePosition(-60, 'north')).toBe(5.25);
    });

    it('tts=-90 → position 5.5 (at the bridge — bridgeTime=0, NOW celebration moment)', () => {
      expect(estimatePosition(-90, 'north')).toBe(5.5);
    });

    it('tts=-105 → position 5.75 (halfway from bridge to Wds)', () => {
      expect(estimatePosition(-105, 'north')).toBe(5.75);
    });

    it('tts=-120 → position 6 (at Wood Street, end of tracking window)', () => {
      expect(estimatePosition(-120, 'north')).toBe(6);
    });

    it('tts=-121 → null (beyond post-WC model)', () => {
      expect(estimatePosition(-121, 'north')).toBeNull();
    });
  });

  describe('southbound post-WC (brief window after arriving at WC)', () => {
    it('tts=-5 → position 5 (parked at WC)', () => {
      expect(estimatePosition(-5, 'south')).toBe(5);
    });

    it('tts=-30 → position 5 (parked at WC, edge of window)', () => {
      expect(estimatePosition(-30, 'south')).toBe(5);
    });

    it('tts=-31 → null (beyond southbound post-WC window)', () => {
      expect(estimatePosition(-31, 'south')).toBeNull();
    });
  });

  describe('out-of-range inputs return null', () => {
    it('tts > 30 minutes → null', () => {
      expect(estimatePosition(30 * 60 + 1, 'north')).toBeNull();
      expect(estimatePosition(30 * 60 + 1, 'south')).toBeNull();
    });

    it('tts = exactly 30 minutes → clamped terminus (not null)', () => {
      expect(estimatePosition(30 * 60, 'north')).toBe(0);
      expect(estimatePosition(30 * 60, 'south')).toBe(8);
    });
  });
});
