import { daysBetween, weekdayOf, type DayKey } from '../heat/day';
import type { ClockTime } from '../data/model';
import { weekdayName } from './weekdays';

/** Midnight UTC on a day, for formatting. Every formatter here reads it back in UTC. */
function utcOf(day: DayKey, time: ClockTime = '00:00'): number {
  return Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10)),
    Number(time.slice(0, 2)),
    Number(time.slice(3, 5)),
  );
}

/** A time of day the way the device writes one: "9:30" and "21:05", or "9:30 AM". */
export function timeName(time: ClockTime, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
    utcOf('2026-01-01', time),
  );
}

/** How many days ahead a day is still named by its weekday alone. Further than that, a weekday is ambiguous. */
const WEEKDAY_SPAN = 6;

/**
 * A day named from where today stands: Today, Tomorrow, Yesterday, a weekday within the coming
 * week, and otherwise its date, with the year only when it is not this one. Never "overdue".
 */
export function dayName(day: DayKey, today: DayKey, locale?: string): string {
  const ahead = daysBetween(today, day);
  if (ahead === 0) return 'Today';
  if (ahead === 1) return 'Tomorrow';
  if (ahead === -1) return 'Yesterday';
  if (ahead > 1 && ahead <= WEEKDAY_SPAN) return weekdayName(weekdayOf(day), locale);
  return formatDay(day, today, { day: 'numeric', month: 'short' }, locale);
}

/** A day written with the given parts, adding the year only when it is not this one. */
function formatDay(day: DayKey, today: DayKey, parts: Intl.DateTimeFormatOptions, locale?: string): string {
  const year = day.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric';
  return new Intl.DateTimeFormat(locale, { ...parts, year, timeZone: 'UTC' }).format(utcOf(day));
}

/** A day in full, for a heading: "Friday 20 November". */
export function fullDayName(day: DayKey, today: DayKey, locale?: string): string {
  return formatDay(day, today, { weekday: 'long', day: 'numeric', month: 'long' }, locale);
}

/** A day in short, with its date: "Fri 20 Nov". */
export function shortDayName(day: DayKey, today: DayKey, locale?: string): string {
  return formatDay(day, today, { weekday: 'short', day: 'numeric', month: 'short' }, locale);
}

/** A month by name, with its year when it is not this one: "November", "January 2027". */
export function monthName(month: DayKey, today: DayKey, locale?: string): string {
  return formatDay(month, today, { month: 'long' }, locale);
}

/**
 * When a task is planned, or when in the day a routine is done, in a few words: "Fri · 9:30".
 * A list made for one day (`listDay`) leaves that day out and shows only the time. Null when
 * there is nothing to say.
 */
export function describeWhen(
  date: DayKey | null,
  time: ClockTime | null,
  today: DayKey,
  listDay?: DayKey,
  locale?: string,
): string | null {
  const parts: string[] = [];
  if (date !== null && date !== listDay) parts.push(dayName(date, today, locale));
  if (time !== null) parts.push(timeName(time, locale));
  return parts.length > 0 ? parts.join(' · ') : null;
}
