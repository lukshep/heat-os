import type { DayKey } from '../heat/day';
import type { AppState, Area, Completion, ID, Task } from './model';

export type TaskPatch = Partial<Pick<Task, 'title' | 'areaId' | 'important' | 'avoided'>>;

/**
 * Everything that can change the state. Actions carry their own ids, times and day keys,
 * so the reducer stays pure and the same action always produces the same state.
 */
export type Action =
  | { type: 'task/add'; id: ID; at: number; title: string; areaId: ID | null }
  | { type: 'task/update'; id: ID; at: number; patch: TaskPatch }
  | { type: 'task/delete'; id: ID; at: number }
  | { type: 'task/complete'; id: ID; at: number; dayKey: DayKey; taskId: ID }
  | { type: 'completion/undo'; id: ID; at: number }
  | { type: 'area/add'; id: ID; at: number; name: string }
  | { type: 'area/rename'; id: ID; at: number; name: string }
  | { type: 'area/delete'; id: ID; at: number }
  | { type: 'today/defer'; dayKey: DayKey; taskId: ID }
  | { type: 'state/replace'; state: AppState };

function isLive<T extends { deletedAt: number | null }>(record: T | undefined): record is T {
  return record !== undefined && record.deletedAt === null;
}

function hasLiveCompletion(state: AppState, taskId: ID): boolean {
  return Object.values(state.completions).some(
    (completion) => completion.kind === 'task' && completion.itemId === taskId && completion.deletedAt === null,
  );
}

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'task/add': {
      const title = action.title.trim();
      if (!title || state.tasks[action.id]) return state;
      const areaId = action.areaId !== null && isLive(state.areas[action.areaId]) ? action.areaId : null;
      const task: Task = {
        id: action.id,
        createdAt: action.at,
        updatedAt: action.at,
        deletedAt: null,
        title,
        areaId,
        projectId: null,
        important: false,
        avoided: false,
      };
      return { ...state, tasks: { ...state.tasks, [task.id]: task } };
    }

    case 'task/update': {
      const task = state.tasks[action.id];
      if (!isLive(task)) return state;
      const next: Task = { ...task, updatedAt: action.at };
      const { title, areaId, important, avoided } = action.patch;
      if (title !== undefined && title.trim()) next.title = title.trim();
      if (important !== undefined) next.important = important;
      if (avoided !== undefined) next.avoided = avoided;
      if (areaId !== undefined && areaId !== task.areaId && (areaId === null || isLive(state.areas[areaId]))) {
        // Moving between areas leaves any project behind.
        next.areaId = areaId;
        next.projectId = null;
      }
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
      if (!isLive(task) || state.completions[action.id] || hasLiveCompletion(state, task.id)) return state;
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
        important: task.important,
        avoided: task.avoided,
        warmth: 0,
        scheduled: false,
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
      // Its tasks go back to the Inbox. Completions keep the area they were earned in.
      const tasks = { ...state.tasks };
      for (const task of Object.values(state.tasks)) {
        if (task.areaId === area.id && task.deletedAt === null) {
          tasks[task.id] = { ...task, areaId: null, projectId: null, updatedAt: action.at };
        }
      }
      return {
        ...state,
        tasks,
        areas: { ...state.areas, [area.id]: { ...area, updatedAt: action.at, deletedAt: action.at } },
      };
    }

    case 'today/defer': {
      const sameDay = state.deferred.dayKey === action.dayKey;
      const taskIds = sameDay ? state.deferred.taskIds : [];
      if (taskIds.includes(action.taskId)) return state;
      return { ...state, deferred: { dayKey: action.dayKey, taskIds: [...taskIds, action.taskId] } };
    }

    case 'state/replace':
      return action.state;
  }
}
