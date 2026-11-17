import { FRICTION_STARS, type Tuning } from '../heat/config';
import { isDayKey, type DayKey } from '../heat/day';
import { LAST_DAY, type Schedule } from '../heat/schedule';
import type { WarmthBase } from '../heat/warmth';
import {
  currentTuning,
  isClockTime,
  normalizeSettings,
  type AppState,
  type Area,
  type Completion,
  type ID,
  type Project,
  type Routine,
  type Settings,
  type Subtask,
  type Task,
} from './model';

/**
 * What can be edited on a task or a routine. To move it, give `projectId` (its area follows)
 * or give `areaId` alone for the top of an area; a null `areaId` is the Inbox. A routine
 * ignores a move to the Inbox: it must have a home.
 *
 * `date` is a task's planned day, and clearing it clears the time too. A time only sticks to a
 * task that has a date. A routine takes a time but never a date.
 */
export type ItemPatch = Partial<
  Pick<Task, 'title' | 'description' | 'areaId' | 'projectId' | 'priority' | 'friction' | 'date' | 'time'>
>;

/**
 * Everything that can change the state. Actions carry their own ids, times and day keys,
 * and anything worked out from the HEAT config, so the reducer stays pure and the same
 * action always produces the same state.
 */
export type Action =
  | {
      type: 'task/add';
      id: ID;
      at: number;
      title: string;
      areaId: ID | null;
      projectId?: ID | null;
      /** A day to plan it for. */
      date?: DayKey | null;
    }
  | { type: 'task/update'; id: ID; at: number; patch: ItemPatch }
  | { type: 'task/delete'; id: ID; at: number }
  | { type: 'task/complete'; id: ID; at: number; dayKey: DayKey; taskId: ID }
  /** Turns a filed task into a routine. It keeps the task's id and time, but not its date. */
  | { type: 'task/makeRoutine'; id: ID; at: number; schedule: Schedule; asOf: DayKey }
  | { type: 'routine/update'; id: ID; at: number; patch: ItemPatch }
  /** Changes the schedule. `warmthBase` is the warmth earned so far, so history is not reinterpreted. */
  | { type: 'routine/setSchedule'; id: ID; at: number; schedule: Schedule; warmthBase: WarmthBase }
  /** Turns a routine back into a one-off task with the same id. */
  | { type: 'routine/makeTask'; id: ID; at: number }
  | { type: 'routine/delete'; id: ID; at: number }
  | {
      type: 'routine/complete';
      id: ID;
      at: number;
      dayKey: DayKey;
      routineId: ID;
      /** The routine's warmth at this moment. */
      warmth: number;
      /** The date it counts for, or null when none is open yet. */
      occurrence: DayKey | null;
    }
  | { type: 'completion/undo'; id: ID; at: number }
  /** Adds a subtask at the end of a task's or a routine's list. `itemId` is the task or routine. */
  | { type: 'subtask/add'; itemId: ID; id: ID; at: number; title: string }
  | { type: 'subtask/rename'; itemId: ID; id: ID; at: number; title: string }
  | { type: 'subtask/delete'; itemId: ID; id: ID; at: number }
  /** Ticks a subtask for a day (see `Subtask.checked`), or unticks it with null. */
  | { type: 'subtask/check'; itemId: ID; id: ID; at: number; checked: DayKey | null }
  | { type: 'area/add'; id: ID; at: number; name: string }
  | { type: 'area/rename'; id: ID; at: number; name: string }
  | { type: 'area/delete'; id: ID; at: number }
  /** Adds a project at the top of an area, or inside `parentId`, whose area it then takes. */
  | { type: 'project/add'; id: ID; at: number; name: string; areaId: ID; parentId: ID | null }
  | { type: 'project/rename'; id: ID; at: number; name: string }
  /** Removes a project. Whatever was in it moves up one level. */
  | { type: 'project/delete'; id: ID; at: number }
  | { type: 'today/defer'; dayKey: DayKey; taskId: ID }
  /** Changes when the day starts. The value is kept on a step and inside its limits. */
  | { type: 'settings/update'; patch: Partial<Pick<Settings, 'dayStartHour'>> }
  /** Sets Effort and Cooling from this moment on. HEAT already earned is not rescored. */
  | { type: 'settings/tune'; at: number; tuning: Tuning }
  /** Starts HEAT again from cold. The completion log is kept; only what comes after counts. */
  | { type: 'heat/reset'; at: number }
  | { type: 'state/replace'; state: AppState };

