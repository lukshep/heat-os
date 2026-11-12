import { DEFAULT_CONFIG } from '../heat/config';
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
  important: boolean;
  avoided: boolean;
}

export interface Routine extends Meta {
  title: string;
  areaId: ID;
  projectId: ID | null;
  important: boolean;
  avoided: boolean;
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
  important: boolean;
  avoided: boolean;
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

/** The two parts of the HEAT config a person can set for themselves. */
export interface Settings {
  /** Where the line sits on the bar. */
  threshold: number;
  /** The local hour at which a new day begins. */
  dayStartHour: number;
}

export const DEFAULT_SETTINGS: Settings = {
  threshold: DEFAULT_CONFIG.threshold,
  dayStartHour: DEFAULT_CONFIG.dayStartHour,
};

/** How far each setting can go. The line stays on the bar; the day starts somewhere in the small hours. */
export const SETTING_LIMITS = {
  threshold: { min: 20, max: 90, step: 5 },
  dayStartHour: { min: 0, max: 8, step: 1 },
} as const;

function withinLimits(value: unknown, limits: { min: number; max: number; step: number }, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const stepped = Math.round(value / limits.step) * limits.step;
  return Math.min(limits.max, Math.max(limits.min, stepped));
}

/** Settings with every value on a step and inside its limits, whatever was asked for. */
export function normalizeSettings(settings: { threshold?: unknown; dayStartHour?: unknown }): Settings {
  return {
    threshold: withinLimits(settings.threshold, SETTING_LIMITS.threshold, DEFAULT_SETTINGS.threshold),
    dayStartHour: withinLimits(settings.dayStartHour, SETTING_LIMITS.dayStartHour, DEFAULT_SETTINGS.dayStartHour),
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
}

/**
 * Bump this, and add a step to `migrate` in storage.ts, whenever the persisted shape changes.
 * Version 2 added `settings`.
 */
export const SCHEMA_VERSION = 2;

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
  };
}
