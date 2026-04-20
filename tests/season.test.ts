import { describe, it, expect } from 'vitest';
import { currentTheme } from '../src/season';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('currentTheme — boundary dates for every transition', () => {
  it('Jan 1 → new-year', () => expect(currentTheme(d(2026, 1, 1))).toBe('new-year'));
  it('Jan 2 → winter-ski', () => expect(currentTheme(d(2026, 1, 2))).toBe('winter-ski'));
  it('Jan 15 → winter-ski', () => expect(currentTheme(d(2026, 1, 15))).toBe('winter-ski'));
  it('Feb 28 → winter-ski', () => expect(currentTheme(d(2026, 2, 28))).toBe('winter-ski'));
  it('Feb 29 (leap) → winter-ski', () => expect(currentTheme(d(2024, 2, 29))).toBe('winter-ski'));
  it('Mar 1 → world-book-day', () => expect(currentTheme(d(2026, 3, 1))).toBe('world-book-day'));
  it('Mar 10 → world-book-day', () => expect(currentTheme(d(2026, 3, 10))).toBe('world-book-day'));
  it('Mar 11 → easter', () => expect(currentTheme(d(2026, 3, 11))).toBe('easter'));
  it('Apr 15 → easter', () => expect(currentTheme(d(2026, 4, 15))).toBe('easter'));
  it('Apr 16 → spring', () => expect(currentTheme(d(2026, 4, 16))).toBe('spring'));
  it('Jun 20 → spring', () => expect(currentTheme(d(2026, 6, 20))).toBe('spring'));
  it('Jun 21 → summer', () => expect(currentTheme(d(2026, 6, 21))).toBe('summer'));
  it('Sep 21 → summer', () => expect(currentTheme(d(2026, 9, 21))).toBe('summer'));
  it('Sep 22 → autumn', () => expect(currentTheme(d(2026, 9, 22))).toBe('autumn'));
  it('Oct 23 → autumn', () => expect(currentTheme(d(2026, 10, 23))).toBe('autumn'));
  it('Oct 24 → halloween', () => expect(currentTheme(d(2026, 10, 24))).toBe('halloween'));
  it('Oct 31 → halloween', () => expect(currentTheme(d(2026, 10, 31))).toBe('halloween'));
  it('Nov 1 → bonfire', () => expect(currentTheme(d(2026, 11, 1))).toBe('bonfire'));
  it('Nov 10 → bonfire', () => expect(currentTheme(d(2026, 11, 10))).toBe('bonfire'));
  it('Nov 11 → autumn', () => expect(currentTheme(d(2026, 11, 11))).toBe('autumn'));
  it('Nov 30 → autumn', () => expect(currentTheme(d(2026, 11, 30))).toBe('autumn'));
  it('Dec 1 → christmas', () => expect(currentTheme(d(2026, 12, 1))).toBe('christmas'));
  it('Dec 30 → christmas', () => expect(currentTheme(d(2026, 12, 30))).toBe('christmas'));
  it('Dec 31 → new-year', () => expect(currentTheme(d(2026, 12, 31))).toBe('new-year'));
});
