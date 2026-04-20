export type Theme =
  | 'winter-ski'
  | 'world-book-day'
  | 'easter'
  | 'spring'
  | 'summer'
  | 'autumn'
  | 'halloween'
  | 'bonfire'
  | 'christmas'
  | 'new-year'
  | null;

/**
 * Pick the seasonal theme active on `date`. Specific calendar windows (New Year,
 * Halloween, Bonfire Night, World Book Day) are checked before the broader season
 * ranges so they win inside overlapping periods.
 */
export function currentTheme(date: Date): Theme {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  // Specific calendar windows — take priority over the broader seasons below.
  if ((month === 12 && day === 31) || (month === 1 && day === 1)) return 'new-year';
  if (month === 10 && day >= 24) return 'halloween';
  if (month === 11 && day <= 10) return 'bonfire';
  if (month === 3 && day <= 10) return 'world-book-day';

  // Broader seasonal ranges.
  if (month === 12) return 'christmas';                // Dec 1-30 (Dec 31 handled above)
  if (month === 1 || month === 2) return 'winter-ski';
  if (month === 3 && day >= 11) return 'easter';       // Mar 11-31
  if (month === 4 && day <= 15) return 'easter';       // Apr 1-15
  if (month === 4 && day >= 16) return 'spring';       // Apr 16-30
  if (month === 5) return 'spring';
  if (month === 6 && day <= 20) return 'spring';       // Jun 1-20
  if (month === 6 && day >= 21) return 'summer';       // Jun 21-30
  if (month === 7 || month === 8) return 'summer';
  if (month === 9 && day <= 21) return 'summer';       // Sep 1-21
  if (month === 9 && day >= 22) return 'autumn';       // Sep 22-30
  if (month === 10 && day <= 23) return 'autumn';      // Oct 1-23 (24-31 handled above)
  if (month === 11 && day >= 11) return 'autumn';      // Nov 11-30 (1-10 handled above)

  return null;
}
