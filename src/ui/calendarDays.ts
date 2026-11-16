import { addDays, daysBetween, daysInMonth, weekdayOf, type DayKey } from '../heat/day';

/** How many days the strip under Today's heading shows. */
export const STRIP_DAYS = 7;

/**
 * The days the strip shows: a week from today, moved on in whole weeks so that it holds the
 * picked day. A day before today is never shown; the strip starts at today at the earliest.
 */
export function stripDays(today: DayKey, picked: DayKey): DayKey[] {
  const weeks = Math.max(0, Math.floor(daysBetween(today, picked) / STRIP_DAYS));
  const start = addDays(today, weeks * STRIP_DAYS);
  return Array.from({ length: STRIP_DAYS }, (_, index) => addDays(start, index));
}

/** The first day of the month holding `day`. A month is named by its first day. */
export function monthOf(day: DayKey): DayKey {
  return `${day.slice(0, 7)}-01`;
}

/** The first day of the month `count` months after the one holding `day`. */
export function addMonths(day: DayKey, count: number): DayKey {
  const index = Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1 + count;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

/**
 * The month grid, row by row from the locale's first weekday: null for each blank before the
 * 1st, then every day of the month.
 */
export function monthCells(month: DayKey, firstWeekday: number): (DayKey | null)[] {
  const first = monthOf(month);
  const blanks = (weekdayOf(first) - firstWeekday + 7) % 7;
  const days = Array.from({ length: daysInMonth(first) }, (_, index) => addDays(first, index));
  return [...Array.from({ length: blanks }, () => null), ...days];
}
