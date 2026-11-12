import type { HeatConfig } from '../heat/config';
import type { DayKey } from '../heat/day';
import type { Scorable } from '../heat/engine';
import type { Candidate } from '../heat/suggest';
import { isScheduledOn, warmthAt, type WarmthState } from '../heat/warmth';
import type { AppState, Area, Completion, ID, Routine, Task } from './model';

/** The completion log as the engine should see it: undone completions left out. */
export function liveCompletions(state: AppState): Completion[] {
  return Object.values(state.completions).filter((completion) => completion.deletedAt === null);
}

/** Tasks that still need doing, oldest first. "Done" is read from the completion log. */
export function openTasks(state: AppState): Task[] {
  const done = new Set<ID>();
  for (const completion of Object.values(state.completions)) {
    if (completion.kind === 'task' && completion.deletedAt === null) done.add(completion.itemId);
  }
  return Object.values(state.tasks)
    .filter((task) => task.deletedAt === null && !done.has(task.id))
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
}

export function liveRoutines(state: AppState): Routine[] {
  return Object.values(state.routines)
    .filter((routine) => routine.deletedAt === null)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
}

export function liveAreas(state: AppState): Area[] {
  return Object.values(state.areas)
    .filter((area) => area.deletedAt === null)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

/** The items filed under an area, or in the Inbox when `areaId` is null. */
export function inArea<T extends { areaId: ID | null }>(items: readonly T[], areaId: ID | null): T[] {
  return items.filter((item) => item.areaId === areaId);
}

/** Tasks set aside from Today's suggestions. The list only counts on the day it was made. */
export function deferredToday(state: AppState, today: DayKey): ReadonlySet<ID> {
  return new Set(state.deferred.dayKey === today ? state.deferred.taskIds : []);
}

/** For each routine, the days it was completed and the completion that did it. */
export function routineDays(state: AppState): Map<ID, Map<DayKey, ID>> {
  const days = new Map<ID, Map<DayKey, ID>>();
  for (const completion of Object.values(state.completions)) {
    if (completion.kind !== 'routine' || completion.deletedAt !== null) continue;
    const forRoutine = days.get(completion.itemId) ?? new Map<DayKey, ID>();
    forRoutine.set(completion.dayKey, completion.id);
    days.set(completion.itemId, forRoutine);
  }
  return days;
}

/**
 * A routine's warmth at the start of `today`: every scheduled day since its base is settled
 * as kept or missed. Today stays open until it is over.
 */
export function routineWarmth(
  routine: Routine,
  completedDays: ReadonlyMap<DayKey, ID> | undefined,
  today: DayKey,
  config: HeatConfig,
): WarmthState {
  return warmthAt(routine.warmthBase, routine.schedule, new Set(completedDays?.keys()), today, config);
}

/** A task or a routine as the screens list it. Everything a row needs, in one shape. */
export interface ListItem {
  id: ID;
  kind: 'task' | 'routine';
  title: string;
  areaId: ID | null;
  important: boolean;
  avoided: boolean;
  createdAt: number;
  /** Weekdays a routine is due on (0 is Sunday). Empty for a task. */
  days: readonly number[];
  /** Routine warmth right now, which is never shown, only felt through colour. 0 for a task. */
  warmth: number;
  /** A routine scheduled for today. Always false for a task. */
  dueToday: boolean;
  /** For a routine already done today, the completion to undo. Null otherwise. */
  doneCompletionId: ID | null;
}

/** Every routine, then every open task, each oldest first. */
export function listItems(state: AppState, today: DayKey, config: HeatConfig): ListItem[] {
  const completed = routineDays(state);

  const routines = liveRoutines(state).map((routine): ListItem => {
    const days = completed.get(routine.id);
    return {
      id: routine.id,
      kind: 'routine',
      title: routine.title,
      areaId: routine.areaId,
      important: routine.important,
      avoided: routine.avoided,
      createdAt: routine.createdAt,
      days: routine.schedule.days,
      warmth: routineWarmth(routine, days, today, config).warmth,
      dueToday: isScheduledOn(routine.schedule, today),
      doneCompletionId: days?.get(today) ?? null,
    };
  });

  const tasks = openTasks(state).map((task): ListItem => ({
    id: task.id,
    kind: 'task',
    title: task.title,
    areaId: task.areaId,
    important: task.important,
    avoided: task.avoided,
    createdAt: task.createdAt,
    days: [],
    warmth: 0,
    dueToday: false,
    doneCompletionId: null,
  }));

  return [...routines, ...tasks];
}

/** What the engine needs to price an item. */
export function scorable(item: ListItem): Scorable {
  return { areaId: item.areaId, important: item.important, avoided: item.avoided, warmth: item.warmth };
}

export type ItemCandidate = Candidate & { item: ListItem };

export function candidate(item: ListItem): ItemCandidate {
  return { ...scorable(item), id: item.id, createdAt: item.createdAt, item };
}
