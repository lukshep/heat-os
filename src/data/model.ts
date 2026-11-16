import { DEFAULT_CONFIG, STANDARD_TUNING, type Tuning } from '../heat/config';
import type { DayKey } from '../heat/day';
import type { Schedule } from '../heat/schedule';
import type { WarmthBase } from '../heat/warmth';

export type ID = string;

/** Every record carries these. Deleting means setting `deletedAt`, never removing the record. */
export interface Meta {
  id: ID;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Area extends Meta {
  name: string;
  order: number;
}

export interface Project extends Meta {
  name: string;
  areaId: ID;
  parentId: ID | null;
  order: number;
}

/**
 * A time of day as 'HH:MM' on a 24-hour clock. It is the time on the wall wherever the person
 * is, so it never moves with the time zone.
 */
export type ClockTime = string;

/** True for a time written as 'HH:MM', from 00:00 to 23:59. */
export function isClockTime(value: unknown): value is ClockTime {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export interface Task extends Meta {
  title: string;
  note?: string;
  /** Both null means the task is in the Inbox. */
  areaId: ID | null;
  projectId: ID | null;
  /** Put first in every list it is in, and on Today when it has no date. It earns nothing extra. */
  priority: boolean;
  /** Stars of Friction, 0 to FRICTION_STARS: how hard it is to start. Each one adds to its reward. */
  friction: number;
  /**
   * The day it is planned for, or null. A planned day, not a deadline: once it has passed, the
   * task simply waits on Today until it is done or given another day.
   */
  date: DayKey | null;
  /** A time on that day, or null. A task only has a time when it has a date. */
  time: ClockTime | null;
}

export interface Routine extends Meta {
  title: string;
  areaId: ID;
  projectId: ID | null;
  priority: boolean;
  friction: number;
  /** A time of day it is done at, or null. */
  time: ClockTime | null;
  schedule: Schedule;
  warmthBase: WarmthBase;
}

/**
 * One entry of the activity history: the facts about a completion, never a score.
 * It snapshots everything scoring needs, so editing or deleting the item later
 * leaves past HEAT untouched.
 */
export interface Completion extends Meta {
  at: number;
  dayKey: DayKey;
  itemId: ID;
  kind: 'task' | 'routine';
  areaId: ID | null;
  /**
   * Stars of Friction when completed. A completion from before version 7 carries the stars that
   * earn what its old tags earned: three for Friction, two for Priority, five for both.
   */
  friction: number;
  /** Routine warmth when completed; 0 for tasks. */
  warmth: number;
  /**
   * For a routine, the date it counted for, which can be earlier than `dayKey` when it was done
   * late, or later when a monthly one was done early. Null for a task, and for a routine done
   * before its first date, which earns HEAT but leaves warmth alone.
   */
  occurrence: DayKey | null;
}

/** Tasks set aside from Today's suggestions for the rest of one day. Local to this device. */
export interface Deferred {
  dayKey: DayKey;
  taskIds: ID[];
}

/** A change of Effort or Cooling, and the moment it was made. */
export interface TuningChange extends Tuning {
  at: number;
}

/** The part of the HEAT config a person can set for themselves. */
export interface Settings {
  /** The local hour at which a new day begins. */
  dayStartHour: number;
  /**
   * Every change of Effort and Cooling, oldest first. Before the first, both were Standard;
   * the last is in force now. Each applies from its own moment, so HEAT already earned
   * never moves.
   */
  tuning: TuningChange[];
}

export const DEFAULT_SETTINGS: Settings = {
  dayStartHour: DEFAULT_CONFIG.dayStartHour,
  tuning: [],
};

/** The Effort and Cooling in force now. */
export function currentTuning(settings: Settings): Tuning {
  const last = settings.tuning[settings.tuning.length - 1];
  return last ? { effort: last.effort, cooling: last.cooling } : STANDARD_TUNING;
}

/** How far each setting can go. The day starts somewhere in the small hours. */
export const SETTING_LIMITS = {
  dayStartHour: { min: 0, max: 8, step: 1 },
} as const;

function withinLimits(value: unknown, limits: { min: number; max: number; step: number }, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const stepped = Math.round(value / limits.step) * limits.step;
  return Math.min(limits.max, Math.max(limits.min, stepped));
}

/**
 * Settings with the day start on a step and inside its limits, whatever was asked for, and
 * the changes of Effort and Cooling in the order they were made.
 */
export function normalizeSettings(settings: { dayStartHour?: unknown; tuning?: readonly TuningChange[] }): Settings {
  return {
    dayStartHour: withinLimits(settings.dayStartHour, SETTING_LIMITS.dayStartHour, DEFAULT_SETTINGS.dayStartHour),
    tuning: [...(settings.tuning ?? [])].sort((a, b) => a.at - b.at),
  };
}

export interface AppState {
  schemaVersion: number;
  areas: Record<ID, Area>;
  projects: Record<ID, Project>;
  tasks: Record<ID, Task>;
  routines: Record<ID, Routine>;
  completions: Record<ID, Completion>;
  deferred: Deferred;
  settings: Settings;
  /** When HEAT was last reset to cold, or null if it never has been. Only later completions count. */
  heatResetAt: number | null;
}

/**
 * Bump this, and add a step to `migrate` in storage.ts, whenever the persisted shape changes.
 * Version 2 added `settings`. Version 3 removed the threshold from them, when the line to
 * reach each day was dropped. Version 4 added Effort and Cooling to settings, as dated
 * changes, and the time HEAT was last reset. Version 5 renamed the tags on tasks, routines
 * and completions: `important` became `priority` and `avoided` became `friction`. Version 6
 * gave tasks a date and a time and routines a time, made schedules weekly or monthly, and
 * replaced a completion's `scheduled` with the date it counted for. Version 7 made Friction a
 * number of stars, and took Priority off completions, since it no longer changes a reward.
 */
export const SCHEMA_VERSION = 7;

export const SEED_AREA_NAMES = ['Work', 'Health', 'Home', 'People', 'Growth'];

/** The state a new install starts with: the seed areas and nothing else. */
export function createInitialState(at: number, newId: () => ID): AppState {
  const areas: Record<ID, Area> = {};
  SEED_AREA_NAMES.forEach((name, order) => {
    const id = newId();
    areas[id] = { id, createdAt: at, updatedAt: at, deletedAt: null, name, order };
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    areas,
    projects: {},
    tasks: {},
    routines: {},
    completions: {},
    deferred: { dayKey: '', taskIds: [] },
    settings: DEFAULT_SETTINGS,
    heatResetAt: null,
  };
}