function isLive<T extends { deletedAt: number | null }>(record: T | undefined): record is T {
  return record !== undefined && record.deletedAt === null;
}

function hasLiveCompletion(
  state: AppState,
  kind: Completion['kind'],
  itemId: ID,
  matches: (completion: Completion) => boolean = () => true,
): boolean {
  return Object.values(state.completions).some(
    (completion) =>
      completion.kind === kind && completion.itemId === itemId && completion.deletedAt === null && matches(completion),
  );
}

/**
 * A schedule as it is stored: whole days inside its range (0 to 6 for weekdays, 1 to 31 for
 * days of the month), each once and in order. Null when no day is left.
 */
function cleanSchedule(schedule: Schedule): Schedule | null {
  const [low, high] = schedule.every === 'week' ? [0, 6] : [1, LAST_DAY];
  const days = [...new Set(schedule.days.filter((day) => Number.isInteger(day) && day >= low && day <= high))].sort(
    (a, b) => a - b,
  );
  if (days.length === 0) return null;
  return schedule.every === 'week' ? { every: 'week', days } : { every: 'month', days };
}

/** A date from an action, or null when it is not a real one. */
const dayOrNull = (value: DayKey | null | undefined): DayKey | null => (isDayKey(value) ? value : null);

interface Home {
  areaId: ID | null;
  projectId: ID | null;
}

/**
 * Where a request wants something to live. A project decides its own area; an area alone
 * means the top of that area; neither means the Inbox. Returns null for a place that does
 * not exist, so a bad request leaves the item where it is.
 */
function resolveHome(state: AppState, areaId: ID | null, projectId: ID | null | undefined): Home | null {
  if (projectId != null) {
    const project = state.projects[projectId];
    return isLive(project) && isLive(state.areas[project.areaId])
      ? { areaId: project.areaId, projectId: project.id }
      : null;
  }
  if (areaId === null) return { areaId: null, projectId: null };
  return isLive(state.areas[areaId]) ? { areaId, projectId: null } : null;
}

/** The move a patch asks for, or null when it asks for none. */
function requestedHome(state: AppState, patch: ItemPatch): Home | null {
  if (patch.projectId != null) return resolveHome(state, null, patch.projectId);
  if (patch.areaId === undefined) return null;
  return resolveHome(state, patch.areaId, null);
}

/**
 * Applies the shared fields of a patch. Returns the same record type it was given. A time that
 * is not a real one is ignored.
 */
function patched<T extends Task | Routine>(record: T, patch: ItemPatch, at: number): T {
  const next = { ...record, updatedAt: at };
  if (patch.title !== undefined && patch.title.trim()) next.title = patch.title.trim();
  // Its lines are kept as written; only space at either end goes.
  if (patch.description !== undefined) next.description = patch.description.trim();
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.friction !== undefined && Number.isFinite(patch.friction)) next.friction = cleanStars(patch.friction);
  if (patch.time === null || isClockTime(patch.time)) next.time = patch.time;
  return next;
}

/** A whole number of stars from none to the most there can be. */
function cleanStars(stars: number): number {
  return Math.min(FRICTION_STARS, Math.max(0, Math.round(stars)));
}

/**
 * Subtasks for an item that has just changed between task and routine. A tick means a different
 * thing on each, so none is kept.
 */
function unticked(subtasks: readonly Subtask[]): Subtask[] {
  return subtasks.map((subtask) => ({ ...subtask, checked: null }));
}

/**
 * Applies `change` to the subtasks of the live task or routine `itemId`; an id is live in at
 * most one of the two. Leaves the state as it is when there is no such item, or when `change`
 * returns null to say the request does not apply.
 */
function withSubtasks(
  state: AppState,
  itemId: ID,
  at: number,
  change: (subtasks: readonly Subtask[]) => Subtask[] | null,
): AppState {
  const task = state.tasks[itemId];
  if (isLive(task)) {
    const subtasks = change(task.subtasks);
    if (subtasks === null) return state;
    return { ...state, tasks: { ...state.tasks, [itemId]: { ...task, subtasks, updatedAt: at } } };
  }
  const routine = state.routines[itemId];
  if (isLive(routine)) {
    const subtasks = change(routine.subtasks);
    if (subtasks === null) return state;
    return { ...state, routines: { ...state.routines, [itemId]: { ...routine, subtasks, updatedAt: at } } };
  }
  return state;
}

