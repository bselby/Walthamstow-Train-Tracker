import { describe, it, expect } from 'vitest';
import { formatCountdown, formatAge, type CountdownLabel } from '../src/display';

describe('formatCountdown', () => {
  it('shows NOW when 10s or less', () => {
    expect(formatCountdown(10)).toEqual<CountdownLabel>({ kind: 'now', text: 'NOW' });
    expect(formatCountdown(0)).toEqual<CountdownLabel>({ kind: 'now', text: 'NOW' });
    expect(formatCountdown(5)).toEqual<CountdownLabel>({ kind: 'now', text: 'NOW' });
  });

  it('shows "just crossed" for 0 down to -30s', () => {
    expect(formatCountdown(-5)).toEqual<CountdownLabel>({ kind: 'just-crossed', text: 'just crossed' });
    expect(formatCountdown(-30)).toEqual<CountdownLabel>({ kind: 'just-crossed', text: 'just crossed' });
  });

  it('shows whole seconds for 11s to 59s', () => {
    expect(formatCountdown(11)).toEqual<CountdownLabel>({ kind: 'seconds', text: '11 sec' });
    expect(formatCountdown(59)).toEqual<CountdownLabel>({ kind: 'seconds', text: '59 sec' });
  });

  it('shows whole minutes for 60s and above, rounded down', () => {
    expect(formatCountdown(60)).toEqual<CountdownLabel>({ kind: 'minutes', text: '1 min' });
    expect(formatCountdown(119)).toEqual<CountdownLabel>({ kind: 'minutes', text: '1 min' });
    expect(formatCountdown(120)).toEqual<CountdownLabel>({ kind: 'minutes', text: '2 min' });
    expect(formatCountdown(600)).toEqual<CountdownLabel>({ kind: 'minutes', text: '10 min' });
  });
});

describe('formatAge', () => {
  it('formats seconds under 60s', () => {
    expect(formatAge(5_000)).toBe('updated 5s ago');
    expect(formatAge(59_000)).toBe('updated 59s ago');
    expect(formatAge(0)).toBe('updated 0s ago');
  });

  it('formats minutes for 60s and above', () => {
    expect(formatAge(60_000)).toBe('updated 1m ago');
    expect(formatAge(180_000)).toBe('updated 3m ago');
  });
});
