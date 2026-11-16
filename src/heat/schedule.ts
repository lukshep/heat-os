import { MONTHLY_EARLY_DAYS } from './config';
import { addDays, dayOfMonth, daysInMonth, weekdayOf, type DayKey } from './day';

/** The day of the month that stands for the last day, whatever the month's length. */
export const LAST_DAY = 31;

/**
 * When a routine is due. Weekly days are 0 (Sunday) to 6 (Saturday). Monthly days are 1 to 31;
 * a day the month does not have falls on its last day, so 31 always means the last day.
 */
export type Schedule =
  | { every: 'week'; days: readonly number[] }
  | { every: 'month'; days: readonly number[] };

/**
 * The longest a valid schedule can go between two dates. A monthly one is due at least once
 * in every month, so no two of its dates are further apart than two months.
 */
const LONGEST_GAP_DAYS = 62;

/** True when the routine is due on `day`. */
export function occursOn(schedule: Schedule, day: DayKey): boolean {
  if (schedule.every === 'week') return schedule.days.includes(weekdayOf(day));
  const date = dayOfMonth(day);
  const length = daysInMonth(day);
  return schedule.days.some((wanted) => Math.min(wanted, length) === date);
}

/** The first date after `after`, or null for a schedule with no days. */
export function nextOccurrence(schedule: Schedule, after: DayKey): DayKey | null {
  for (let step = 1; step <= LONGEST_GAP_DAYS; step++) {
    const day = addDays(after, step);
    if (occursOn(schedule, day)) return day;
  }
  return null;
}

/** The last date on or before `until` and after `after`, or null when there is none. */
export function lastOccurrence(schedule: Schedule, after: DayKey, until: DayKey): DayKey | null {
  for (let step = 0; step <= LONGEST_GAP_DAYS; step++) {
    const day = addDays(until, -step);
    if (day <= after) return null;
    if (occursOn(schedule, day)) return day;
  }
  return null;
}

/**
 * Where a routine stands on `today`:
 * - `open`: it can be done, and the completion counts for `occurrence`. `due` is true from that
 *   date on, late ones included, and false while a monthly one is open early.
 * - `done`: the date it is on now has been done.
 * - `waiting`: nothing is open yet, because its first date since `since` has not come.
 */
export type OccurrenceState =
  | { kind: 'open'; occurrence: DayKey; due: boolean }
  | { kind: 'done'; occurrence: DayKey }
  | { kind: 'waiting' };

/**
 * Each date stays open until the next one comes round, so a routine can be done late. A monthly
 * routine also opens up to MONTHLY_EARLY_DAYS early once the previous date is done, but never
 * before the day after it. Only dates after `since` count; `kept` holds the dates already done.
 */
export function occurrenceNow(
  schedule: Schedule,
  since: DayKey,
  kept: ReadonlySet<DayKey>,
  today: DayKey,
): OccurrenceState {
  const current = lastOccurrence(schedule, since, today);
  if (current !== null && !kept.has(current)) return { kind: 'open', occurrence: current, due: true };

  if (schedule.every === 'month') {
    const next = nextOccurrence(schedule, today);
    if (next !== null) {
      if (kept.has(next)) return { kind: 'done', occurrence: next };
      // The date before `next` may be from before `since`; it still bounds how early `next` opens.
      const previous = lastOccurrence(schedule, addDays(next, -LONGEST_GAP_DAYS - 1), addDays(next, -1));
      const earliest = addDays(next, -MONTHLY_EARLY_DAYS);
      const opens = previous !== null && addDays(previous, 1) > earliest ? addDays(previous, 1) : earliest;
      if (opens <= today) return { kind: 'open', occurrence: next, due: false };
    }
  }

  return current !== null ? { kind: 'done', occurrence: current } : { kind: 'waiting' };
}
