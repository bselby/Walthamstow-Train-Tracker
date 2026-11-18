import { describe, it, expect } from 'vitest';
import { formatCountdown, formatAge, formatLastLive, type CountdownLabel } from '../src/display';

describe('formatCountdown', () => {
  it('shows NOW when 10s or less', () => {
    expect(formatCountdown(10)).toEqual<CountdownLabel>({ kind: 'now', text: 'NOW' });
    expect(formatCountdown(0)).toEqual<CountdownLabel>({ kind: 'now', text: 'NOW' });
    expect(formatCountdown(5)).toEqual<CountdownLabel>({ kind: 'now', text: 'NOW' });
  });

  it('shows "just crossed" for negative values (train has already passed the bridge)', () => {
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
  it('says the seconds in words under a minute', () => {
    expect(formatAge(5_000)).toBe('updated 5 seconds ago');
    expect(formatAge(59_000)).toBe('updated 59 seconds ago');
    expect(formatAge(1_000)).toBe('updated 1 second ago');
    expect(formatAge(0)).toBe('updated just now');
  });

  it('says the minutes in words from a minute', () => {
    expect(formatAge(60_000)).toBe('updated 1 minute ago');
    expect(formatAge(180_000)).toBe('updated 3 minutes ago');
  });
});

describe('formatLastLive', () => {
  it('says how long ago the last live times came in (board 12)', () => {
    expect(formatLastLive(61_000)).toBe('Last live times 1 minute ago');
    expect(formatLastLive(180_000)).toBe('Last live times 3 minutes ago');
    expect(formatLastLive(30_000)).toBe('Last live times 30 seconds ago');
  });
});
