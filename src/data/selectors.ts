import { DEFAULT_CONFIG, STANDARD_TUNING, tuned, type HeatConfig } from '../heat/config';
import type { DayKey } from '../heat/day';
import type { ConfigTimeline, Scorable } from '../heat/engine';
import { occurrenceNow, type Schedule } from '../heat/schedule';
import type { Candidate } from '../heat/suggest';
import { warmthAt, type WarmthState } from '../heat/warmth';
import {
  currentTuning,
  type AppState,
  type Area,
  type ClockTime,
  type Completion,
  type ID,
  type Routine,
  type Settings,
  type Task,
} from './model';

/** The tuned defaults with the person's own day start, before Effort and Cooling. */
function personal(settings: Settings): HeatConfig {
  return { ...DEFAULT_CONFIG, dayStartHour: settings.dayStartHour };
}

/** The HEAT config in force now: the tuned defaults, with the person's own day start, Effort and Cooling. */
export function heatConfig(settings: Settings): HeatConfig {
  return tuned(personal(settings), currentTuning(settings));
}

/**
 * Every config HEAT has been scored under: Standard until the first change of Effort or
 * Cooling, then each change from the moment it was made. This is what the fold replays.
 */
export function heatTimeline(settings: Settings): ConfigTimeline {
  const base = personal(settings);
  return [
    { from: Number.NEGATIVE_INFINITY, config: tuned(base, STANDARD_TUNING) },
    ...settings.tuning.map((change) => ({ from: change.at, config: tuned(base, change) })),
  ];
}

/**
 * The completions HEAT counts: live ones made since the last reset. Earlier ones still say
 * what is done; they just no longer warm anything.
 */