/** The list with subtask `id` changed, or null when it has no such subtask. */
function changeSubtask(subtasks: readonly Subtask[], id: ID, change: (subtask: Subtask) => Subtask): Subtask[] | null {
  if (!subtasks.some((subtask) => subtask.id === id)) return null;
  return subtasks.map((subtask) => (subtask.id === id ? change(subtask) : subtask));
}

/** Retires a routine and leaves a one-off task with the same id in `areaId`. */
function demote(state: AppState, routine: Routine, areaId: ID | null, at: number): Pick<AppState, 'tasks' | 'routines'> {
  const task: Task = {
    id: routine.id,
    createdAt: routine.createdAt,
    updatedAt: at,
    deletedAt: null,
    title: routine.title,
    description: routine.description,
    subtasks: unticked(routine.subtasks),
    areaId,
    projectId: areaId === null ? null : routine.projectId,
    priority: routine.priority,
    friction: routine.friction,
    // A task has a time only on a planned day, and a routine leaves no date behind.
    date: null,
    time: null,
  };
  return {
    tasks: { ...state.tasks, [task.id]: task },
    routines: { ...state.routines, [routine.id]: { ...routine, updatedAt: at, deletedAt: at } },
  };
}

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'task/add': {
      const title = action.title.trim();
      if (!title || state.tasks[action.id]) return state;
      // Somewhere that does not exist falls back to the Inbox, so a capture is never lost.
      const home = resolveHome(state, action.areaId, action.projectId) ?? { areaId: null, projectId: null };
      const task: Task = {
        id: action.id,
        createdAt: action.at,
        updatedAt: action.at,
        deletedAt: null,
        title,
        description: '',
        subtasks: [],
        ...home,
        priority: false,
        friction: 0,
        date: dayOrNull(action.date),
        time: null,
      };
      return { ...state, tasks: { ...state.tasks, [task.id]: task } };
    }

    case 'task/update': {
      const task = state.tasks[action.id];
      if (!isLive(task)) return state;
      const next = patched(task, action.patch, action.at);
      const home = requestedHome(state, action.patch);
      if (home) Object.assign(next, home);
      if (action.patch.date === null || isDayKey(action.patch.date)) next.date = action.patch.date;
      // A time belongs to a planned day; with no day, there is no time.
      if (next.date === null) next.time = null;
      return { ...state, tasks: { ...state.tasks, [task.id]: next } };
    }

    case 'task/delete': {
      const task = state.tasks[action.id];
      if (!isLive(task)) return state;
      return {
        ...state,
        tasks: { ...state.tasks, [task.id]: { ...task, updatedAt: action.at, deletedAt: action.at } },
      };
    }

    case 'task/complete': {
      const task = state.tasks[action.taskId];
      if (!isLive(task) || state.completions[action.id] || hasLiveCompletion(state, 'task', task.id)) return state;
      const completion: Completion = {
        id: action.id,
        createdAt: action.at,
        updatedAt: action.at,
        deletedAt: null,
        at: action.at,
        dayKey: action.dayKey,
        itemId: task.id,
        kind: 'task',
        areaId: task.areaId,
        friction: task.friction,
        warmth: 0,
        occurrence: null,
      };
      return { ...state, completions: { ...state.completions, [completion.id]: completion } };
    }

    case 'task/makeRoutine': {
      const task = state.tasks[action.id];
      const schedule = cleanSchedule(action.schedule);
      // A routine needs a home, so an Inbox task has to be filed first.
      if (!isLive(task) || task.areaId === null || schedule === null) return state;
      if (hasLiveCompletion(state, 'task', task.id)) return state;
      const routine: Routine = {
        id: task.id,
        createdAt: task.createdAt,
        updatedAt: action.at,
        deletedAt: null,
        title: task.title,
        description: task.description,
        subtasks: unticked(task.subtasks),
        areaId: task.areaId,
        projectId: task.projectId,
        priority: task.priority,
        friction: task.friction,
        time: task.time,
        schedule,
        warmthBase: { warmth: 0, missRun: 0, asOf: action.asOf },
      };
      return {
        ...state,
        tasks: { ...state.tasks, [task.id]: { ...task, updatedAt: action.at, deletedAt: action.at } },
        routines: { ...state.routines, [routine.id]: routine },
      };
    }

    case 'routine/update': {
      const routine = state.routines[action.id];
      if (!isLive(routine)) return state;
      const next = patched(routine, action.patch, action.at);
      const home = requestedHome(state, action.patch);
      if (home && home.areaId !== null) {
        next.areaId = home.areaId;
        next.projectId = home.projectId;
      }
      return { ...state, routines: { ...state.routines, [routine.id]: next } };
    }

    case 'routine/setSchedule': {
      const routine = state.routines[action.id];
      const schedule = cleanSchedule(action.schedule);
      if (!isLive(routine) || schedule === null) return state;
      const next: Routine = {
        ...routine,
        updatedAt: action.at,
        schedule,
        warmthBase: action.warmthBase,
      };
      return { ...state, routines: { ...state.routines, [routine.id]: next } };
    }

    case 'routine/makeTask': {
      const routine = state.routines[action.id];
      if (!isLive(routine)) return state;
      return { ...state, ...demote(state, routine, routine.areaId, action.at) };
    }

    case 'routine/delete': {
      const routine = state.routines[action.id];
      if (!isLive(routine)) return state;
      return {
        ...state,
        routines: { ...state.routines, [routine.id]: { ...routine, updatedAt: action.at, deletedAt: action.at } },
      };
    }

    case 'routine/complete': {
      const routine = state.routines[action.routineId];
      if (!isLive(routine) || state.completions[action.id]) return state;
      // A routine counts once a day, and each of its dates counts once.
      const { dayKey } = action;
      const occurrence = dayOrNull(action.occurrence);
      const taken = (completion: Completion) =>
        completion.dayKey === dayKey || (occurrence !== null && completion.occurrence === occurrence);
      if (hasLiveCompletion(state, 'routine', routine.id, taken)) return state;
      const completion: Completion = {
        id: action.id,
        createdAt: action.at,
        updatedAt: action.at,
        deletedAt: null,
        at: action.at,
        dayKey: action.dayKey,
        itemId: routine.id,
        kind: 'routine',
        areaId: routine.areaId,
        friction: routine.friction,
        warmth: Math.min(1, Math.max(0, action.warmth)),
        occurrence,
      };
      return { ...state, completions: { ...state.completions, [completion.id]: completion } };
    }

    case 'completion/undo': {
      const completion = state.completions[action.id];
      if (!isLive(completion)) return state;
      return {
        ...state,
        completions: {
          ...state.completions,
          [completion.id]: { ...completion, updatedAt: action.at, deletedAt: action.at },
        },
      };
    }

    case 'subtask/add': {
      const title = action.title.trim();
      if (!title) return state;
      return withSubtasks(state, action.itemId, action.at, (subtasks) =>
        subtasks.some((subtask) => subtask.id === action.id)
          ? null
          : [...subtasks, { id: action.id, title, checked: null }],
      );
    }

    case 'subtask/rename': {
      const title = action.title.trim();
      if (!title) return state;
      return withSubtasks(state, action.itemId, action.at, (subtasks) =>
        changeSubtask(subtasks, action.id, (subtask) => ({ ...subtask, title })),
      );
    }

    case 'subtask/delete':
      return withSubtasks(state, action.itemId, action.at, (subtasks) =>
        subtasks.some((subtask) => subtask.id === action.id)
          ? subtasks.filter((subtask) => subtask.id !== action.id)
          : null,
      );

    case 'subtask/check': {
      const { checked } = action;
      if (checked !== null && !isDayKey(checked)) return state;
      return withSubtasks(state, action.itemId, action.at, (subtasks) =>
        changeSubtask(subtasks, action.id, (subtask) => ({ ...subtask, checked })),
      );
    }

    case 'area/add': {
      const name = action.name.trim();
      if (!name || state.areas[action.id]) return state;
      const order = Math.max(-1, ...Object.values(state.areas).map((area) => area.order)) + 1;
      const area: Area = { id: action.id, createdAt: action.at, updatedAt: action.at, deletedAt: null, name, order };
      return { ...state, areas: { ...state.areas, [area.id]: area } };
    }

    case 'area/rename': {
      const area = state.areas[action.id];
      const name = action.name.trim();
      if (!isLive(area) || !name) return state;
      return { ...state, areas: { ...state.areas, [area.id]: { ...area, name, updatedAt: action.at } } };
    }

    case 'area/delete': {
      const area = state.areas[action.id];
      if (!isLive(area)) return state;
      // Everything in it goes back to the Inbox, and its projects go with it. A routine cannot
      // live in the Inbox, so it becomes a one-off task. Completions keep the area they were earned in.
      let next: AppState = state;
      for (const routine of Object.values(state.routines)) {
        if (routine.areaId === area.id && routine.deletedAt === null) {
          next = { ...next, ...demote(next, routine, null, action.at) };
        }
      }
      const tasks = { ...next.tasks };
      for (const task of Object.values(state.tasks)) {
        if (task.areaId === area.id && task.deletedAt === null) {
          tasks[task.id] = { ...task, areaId: null, projectId: null, updatedAt: action.at };
        }
      }
      const projects = { ...state.projects };
      for (const project of Object.values(state.projects)) {
        if (project.areaId === area.id && project.deletedAt === null) {
          projects[project.id] = { ...project, updatedAt: action.at, deletedAt: action.at };
        }
      }
      return {
        ...next,
        tasks,
        projects,
        areas: { ...state.areas, [area.id]: { ...area, updatedAt: action.at, deletedAt: action.at } },
      };
    }

    case 'project/add': {
      const name = action.name.trim();
      if (!name || state.projects[action.id]) return state;
      const home = resolveHome(state, action.areaId, action.parentId);
      if (!home || home.areaId === null) return state;
      const siblings = Object.values(state.projects).filter(
        (project) => project.areaId === home.areaId && project.parentId === home.projectId,
      );
      const project: Project = {
        id: action.id,
        createdAt: action.at,
        updatedAt: action.at,
        deletedAt: null,
        name,
        areaId: home.areaId,
        parentId: home.projectId,
        order: Math.max(-1, ...siblings.map((sibling) => sibling.order)) + 1,
      };
      return { ...state, projects: { ...state.projects, [project.id]: project } };
    }

    case 'project/rename': {
      const project = state.projects[action.id];
      const name = action.name.trim();
      if (!isLive(project) || !name) return state;
      return {
        ...state,
        projects: { ...state.projects, [project.id]: { ...project, name, updatedAt: action.at } },
      };
    }

    case 'project/delete': {
      const project = state.projects[action.id];
      if (!isLive(project)) return state;
      // Nothing inside is lost: tasks, routines and projects all move up to where this one sat.
      const lift = <T extends Task | Routine>(records: Record<ID, T>): Record<ID, T> => {
        const next = { ...records };
        for (const record of Object.values(records)) {
          if (record.projectId === project.id && record.deletedAt === null) {
            next[record.id] = { ...record, projectId: project.parentId, updatedAt: action.at };
          }
        }
        return next;
      };
      const projects = { ...state.projects };
      for (const child of Object.values(state.projects)) {
        if (child.parentId === project.id && child.deletedAt === null) {
          projects[child.id] = { ...child, parentId: project.parentId, updatedAt: action.at };
        }
      }
      projects[project.id] = { ...project, updatedAt: action.at, deletedAt: action.at };
      return { ...state, projects, tasks: lift(state.tasks), routines: lift(state.routines) };
    }

    case 'today/defer': {
      const sameDay = state.deferred.dayKey === action.dayKey;
      const taskIds = sameDay ? state.deferred.taskIds : [];
      if (taskIds.includes(action.taskId)) return state;
      return { ...state, deferred: { dayKey: action.dayKey, taskIds: [...taskIds, action.taskId] } };
    }

    case 'settings/update': {
      const settings = normalizeSettings({ ...state.settings, ...action.patch });
      return settings.dayStartHour === state.settings.dayStartHour ? state : { ...state, settings };
    }

    case 'settings/tune': {
      const { effort, cooling } = action.tuning;
      const now = currentTuning(state.settings);
      if (effort === now.effort && cooling === now.cooling) return state;
      const tuning = [...state.settings.tuning, { at: action.at, effort, cooling }];
      return { ...state, settings: normalizeSettings({ ...state.settings, tuning }) };
    }

    case 'heat/reset':
      return { ...state, heatResetAt: action.at };

    case 'state/replace':
      return action.state;
  }
}
