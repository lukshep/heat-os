import { LAST_DAY, type Schedule } from '../heat/schedule';

/** Weekdays are numbered 0 (Sunday) to 6 (Saturday), as schedules store them. */

interface WeekInfo {
  firstDay: number;
}

type LocaleWithWeek = Intl.Locale & { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo };

/** Weekday numbers in the order the locale starts its week. Monday first when the browser cannot say. */
export function weekdayOrder(locale?: string): number[] {
  let first = 1;
  try {
    const info = new Intl.Locale(locale ?? navigator.language) as LocaleWithWeek;
    first = (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay ?? 1;
  } catch {
    // An unknown locale keeps Monday.
  }
  return Array.from({ length: 7 }, (_, index) => (first + index) % 7);
}

/** 4 January 2026 is a Sunday, so adding the weekday number lands on that weekday. */
const A_SUNDAY = Date.UTC(2026, 0, 4);
const DAY_MS = 86_400_000;

/** A short name for a weekday, in the locale's language. */
export function weekdayName(day: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(A_SUNDAY + day * DAY_MS);
}

/** A weekly routine's days in a few words. */
export function describeDays(days: readonly number[], locale?: string): string {
  const has = (wanted: number[]) => days.length === wanted.length && wanted.every((day) => days.includes(day));
  if (has([0, 1, 2, 3, 4, 5, 6])) return 'Every day';
  if (has([1, 2, 3, 4, 5])) return 'Weekdays';
  if (has([0, 6])) return 'Weekends';
  return weekdayOrder(locale)
    .filter((day) => days.includes(day))
    .map((day) => weekdayName(day, locale))
    .join(', ');
}

const ORDINAL_SUFFIX: Partial<Record<Intl.LDMLPluralRule, string>> = { one: 'st', two: 'nd', few: 'rd' };
const ordinalRule = new Intl.PluralRules('en', { type: 'ordinal' });

/** A day of the month as the app's English names it: 1st, 2nd, 3rd, 11th, 22nd. */
export function ordinal(day: number): string {
  return `${day}${ORDINAL_SUFFIX[ordinalRule.select(day)] ?? 'th'}`;
}

/** A day of a monthly schedule: its ordinal, or "Last day". */
export function monthDayName(day: number): string {
  return day === LAST_DAY ? 'Last day' : ordinal(day);
}

/** How a routine repeats, in a few words. */
export function describeSchedule(schedule: Schedule, locale?: string): string {
  if (schedule.every === 'week') return describeDays(schedule.days, locale);
  return `Monthly · ${[...schedule.days].sort((a, b) => a - b).map(monthDayName).join(', ')}`;
}
