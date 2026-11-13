import { DEFAULT_CONFIG, type HeatConfig } from '../heat/config';
import type { DayKey } from '../heat/day';
import type { Scorable } from '../heat/engine';
import type { Candidate } from '../heat/suggest';
import { isScheduledOn, warmthAt, type WarmthState } from '../heat/warmth';
import type { AppState, Area, Completion, ID, Routine, Settings, Task } from './model';

/** The HEAT config in force: the tuned defaults, with the person's own day start. */
export function heatConfig(settings: Settings): HeatConfig {
  return { ...DEFAULT_CONFIG, dayStartHour: settings.dayStartHour };
}

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

/** Somewhere an item can live: an area, or a project at any depth inside one. */
export interface Place {
  /** Unique among places: 'area:<id>' or 'project:<id>'. */
  key: string;
  /** The area's own id, or the project's. */
  id: ID;
  areaId: ID;
  /** Null for the top of an area. */
  projectId: ID | null;
  name: string;
  /** 0 for an area, 1 for a project directly in it, and so on. */
  depth: number;
  /** Ids of the places it sits inside, outermost first. */
  ancestors: ID[];
  /** Its full path, for naming it out of context: "Work › Website". */
  label: string;
}

const PATH_SEPARATOR = ' › ';

/**
 * Every area and project as one flat list in reading order: each area, then its projects,
 * each followed by its own. A project whose parent is missing is shown at the top of its
 * area rather than lost.
 */
export function places(state: AppState): Place[] {
  const projects = Object.values(state.projects)
    .filter((project) => project.deletedAt === null)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  const live = new Set(projects.map((project) => project.id));
  const result: Place[] = [];
  const seen = new Set<ID>();

  function addChildren(parent: Place) {
    for (const project of projects) {
      if (project.areaId !== parent.areaId || seen.has(project.id)) continue;
      const parentId = project.parentId !== null && live.has(project.parentId) ? project.parentId : null;
      if (parentId !== parent.projectId) continue;
      seen.add(project.id);
      const place: Place = {
        key: `project:${project.id}`,
        id: project.id,
        areaId: parent.areaId,
        projectId: project.id,
        name: project.name,
        depth: parent.depth + 1,
        ancestors: [...parent.ancestors, parent.id],
        label: parent.label + PATH_SEPARATOR + project.name,
      };
      result.push(place);
      addChildren(place);
    }
  }

  for (const area of liveAreas(state)) {
    const place: Place = {
      key: `area:${area.id}`,
      id: area.id,
      areaId: area.id,
      projectId: null,
      name: area.name,
      depth: 0,
      ancestors: [],
      label: area.name,
    };
    result.push(place);
    addChildren(place);
  }
  return result;
}

/** The items that sit directly in a place, not in the projects inside it. */
export function itemsAt<T extends { areaId: ID | null; projectId: ID | null }>(
  items: readonly T[],
  place: Pick<Place, 'areaId' | 'projectId'>,
): T[] {
  return items.filter((item) => item.areaId === place.areaId && item.projectId === place.projectId);
}

/** The name of where an item lives, for rows shown away from their place. */
export function placeLabel(all: readonly Place[], item: { areaId: ID | null; projectId: ID | null }): string {
  if (item.areaId === null) return 'Inbox';
  const found = all.find((place) => place.areaId === item.areaId && place.projectId === item.projectId);
  return found?.label ?? 'Inbox';
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
  /** The project it sits in, or null for the top of its area. Never a project that no longer exists. */
  projectId: ID | null;
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
  // An item pointing at a project that is gone is treated as sitting at the top of its area.
  const projectOf = (record: Task | Routine): ID | null => {
    const project = record.projectId === null ? undefined : state.projects[record.projectId];
    return project && project.deletedAt === null && project.areaId === record.areaId ? project.id : null;
  };

  const routines = liveRoutines(state).map((routine): ListItem => {
    const days = completed.get(routine.id);
    return {
      id: routine.id,
      kind: 'routine',
      title: routine.title,
      areaId: routine.areaId,
      projectId: projectOf(routine),
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
    projectId: projectOf(task),
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
