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

export interface AppState {
  schemaVersion: number;
  areas: Record<ID, Area>;
  projects: Record<ID, Project>;
  tasks: Record<ID, Task>;
  routines: Record<ID, Routine>;
  completions: Record<ID, Completion>;
  deferred: Deferred;
}

/** Bump this, and add a step to `migrate` in storage.ts, whenever the persisted shape changes. */
export const SCHEMA_VERSION = 1;

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
  };
}
