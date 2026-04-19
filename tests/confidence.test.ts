import { describe, it, expect } from 'vitest';
import {
  computeFreshness,
  computeStability,
  computeConfidence,
  type PredictionSample,
} from '../src/confidence';

const sample = (vehicleId: string, tts: number, fetchedAtMs: number): PredictionSample => ({
  vehicleId,
  timeToStation: tts,
  fetchedAtMs,
});

describe('computeFreshness', () => {
  it('returns 1.0 when freshly fetched (<= 30 s old)', () => {
    expect(computeFreshness(0)).toBe(1.0);
    expect(computeFreshness(30_000)).toBe(1.0);
  });

  it('decays linearly between 30 s and 90 s', () => {
    expect(computeFreshness(60_000)).toBeCloseTo(0.65, 2);
  });

  it('bottoms at 0.3 beyond 90 s', () => {
    expect(computeFreshness(90_000)).toBe(0.3);
    expect(computeFreshness(300_000)).toBe(0.3);
  });
});

describe('computeStability', () => {
  it('cold-starts at 1.0 when fewer than 3 samples are available', () => {
    expect(computeStability([])).toBe(1.0);
    expect(computeStability([sample('v1', 120, 1_000)])).toBe(1.0);
    expect(computeStability([
      sample('v1', 120, 1_000),
      sample('v1', 100, 21_000),
    ])).toBe(1.0);
  });

  it('returns 1.0 for a perfectly stable sequence (tts drops match elapsed time)', () => {
    const samples = [
      sample('v1', 120, 1_000),
      sample('v1', 100, 21_000),
      sample('v1', 80, 41_000),
    ];
    expect(computeStability(samples)).toBe(1.0);
  });

  it('linearly interpolates at mid-range drift', () => {
    const samples = [
      sample('v1', 120, 1_000),
      sample('v1', 90, 21_000),
      sample('v1', 60, 41_000),
    ];
    expect(computeStability(samples)).toBeCloseTo(0.75, 2);
  });

  it('bottoms at 0.5 for heavily jittery predictions', () => {
    const samples = [
      sample('v1', 120, 1_000),
      sample('v1', 220, 21_000),
      sample('v1', 200, 41_000),
    ];
    expect(computeStability(samples)).toBe(0.5);
  });
});

describe('computeConfidence', () => {
  it('multiplies freshness by stability', () => {
    const stable = [
      sample('v1', 120, 1_000),
      sample('v1', 100, 21_000),
      sample('v1', 80, 41_000),
    ];
    expect(computeConfidence(60_000, stable)).toBeCloseTo(0.65, 2);
  });

  it('is bounded at minimum 0.15 (freshness floor 0.3 × stability floor 0.5)', () => {
    const jittery = [
      sample('v1', 120, 1_000),
      sample('v1', 220, 21_000),
      sample('v1', 300, 41_000),
    ];
    expect(computeConfidence(300_000, jittery)).toBeCloseTo(0.15, 2);
  });

  it('is bounded at maximum 1.0 (both floors maxed)', () => {
    expect(computeConfidence(0, [])).toBe(1.0);
  });
});
