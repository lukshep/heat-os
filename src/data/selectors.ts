import type { DayKey } from '../heat/day';
import type { Scorable } from '../heat/engine';
import type { Candidate } from '../heat/suggest';
import type { AppState, Area, Completion, ID, Task } from './model';

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

export function liveAreas(state: AppState): Area[] {
  return Object.values(state.areas)
    .filter((area) => area.deletedAt === null)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

/** Tasks filed under an area, or the Inbox when `areaId` is null. */
export function tasksIn(tasks: readonly Task[], areaId: ID | null): Task[] {
  return tasks.filter((task) => task.areaId === areaId);
}

/** Tasks set aside from Today's suggestions. The list only counts on the day it was made. */
export function deferredToday(state: AppState, today: DayKey): ReadonlySet<ID> {
  return new Set(state.deferred.dayKey === today ? state.deferred.taskIds : []);
}

/** What the engine needs to price a task. Tasks have no warmth; routines will. */
export function scorable(task: Task): Scorable {
  return { areaId: task.areaId, important: task.important, avoided: task.avoided, warmth: 0 };
}

export type TaskCandidate = Candidate & { task: Task };

export function candidate(task: Task): TaskCandidate {
  return { ...scorable(task), id: task.id, createdAt: task.createdAt, task };
}
