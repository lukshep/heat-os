/** A calendar day as 'YYYY-MM-DD'. Keys compare correctly as plain strings. */
export type DayKey = string;

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

function formatKey(utcMs: number): DayKey {
  const date = new Date(utcMs);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseKey(day: DayKey): number {
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
}

/**
 * The day an instant belongs to, on a clock that runs `utcOffsetMinutes` ahead of UTC
 * and whose day begins at `dayStartHour` rather than midnight.
 */
export function dayKeyAt(at: number, dayStartHour: number, utcOffsetMinutes: number): DayKey {
  return formatKey(at + utcOffsetMinutes * 60_000 - dayStartHour * HOUR_MS);
}

export function addDays(day: DayKey, count: number): DayKey {
  return formatKey(parseKey(day) + count * DAY_MS);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((parseKey(to) - parseKey(from)) / DAY_MS);
}

/** 0 is Sunday, 6 is Saturday. */
export function weekdayOf(day: DayKey): number {
  return new Date(parseKey(day)).getUTCDay();
}

/** The day of the month, 1 to 31. */
export function dayOfMonth(day: DayKey): number {
  return Number(day.slice(8, 10));
}

/** How many days the month holding `day` has: 28 to 31. */
export function daysInMonth(day: DayKey): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).getUTCDate();
}

/** True for a real calendar day written as 'YYYY-MM-DD'. Anything read from a file is checked with this. */
export function isDayKey(value: unknown): value is DayKey {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && formatKey(parseKey(value)) === value;
}
