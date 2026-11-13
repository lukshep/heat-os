import { DEFAULT_CONFIG, STANDARD_TUNING, type Tuning } from '../heat/config';
import type { DayKey } from '../heat/day';
import type { Schedule, WarmthBase } from '../heat/warmth';

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

export interface Task extends Meta {
  title: string;
  note?: string;
  /** Both null means the task is in the Inbox. */
  areaId: ID | null;
  projectId: ID | null;
  priority: boolean;
  friction: boolean;
}

export interface Routine extends Meta {
  title: string;
  areaId: ID;
  projectId: ID | null;
  priority: boolean;
  friction: boolean;
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
  priority: boolean;
  friction: boolean;
  /** Routine warmth when completed; 0 for tasks. */
  warmth: number;
  /** For a routine, whether this was a scheduled day. */
  scheduled: boolean;
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
 * and completions: `important` became `priority` and `avoided` became `friction`.
 */
export const SCHEMA_VERSION = 5;

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
