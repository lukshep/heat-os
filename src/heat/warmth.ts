import type { HeatConfig } from './config';
import { addDays, type DayKey } from './day';
import { occursOn, type Schedule } from './schedule';

export interface WarmthState {
  /** 0 to 1. */
  warmth: number;
  /** Dates missed in a row. */
  missRun: number;
}

/** Warmth as it stood at the end of `asOf`. Later dates are settled from here. */
export interface WarmthBase extends WarmthState {
  asOf: DayKey;
}

/**
 * A date that was done. It closes a share of the gap to full warmth, so warmth rises quickly
 * at first and levels off below the ceiling of 1.
 */
export function hit(state: WarmthState, config: HeatConfig): WarmthState {
  return { warmth: state.warmth + config.warmthStep * (1 - state.warmth), missRun: 0 };
}

/**
 * A date that closed without being done. It removes a share of the warmth that is left, and
 * that share grows with the square of the misses in a row: one miss is modest, two or three
 * leave the routine cold.
 */
export function miss(state: WarmthState, config: HeatConfig): WarmthState {
  const missRun = state.missRun + 1;
  const share = Math.min(1, config.missStep * missRun * missRun);
  return { warmth: state.warmth * (1 - share), missRun };
}

/**
 * Walks the dates after the base up to `until`. Each is settled once the next one has come:
 * kept if a completion counted for it, missed if not. Returns the warmth and the last date,
 * which is still open.
 */
function walk(
  base: WarmthBase,
  schedule: Schedule,
  kept: ReadonlySet<DayKey>,
  until: DayKey,
  config: HeatConfig,
): { state: WarmthState; open: DayKey | null } {
  let state: WarmthState = { warmth: base.warmth, missRun: base.missRun };
  let open: DayKey | null = null;
  for (let day = addDays(base.asOf, 1); day <= until; day = addDays(day, 1)) {
    if (!occursOn(schedule, day)) continue;
    if (open !== null) state = kept.has(open) ? hit(state, config) : miss(state, config);
    open = day;
  }
  return { state, open };
}

/**
 * Warmth at the start of `today`. A date stays open until the next one comes round, so a
 * routine done late still counts, and a date is only a miss once the next has begun. `kept`
 * holds the dates completions counted for, not the days they were made on. A completion that
 * counted for no date earns HEAT but leaves warmth alone.
 */
export function warmthAt(
  base: WarmthBase,
  schedule: Schedule,
  kept: ReadonlySet<DayKey>,
  today: DayKey,
  config: HeatConfig,
): WarmthState {
  return walk(base, schedule, kept, today, config).state;
}

/**
 * The warmth a routine carries into a new schedule that starts today. Everything settled stays
 * settled. The date still open from before today counts if it was done and is dropped if not,
 * so changing the days never costs a miss.
 */
export function warmthCarriedOver(
  base: WarmthBase,
  schedule: Schedule,
  kept: ReadonlySet<DayKey>,
  today: DayKey,
  config: HeatConfig,
): WarmthState {
  const { state, open } = walk(base, schedule, kept, addDays(today, -1), config);
  return open !== null && kept.has(open) ? hit(state, config) : state;
}
