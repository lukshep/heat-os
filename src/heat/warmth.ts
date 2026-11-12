import type { HeatConfig } from './config';
import { addDays, weekdayOf, type DayKey } from './day';

export interface Schedule {
  /** Weekdays the routine is due on: 0 is Sunday, 6 is Saturday. */
  days: readonly number[];
}

export interface WarmthState {
  /** 0 to 1. */
  warmth: number;
  /** Scheduled days missed in a row. */
  missRun: number;
}

/** Warmth as it stood at the end of `asOf`. Later days are settled from here. */
export interface WarmthBase extends WarmthState {
  asOf: DayKey;
}

export function isScheduledOn(schedule: Schedule, day: DayKey): boolean {
  return schedule.days.includes(weekdayOf(day));
}

/**
 * A scheduled day that was completed. It closes a share of the gap to full warmth, so
 * warmth rises quickly at first and levels off below the ceiling of 1.
 */
export function hit(state: WarmthState, config: HeatConfig): WarmthState {
  return { warmth: state.warmth + config.warmthStep * (1 - state.warmth), missRun: 0 };
}

/**
 * A scheduled day that passed without a completion. It removes a share of the warmth that
 * is left, and that share grows with the square of the misses in a row: one miss is modest,
 * two or three leave the routine cold.
 */
export function miss(state: WarmthState, config: HeatConfig): WarmthState {
  const missRun = state.missRun + 1;
  const share = Math.min(1, config.missStep * missRun * missRun);
  return { warmth: state.warmth * (1 - share), missRun };
}

/**
 * Warmth at the start of `today`. Every scheduled day after the base and before today is settled
 * as a hit or a miss. Today stays open: it is not a miss until it is over. Unscheduled days are
 * ignored, whether or not the routine was completed on them.
 */
export function warmthAt(
  base: WarmthBase,
  schedule: Schedule,
  completedDays: ReadonlySet<DayKey>,
  today: DayKey,
  config: HeatConfig,
): WarmthState {
  let state: WarmthState = { warmth: base.warmth, missRun: base.missRun };
  for (let day = addDays(base.asOf, 1); day < today; day = addDays(day, 1)) {
    if (!isScheduledOn(schedule, day)) continue;
    state = completedDays.has(day) ? hit(state, config) : miss(state, config);
  }
  return state;
}
