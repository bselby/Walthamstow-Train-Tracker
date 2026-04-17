import { describe, it, expect } from 'vitest';
import { classifyFreshness } from '../src/freshness';

describe('classifyFreshness', () => {
  it('returns no-data when lastFetch is null', () => {
    expect(classifyFreshness(null, Date.now())).toEqual({ state: 'no-data' });
  });

  it('returns fresh when age is under threshold', () => {
    const now = 1_000_000;
    const lastFetch = now - 30_000; // 30s ago
    expect(classifyFreshness(lastFetch, now)).toEqual({ state: 'fresh', ageMs: 30_000 });
  });

  it('returns stale when age is over threshold', () => {
    const now = 1_000_000;
    const lastFetch = now - 90_000; // 90s ago
    expect(classifyFreshness(lastFetch, now)).toEqual({ state: 'stale', ageMs: 90_000 });
  });

  it('treats exactly-threshold age as fresh (boundary)', () => {
    const now = 1_000_000;
    const lastFetch = now - 60_000;
    expect(classifyFreshness(lastFetch, now)).toEqual({ state: 'fresh', ageMs: 60_000 });
  });
});
