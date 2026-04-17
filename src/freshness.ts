import { STALE_THRESHOLD_MS } from './constants';

export type FreshnessState =
  | { state: 'no-data' }
  | { state: 'fresh'; ageMs: number }
  | { state: 'stale'; ageMs: number };

export function classifyFreshness(lastFetchMs: number | null, nowMs: number): FreshnessState {
  if (lastFetchMs === null) return { state: 'no-data' };
  const ageMs = nowMs - lastFetchMs;
  if (ageMs <= STALE_THRESHOLD_MS) return { state: 'fresh', ageMs };
  return { state: 'stale', ageMs };
}