export function heatCompletions(state: AppState): Completion[] {
  const since = state.heatResetAt ?? Number.NEGATIVE_INFINITY;
  return liveCompletions(state).filter((completion) => completion.at > since);
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

/** What a routine's live completions say: the dates they counted for, and the day each was made on. */
export interface RoutineLog {
  /** Dates of its schedule that have been done. */
  kept: ReadonlySet<DayKey>;
  /** The completion made on each day. A routine counts once a day, so there is at most one. */
  byDay: ReadonlyMap<DayKey, ID>;
}

const EMPTY_LOG: RoutineLog = { kept: new Set(), byDay: new Map() };

/** Each routine's live completions, by routine id. */
export function routineLogs(state: AppState): Map<ID, RoutineLog> {
  const logs = new Map<ID, { kept: Set<DayKey>; byDay: Map<DayKey, ID> }>();
  for (const completion of Object.values(state.completions)) {
    if (completion.kind !== 'routine' || completion.deletedAt !== null) continue;
    let log = logs.get(completion.itemId);
    if (!log) {
      log = { kept: new Set(), byDay: new Map() };
      logs.set(completion.itemId, log);
    }
    if (completion.occurrence !== null) log.kept.add(completion.occurrence);
    log.byDay.set(completion.dayKey, completion.id);
  }
  return logs;
}

/** One routine's live completions. */
export function routineLog(state: AppState, routineId: ID): RoutineLog {
  return routineLogs(state).get(routineId) ?? EMPTY_LOG;
}

/**
 * A routine's warmth at the start of `today`. Each date since its base is settled as kept or
 * missed once the next one has come, so the latest stays open and can still be done late.
 */
export function routineWarmth(routine: Routine, log: RoutineLog, today: DayKey, config: HeatConfig): WarmthState {
  return warmthAt(routine.warmthBase, routine.schedule, log.kept, today, config);
}

/** Where a routine stands today: which date completing it would count for, and whether it is done. */
export interface RoutineToday {
  /** The date a completion now would count for, or null when none is open. */
  occurrence: DayKey | null;
  /** Its date has come and it is not done yet, late ones included. */
  due: boolean;
  /** Done for the date it is on now, or already completed today. */
  done: boolean;
  /** The completion made today, if any. */
  todayId: ID | null;
}

export function routineToday(routine: Routine, log: RoutineLog, today: DayKey): RoutineToday {
  const todayId = log.byDay.get(today) ?? null;
  const now = occurrenceNow(routine.schedule, routine.warmthBase.asOf, log.kept, today);
  // Once a day is all a routine can count for, whatever opens next.
  if (todayId !== null || now.kind === 'done') return { occurrence: null, due: false, done: true, todayId };
  if (now.kind === 'waiting') return { occurrence: null, due: false, done: false, todayId };
  return { occurrence: now.occurrence, due: now.due, done: false, todayId };
}

/** A task or a routine as the screens list it. Everything a row needs, in one shape. */
export interface ListItem {
  id: ID;
  kind: 'task' | 'routine';
  title: string;
  areaId: ID | null;
  /** The project it sits in, or null for the top of its area. Never a project that no longer exists. */
  projectId: ID | null;
  priority: boolean;
  friction: boolean;
  createdAt: number;
  /** A task's planned day. Null for an undated task and for a routine. */
  date: DayKey | null;
  time: ClockTime | null;
  /** How a routine repeats. Null for a task. */
  repeat: Schedule | null;
  /** Routine warmth right now, which is never shown, only felt through colour. 0 for a task. */
  warmth: number;
  /** A routine whose date has come and is not done yet, late ones included: it belongs on Today. */
  due: boolean;
  /** For a routine, the date completing it now would count for, or null when none is open. */
  occurrence: DayKey | null;
  /**
   * A routine done for the date it is on now, or already completed today. Always false for a
   * task, since done tasks are not listed.
   */
  done: boolean;
  /**
   * For a routine completed today, the completion its check can take back. An older one is
   * not undone from the list, because that would change HEAT on an earlier day.
   */
  undoId: ID | null;
}

/** Every routine, then every open task, each oldest first. */
export function listItems(state: AppState, today: DayKey, config: HeatConfig): ListItem[] {
  const logs = routineLogs(state);
  // An item pointing at a project that is gone is treated as sitting at the top of its area.
  const projectOf = (record: Task | Routine): ID | null => {
    const project = record.projectId === null ? undefined : state.projects[record.projectId];
    return project && project.deletedAt === null && project.areaId === record.areaId ? project.id : null;
  };

  const routines = liveRoutines(state).map((routine): ListItem => {
    const log = logs.get(routine.id) ?? EMPTY_LOG;
    const now = routineToday(routine, log, today);
    return {
      id: routine.id,
      kind: 'routine',
      title: routine.title,
      areaId: routine.areaId,
      projectId: projectOf(routine),
      priority: routine.priority,
      friction: routine.friction,
      createdAt: routine.createdAt,
      date: null,
      time: routine.time,
      repeat: routine.schedule,
      warmth: routineWarmth(routine, log, today, config).warmth,
      due: now.due,
      occurrence: now.occurrence,
      done: now.done,
      undoId: now.todayId,
    };
  });

  const tasks = openTasks(state).map((task): ListItem => ({
    id: task.id,
    kind: 'task',
    title: task.title,
    areaId: task.areaId,
    projectId: projectOf(task),
    priority: task.priority,
    friction: task.friction,
    createdAt: task.createdAt,
    date: task.date,
    time: task.time,
    repeat: null,
    warmth: 0,
    due: false,
    occurrence: null,
    done: false,
    undoId: null,
  }));

  return [...routines, ...tasks];
}

/** What the engine needs to price an item. */
export function scorable(item: ListItem): Scorable {
  return { areaId: item.areaId, priority: item.priority, friction: item.friction, warmth: item.warmth };
}

export type ItemCandidate = Candidate & { item: ListItem };

export function candidate(item: ListItem): ItemCandidate {
  return { ...scorable(item), id: item.id, createdAt: item.createdAt, item };
}
